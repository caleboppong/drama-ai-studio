import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function createUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
}

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export async function POST(request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not configured.");
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Supabase service role key is not configured."
      );
    }

    const authHeader =
      request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        {
          success: false,
          message: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const token = authHeader.replace(
      "Bearer ",
      ""
    );

    const supabase =
      createUserClient(token);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json(
        {
          success: false,
          message: "Your session is invalid.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const {
      jobId,
      sceneNumber = 1,
    } = body;

    if (!jobId) {
      return Response.json(
        {
          success: false,
          message:
            "Production job ID is required.",
        },
        { status: 400 }
      );
    }

    const { data: job, error: jobError } =
      await supabase
        .from("generation_jobs")
        .select(
          "id, user_id, episode_id, status, credits_required, credits_reserved"
        )
        .eq("id", jobId)
        .eq("user_id", user.id)
        .single();

    if (jobError || !job) {
      return Response.json(
        {
          success: false,
          message:
            "Production job could not be found.",
        },
        { status: 404 }
      );
    }

    if (job.status !== "reserved") {
      return Response.json(
        {
          success: false,
          message:
            "Production credits must be reserved before media generation.",
        },
        { status: 400 }
      );
    }

    const { data: episode, error: episodeError } =
      await supabase
        .from("episodes")
        .select(
          "id, series_id, episode_number, title, storyboard, generation_mode"
        )
        .eq("id", job.episode_id)
        .eq("user_id", user.id)
        .single();

    if (episodeError || !episode) {
      return Response.json(
        {
          success: false,
          message:
            "Episode could not be found.",
        },
        { status: 404 }
      );
    }

    const scenes =
      episode.storyboard?.scenes || [];

    const scene = scenes.find(
      (item) =>
        Number(item.scene_number) ===
        Number(sceneNumber)
    );

    if (!scene) {
      return Response.json(
        {
          success: false,
          message:
            `Scene ${sceneNumber} could not be found.`,
        },
        { status: 404 }
      );
    }

    const admin =
      createAdminClient();

    const { data: existingAsset } =
      await admin
        .from("generation_assets")
        .select(
          "id, public_url, storage_path, model"
        )
        .eq(
          "generation_job_id",
          job.id
        )
        .eq(
          "scene_number",
          Number(sceneNumber)
        )
        .eq("asset_type", "image")
        .maybeSingle();

    if (existingAsset) {
      return Response.json({
        success: true,
        existing: true,
        asset: existingAsset,
      });
    }

    const prompt = `
Create one cinematic vertical drama frame for DramaAI Studio.

SERIES CONTEXT:
The Secret Between Us is a British-Ghanaian relationship, betrayal and mystery drama set primarily in London.

EPISODE:
Episode ${episode.episode_number}: ${episode.title}

SCENE:
${scene.scene_number}

VISUAL:
${scene.visual_prompt}

CAMERA:
${scene.camera_direction || "Cinematic vertical framing."}

PRODUCTION STYLE:
Realistic premium television drama.
Modern London environment.
British-Ghanaian characters where people are visible.
Emotionally tense and mysterious.
Natural cinematic lighting.
High realism.
Consistent recurring-character appearance.
Vertical social-media composition.
No logos.
No watermarks.
No subtitles.
No UI overlays.
No decorative borders.

FACELESS ECONOMY STYLE:
Prefer characters from behind, silhouettes, over-the-shoulder framing, hands, objects, reflections, phones, partially obscured faces and environmental storytelling whenever compatible with the scene.

IMPORTANT:
Do not add text unless the scene specifically requires readable text on a phone or physical object.
Keep the image suitable for later cinematic motion animation.
    `.trim();

    const imageResponse =
      await openai.images.generate({
        model:
          "gpt-image-2.5-flare",
        prompt,
        size: "1024x1536",
        quality: "low",
        output_format: "jpeg",
        output_compression: 85,
      });

    const base64 =
      imageResponse.data?.[0]?.b64_json;

    if (!base64) {
      throw new Error(
        "The image provider returned no image."
      );
    }

    const imageBuffer =
      Buffer.from(base64, "base64");

    const storagePath =
      `${user.id}/${episode.id}/job-${job.id}/scene-${scene.scene_number}.jpg`;

    const { error: uploadError } =
      await admin.storage
        .from("episode-media")
        .upload(
          storagePath,
          imageBuffer,
          {
            contentType: "image/jpeg",
            upsert: false,
          }
        );

    if (uploadError) {
      throw uploadError;
    }

    const {
      data: publicUrlData,
    } = admin.storage
      .from("episode-media")
      .getPublicUrl(storagePath);

    const publicUrl =
      publicUrlData.publicUrl;

    const { data: asset, error: assetError } =
      await admin
        .from("generation_assets")
        .insert({
          user_id: user.id,
          generation_job_id: job.id,
          episode_id: episode.id,
          scene_number:
            Number(scene.scene_number),
          asset_type: "image",
          provider: "openai",
          model:
            "gpt-image-2.5-flare",
          storage_path: storagePath,
          public_url: publicUrl,
          provider_cost_pence: 0,
          metadata: {
            quality: "low",
            size: "1024x1536",
            prompt,
          },
        })
        .select()
        .single();

    if (assetError) {
      await admin.storage
        .from("episode-media")
        .remove([storagePath]);

      throw assetError;
    }

    return Response.json({
      success: true,
      existing: false,
      asset,
    });
  } catch (error) {
    console.error(
      "DramaAI scene generation error:",
      error
    );

    return Response.json(
      {
        success: false,
        message:
          error?.message ||
          "Could not generate this scene.",
      },
      { status: 500 }
    );
  }
}