import { createClient } from "@supabase/supabase-js";
import { cleanProductionText } from "@/lib/production";

export const runtime = "nodejs";
export const maxDuration = 800;

const BASE = "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";

function userClient(token) {
  return createClient(
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
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function sceneNo(scene, index) {
  return Number(scene?.scene_number) || index + 1;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runwayHeaders() {
  return {
    Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`,
    "Content-Type": "application/json",
    "X-Runway-Version": VERSION,
  };
}

function promptFor(scene) {
  return [
    cleanProductionText(scene?.visual_prompt),
    cleanProductionText(scene?.camera_direction),
    cleanProductionText(scene?.narration),
    cleanProductionText(scene?.dialogue),
    "Realistic premium television drama. Natural human movement. Preserve the people, wardrobe, location, lighting and props from the supplied first frame. Vertical short-form composition. No subtitles, captions, logos, watermarks or added written text.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 3500);
}

async function createTask(imageUrl, promptText, duration) {
  const response = await fetch(`${BASE}/image_to_video`, {
    method: "POST",
    headers: runwayHeaders(),
    body: JSON.stringify({
      model: process.env.RUNWAY_VIDEO_MODEL || "gen4.5",
      promptImage: imageUrl,
      promptText,
      ratio: "720:1280",
      duration,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result?.id) {
    throw new Error(
      result?.error ||
        result?.message ||
        "Runway could not start the video task.",
    );
  }

  return result.id;
}

async function waitTask(id) {
  const deadline = Date.now() + 10 * 60 * 1000;

  while (Date.now() < deadline) {
    await sleep(5500);

    const response = await fetch(`${BASE}/tasks/${id}`, {
      headers: runwayHeaders(),
      cache: "no-store",
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result?.error ||
          result?.message ||
          "Runway task status could not be retrieved.",
      );
    }

    if (result.status === "SUCCEEDED") {
      if (!result.output?.[0]) {
        throw new Error("Runway completed without a video output.");
      }

      return result;
    }

    if (["FAILED", "CANCELED"].includes(result.status)) {
      throw new Error(
        result.failure ||
          result.failureCode ||
          `Runway task ${result.status.toLowerCase()}.`,
      );
    }
  }

  throw new Error(
    "Runway video generation timed out. The provider task may still be running.",
  );
}

async function releaseCredits(client, jobId, reason) {
  if (!client || !jobId) return;

  try {
    await client.rpc("release_generation_credits", {
      p_job_id: jobId,
      p_reason: reason,
    });
  } catch (error) {
    console.error("DramaAI video credit release error:", error);
  }
}

async function markSettlementPending(admin, userId, jobId, message) {
  if (!admin || !userId || !jobId) return;

  try {
    await admin
      .from("generation_jobs")
      .update({
        current_stage: "settlement_pending",
        settlement_error: message,
      })
      .eq("id", jobId)
      .eq("user_id", userId);
  } catch (error) {
    console.error("DramaAI settlement pending update error:", error);
  }
}

export async function POST(request) {
  let client = null;
  let admin = null;
  let userId = null;
  let jobId = null;
  let providerWorkStarted = false;

  try {
    if (!process.env.RUNWAYML_API_SECRET) {
      throw new Error("Runway API secret is not configured.");
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase service role key is not configured.");
    }

    const auth = request.headers.get("authorization");

    if (!auth?.startsWith("Bearer ")) {
      return Response.json(
        {
          success: false,
          message: "Authentication required.",
        },
        { status: 401 },
      );
    }

    const token = auth.replace("Bearer ", "");
    client = userClient(token);

    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser(token);

    if (userError || !user) {
      return Response.json(
        {
          success: false,
          message: "Your session is invalid.",
        },
        { status: 401 },
      );
    }

    userId = user.id;

    const body = await request.json();
    jobId = body?.jobId;

    if (!jobId) {
      return Response.json(
        {
          success: false,
          message: "Production job ID is required.",
        },
        { status: 400 },
      );
    }

    const { data: job, error: jobError } = await client
      .from("generation_jobs")
      .select(
        "id,user_id,episode_id,status,credits_reserved,generation_type,provider,model",
      )
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      return Response.json(
        {
          success: false,
          message: "Production job could not be found.",
        },
        { status: 404 },
      );
    }

    if (job.status !== "processing" || !Number(job.credits_reserved)) {
      return Response.json(
        {
          success: false,
          message: "This production is not ready for AI video generation.",
        },
        { status: 400 },
      );
    }

    const { data: episode, error: episodeError } = await client
      .from("episodes")
      .select("id,episode_number,title,storyboard,generation_mode")
      .eq("id", job.episode_id)
      .eq("user_id", user.id)
      .single();

    if (episodeError || !episode) {
      throw new Error("Episode could not be found.");
    }

    const shouldGenerateVideo =
      job.provider === "runway" ||
      job.generation_type === "regeneration" ||
      ["standard", "cinematic"].includes(episode.generation_mode);

    if (!shouldGenerateVideo) {
      return Response.json({
        success: true,
        skipped: true,
        assets: [],
        progress: 45,
        nextStage: "audio",
      });
    }

    const scenes = Array.isArray(episode.storyboard?.scenes)
      ? episode.storyboard.scenes
      : [];

    if (!scenes.length) {
      throw new Error("This episode has no approved storyboard scenes.");
    }

    admin = adminClient();

    const assets = [];
    const model = process.env.RUNWAY_VIDEO_MODEL || "gen4.5";
    const duration =
      Number(process.env.RUNWAY_VIDEO_DURATION_SECONDS) === 10 ? 10 : 5;

    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      const number = sceneNo(scene, index);

      const { data: existing, error: existingError } = await admin
        .from("generation_assets")
        .select("*")
        .eq("generation_job_id", job.id)
        .eq("scene_number", number)
        .eq("asset_type", "video")
        .eq("status", "completed")
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        assets.push(existing);
        continue;
      }

      const { data: image, error: imageError } = await admin
        .from("generation_assets")
        .select("*")
        .eq("generation_job_id", job.id)
        .eq("scene_number", number)
        .eq("asset_type", "image")
        .eq("status", "completed")
        .single();

      if (imageError || !image?.public_url) {
        throw new Error(`Scene ${number} is missing its continuity image.`);
      }

      const prompt = promptFor(scene);

      const taskId = await createTask(
        image.public_url,
        prompt,
        duration,
      );

      providerWorkStarted = true;

      await admin
        .from("generation_jobs")
        .update({
          current_stage: "ai_video",
          progress: 45 + Math.round((index / scenes.length) * 15),
        })
        .eq("id", job.id)
        .eq("user_id", user.id);

      const task = await waitTask(taskId);

      const media = await fetch(task.output[0]);

      if (!media.ok) {
        throw new Error(
          `Scene ${number} video could not be downloaded from Runway.`,
        );
      }

      const buffer = Buffer.from(await media.arrayBuffer());

      if (!buffer.length) {
        throw new Error(`Scene ${number} returned an empty video.`);
      }

      const storagePath =
        `${user.id}/${episode.id}/job-${job.id}/` +
        `scene-${number}-runway.mp4`;

      const { error: uploadError } = await admin.storage
        .from("episode-media")
        .upload(storagePath, buffer, {
          contentType: "video/mp4",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: url } = admin.storage
        .from("episode-media")
        .getPublicUrl(storagePath);

      const payload = {
        user_id: user.id,
        generation_job_id: job.id,
        episode_id: episode.id,
        scene_number: number,
        asset_type: "video",
        provider: "runway",
        model,
        storage_path: storagePath,
        public_url: url.publicUrl,
        provider_cost_pence: 0,
        status: "completed",
        error_message: null,
        metadata: {
          runway_task_id: taskId,
          prompt,
          source_image_asset_id: image.id,
          generated_clip_seconds: duration,
          ai_generated: true,
        },
        updated_at: new Date().toISOString(),
      };

      const { data: asset, error: assetError } = await admin
        .from("generation_assets")
        .upsert(payload, {
          onConflict: "generation_job_id,scene_number,asset_type",
        })
        .select()
        .single();

      if (assetError) throw assetError;

      assets.push(asset);

      await admin
        .from("generation_jobs")
        .update({
          current_stage: "ai_video",
          progress:
            45 + Math.round(((index + 1) / scenes.length) * 15),
        })
        .eq("id", job.id)
        .eq("user_id", user.id);
    }

    await admin
      .from("generation_jobs")
      .update({
        current_stage: "video_complete",
        progress: 60,
        settlement_error: null,
      })
      .eq("id", job.id)
      .eq("user_id", user.id);

    return Response.json({
      success: true,
      jobId: job.id,
      episodeId: episode.id,
      assets,
      progress: 60,
      nextStage: "audio",
    });
  } catch (error) {
    console.error("DramaAI AI video production error:", error);

    const message =
      error?.message || "AI video production failed.";

    if (providerWorkStarted) {
      await markSettlementPending(
        admin,
        userId,
        jobId,
        message,
      );

      return Response.json(
        {
          success: false,
          message,
          settlementPending: true,
        },
        { status: 500 },
      );
    }

    await releaseCredits(client, jobId, message);

    return Response.json(
      {
        success: false,
        message,
        settlementPending: false,
      },
      { status: 500 },
    );
  }
}