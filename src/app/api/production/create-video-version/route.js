import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function calculateCredits(duration) {
  const baseCredits = 18;
  const durationMultiplier = {
    30: 0.65,
    60: 1,
    90: 1.45,
  };

  const multiplier = durationMultiplier[duration];

  if (!multiplier) {
    throw new Error("Invalid episode duration.");
  }

  return Math.ceil(baseCredits * multiplier);
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        {
          success: false,
          message: "Authentication required.",
        },
        { status: 401 },
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return Response.json(
        {
          success: false,
          message: "Your session is invalid.",
        },
        { status: 401 },
      );
    }

    const body = await request.json();
    const episodeId = body?.episodeId;

    if (!episodeId) {
      return Response.json(
        {
          success: false,
          message: "Episode ID is required.",
        },
        { status: 400 },
      );
    }

    const { data: episode, error: episodeError } = await userClient
      .from("episodes")
      .select(
        "id,user_id,series_id,episode_number,title,duration_seconds,generation_mode,status,storyboard,script,episode_summary,cliffhanger,output_url",
      )
      .eq("id", episodeId)
      .eq("user_id", user.id)
      .single();

    if (episodeError || !episode) {
      return Response.json(
        {
          success: false,
          message: "Episode could not be found.",
        },
        { status: 404 },
      );
    }

    if (!episode.storyboard) {
      return Response.json(
        {
          success: false,
          message: "This episode does not have an approved storyboard.",
        },
        { status: 400 },
      );
    }

    const duration = Number(episode.duration_seconds);
    const creditsRequired = calculateCredits(duration);

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is not configured on the server.",
      );
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { data: activeJobs, error: activeJobsError } = await adminClient
      .from("generation_jobs")
      .select(
        "id,user_id,episode_id,status,credits_required,credits_reserved,generation_type,current_stage,progress,output_url,final_asset_ready,settlement_error,created_at",
      )
      .eq("episode_id", episode.id)
      .eq("user_id", user.id)
      .eq("generation_type", "regeneration")
      .in("status", ["quoted", "reserved", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (activeJobsError) {
      throw activeJobsError;
    }

    if (activeJobs?.length) {
      const existingJob = activeJobs[0];

      if (episode.generation_mode !== "standard") {
        const { error: modeUpdateError } = await adminClient
          .from("episodes")
          .update({
            generation_mode: "standard",
          })
          .eq("id", episode.id)
          .eq("user_id", user.id);

        if (modeUpdateError) {
          throw modeUpdateError;
        }
      }

      return Response.json({
        success: true,
        existing: true,
        job: existingJob,
        creditsRequired: Number(
          existingJob.credits_required || creditsRequired,
        ),
        episode: {
          ...episode,
          generation_mode: "standard",
        },
        previousProductionPreserved: true,
      });
    }

    const { data: job, error: jobError } = await adminClient
      .from("generation_jobs")
      .insert({
        user_id: user.id,
        episode_id: episode.id,
        status: "quoted",
        generation_type: "regeneration",
        estimated_provider_cost_pence: 0,
        credits_required: creditsRequired,
        credits_reserved: 0,
        provider: "runway",
        model: process.env.RUNWAY_VIDEO_MODEL || "gen4.5",
        current_stage: "quoted",
        progress: 0,
      })
      .select()
      .single();

    if (jobError) {
      throw jobError;
    }

    const { error: episodeUpdateError } = await adminClient
      .from("episodes")
      .update({
        generation_mode: "standard",
      })
      .eq("id", episode.id)
      .eq("user_id", user.id);

    if (episodeUpdateError) {
      await adminClient
        .from("generation_jobs")
        .delete()
        .eq("id", job.id)
        .eq("user_id", user.id);

      throw episodeUpdateError;
    }

    return Response.json({
      success: true,
      existing: false,
      job,
      creditsRequired,
      episode: {
        ...episode,
        generation_mode: "standard",
      },
      previousProductionPreserved: true,
    });
  } catch (error) {
    console.error("DramaAI video-version job error:", error);

    return Response.json(
      {
        success: false,
        message:
          error?.message || "Could not create the AI video production.",
      },
      { status: 500 },
    );
  }
}