import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function calculateCredits(mode, duration) {
  const baseCredits = { economy: 10, standard: 18, cinematic: 35 };
  const durationMultiplier = { 30: 0.65, 60: 1, 90: 1.45 };
  const base = baseCredits[mode];
  const multiplier = durationMultiplier[duration];
  if (!base || !multiplier) throw new Error("Invalid production settings.");
  return Math.ceil(base * multiplier);
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ success: false, message: "Authentication required." }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ success: false, message: "Your session is invalid." }, { status: 401 });
    }
    const { episodeId } = await request.json();
    if (!episodeId) {
      return Response.json({ success: false, message: "Episode ID is required." }, { status: 400 });
    }
    const { data: episode, error: episodeError } = await supabase
      .from("episodes")
      .select("id,user_id,series_id,episode_number,title,duration_seconds,generation_mode,status,storyboard")
      .eq("id", episodeId)
      .eq("user_id", user.id)
      .single();
    if (episodeError || !episode) {
      return Response.json({ success: false, message: "Episode could not be found." }, { status: 404 });
    }
    const creditsRequired = calculateCredits(episode.generation_mode, episode.duration_seconds);
    const { data: existingJobs, error: existingError } = await supabase
      .from("generation_jobs")
      .select("id,episode_id,status,credits_required,credits_reserved,current_stage,progress,output_url,final_asset_ready,settlement_error,created_at")
      .eq("episode_id", episode.id)
      .eq("user_id", user.id)
      .in("status", ["quoted", "reserved", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (existingError) throw existingError;
    if (existingJobs?.length) {
      return Response.json({
        success: true,
        existing: true,
        job: existingJobs[0],
        creditsRequired: Number(existingJobs[0].credits_required || creditsRequired),
        episode,
      });
    }
    if (episode.status !== "storyboard_ready") {
      return Response.json(
        { success: false, message: "This episode is not ready for a new production." },
        { status: 400 }
      );
    }
    if (!episode.storyboard) {
      return Response.json(
        { success: false, message: "This episode does not have an approved storyboard." },
        { status: 400 }
      );
    }
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .insert({
        user_id: user.id,
        episode_id: episode.id,
        status: "quoted",
        estimated_provider_cost_pence: 0,
        credits_required: creditsRequired,
        credits_reserved: 0,
        provider: null,
        model: null,
        current_stage: "quoted",
        progress: 0,
      })
      .select()
      .single();
    if (jobError) throw jobError;
    return Response.json({ success: true, existing: false, job, creditsRequired, episode });
  } catch (error) {
    console.error("DramaAI production job error:", error);
    return Response.json(
      { success: false, message: error?.message || "Could not create the production job." },
      { status: 500 }
    );
  }
}
