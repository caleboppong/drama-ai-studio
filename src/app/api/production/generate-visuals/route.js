import OpenAI, { toFile } from "openai";
import { createClient } from "@supabase/supabase-js";
import { cleanProductionText } from "@/lib/production";
import {
  imageProviderCostPence,
  imageProviderCostGbp,
} from "@/lib/providerCosts";
import { recordAssetProviderCost } from "@/lib/productionSettlement";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    },
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
    },
  );
}

function getSceneNumber(scene, index) {
  return Number(scene?.scene_number) || index + 1;
}

function getScenePrompt({
  series,
  episode,
  scene,
  sceneNumber,
  generationMode,
  referenceNames = [],
}) {
  const dialogue = cleanProductionText(scene?.dialogue);
  const narration = cleanProductionText(scene?.narration);
  const visual = cleanProductionText(scene?.visual_prompt);
  const camera = cleanProductionText(scene?.camera_direction);

  const cast = cleanProductionText(
    episode?.storyboard?.character_references ||
      episode?.storyboard?.character_bible ||
      series?.character_bible,
  );

  const faceGuidance =
    generationMode === "economy"
      ? "Use natural cinematic framing. Keep speaking characters' faces and mouths visible where practical."
      : "When dialogue is spoken, show the speaker's unobstructed face and mouth in a front or three-quarter view.";

  return `
Create one cinematic vertical frame for a premium episodic short-form drama.

SERIES
Title: ${series?.title || "DramaAI Original"}
Genre: ${series?.genre || "Drama"}
Description: ${series?.description || ""}

EPISODE
Episode ${episode.episode_number}: ${episode.title}
Summary: ${episode.episode_summary || ""}

SCENE ${sceneNumber}
Visual: ${visual}
Camera: ${camera || "Cinematic vertical composition"}
Narration context: ${narration}
Dialogue context: ${dialogue}

CHARACTER CONTINUITY
Character appearance references:
${cast || "No additional character description supplied."}

Saved character portraits supplied as image inputs:
${referenceNames.join(", ") || "None"}

When reference portraits are supplied, preserve each person's facial identity,
skin tone, hairstyle and established appearance.
Do not redesign or replace established characters.
Use the saved portraits as identity references, not as finished scene layouts.

PRODUCTION FRAMING
${faceGuidance}

VISUAL REQUIREMENTS
Premium realistic television-drama aesthetic.
Natural cinematic lighting.
Believable modern environments.
Strong emotional visual storytelling.
Vertical mobile composition.
Maintain recurring-character appearance and wardrobe continuity.
Maintain location and prop continuity between connected scenes.
Do not add subtitles.
Do not add captions.
Do not add logos.
Do not add watermarks.
Do not add decorative borders.
Do not add random written text.

FRAMING
Use cinematic shot/reverse-shot framing and clear facial expressions.
Do not obscure a speaking character's mouth.
The image must remain suitable for slow cinematic pan and zoom animation.
Only include readable written text when the storyboard explicitly requires it.
`.trim();
}

function sceneCharacterNames(scene, characters) {
  const dialogueLines = Array.isArray(scene?.dialogue_lines)
    ? scene.dialogue_lines
    : [];

  const text = [
    scene?.visual_prompt,
    scene?.camera_direction,
    scene?.dialogue,
    ...dialogueLines.map((line) =>
      typeof line === "string"
        ? line
        : [line?.speaker, line?.character, line?.text].join(" "),
    ),
  ]
    .filter(Boolean)
    .join(" ");

  return characters
    .filter((character) => {
      const escapedName = character.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const pattern = new RegExp(
        `(^|[^\\p{L}])${escapedName}(?=$|[^\\p{L}])`,
        "iu",
      );

      return pattern.test(text);
    })
    .slice(0, 3);
}

async function getReferenceImages(admin, characters) {
  const images = [];

  for (const character of characters) {
    if (!character.portrait_path) {
      throw new Error(
        `Saved portrait for ${character.name} has no storage path.`,
      );
    }

    const { data, error } = await admin.storage
      .from("episode-media")
      .download(character.portrait_path);

    if (error || !data) {
      throw new Error(
        `Could not load saved portrait for ${character.name}: ${
          error?.message || "not found"
        }`,
      );
    }

    const contentType = data.type || "image/jpeg";

    const extension = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";

    const imageFile = await toFile(
      Buffer.from(await data.arrayBuffer()),
      `${character.name.replace(/[^a-z0-9-]/gi, "-")}.${extension}`,
      { type: contentType },
    );

    images.push(imageFile);
  }

  return images;
}

async function releaseCredits(userClient, jobId, reason) {
  if (!userClient || !jobId) return;

  try {
    await userClient.rpc("release_generation_credits", {
      p_job_id: jobId,
      p_reason: reason,
    });
  } catch (releaseError) {
    console.error("DramaAI visual credit release error:", releaseError);
  }
}

export async function POST(request) {
  let userClient = null;
  let jobId = null;
  let admin = null;
  let authenticatedUserId = null;
  let providerWorkStarted = false;

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not configured.");
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase service role key is not configured.");
    }

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
    userClient = createUserClient(token);

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

    authenticatedUserId = user.id;

    const body = await request.json();
    jobId = body.jobId;

    if (!jobId) {
      return Response.json(
        {
          success: false,
          message: "Production job ID is required.",
        },
        { status: 400 },
      );
    }

    const { data: job, error: jobError } = await userClient
      .from("generation_jobs")
      .select(
        "id, user_id, episode_id, status, credits_required, credits_reserved, current_stage",
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

    if (!["reserved", "processing"].includes(job.status)) {
      return Response.json(
        {
          success: false,
          message: "This production is not ready to generate media.",
        },
        { status: 400 },
      );
    }

    if (!Number(job.credits_reserved)) {
      return Response.json(
        {
          success: false,
          message: "This production job does not have reserved credits.",
        },
        { status: 400 },
      );
    }

    if (job.status === "reserved") {
      const { data: started, error: startError } = await userClient.rpc(
        "start_generation_job",
        {
          p_job_id: job.id,
        },
      );

      if (startError) throw startError;

      if (!started) {
        throw new Error("Production could not be started.");
      }
    }

    const { data: episode, error: episodeError } = await userClient
      .from("episodes")
      .select(
        "id, series_id, episode_number, title, episode_summary, storyboard, generation_mode",
      )
      .eq("id", job.episode_id)
      .eq("user_id", user.id)
      .single();

    if (episodeError || !episode) {
      throw new Error("Episode could not be found.");
    }

    const { data: series, error: seriesError } = await userClient
      .from("series")
      .select("id, title, description, genre")
      .eq("id", episode.series_id)
      .eq("user_id", user.id)
      .single();

    if (seriesError || !series) {
      throw new Error("Series could not be found.");
    }

    const scenes = Array.isArray(episode.storyboard?.scenes)
      ? episode.storyboard.scenes
      : [];

    if (!scenes.length) {
      throw new Error("This episode has no approved storyboard scenes.");
    }

    admin = createAdminClient();

    const { data: savedCharacters, error: characterError } = await admin
      .from("drama_characters")
      .select("id, name, portrait_path, voice, series_id")
      .eq("user_id", user.id)
      .eq("series_id", series.id);

    if (characterError) {
      throw characterError;
    }

    const characters = (savedCharacters || []).filter(
      (character) => character.portrait_path,
    );

    const generatedAssets = [];

    const generationMode = ["economy", "standard", "cinematic"].includes(
      episode.generation_mode,
    )
      ? episode.generation_mode
      : "economy";

    const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";

    const referenceImageModel =
      process.env.OPENAI_REFERENCE_IMAGE_MODEL || "gpt-image-1.5";

    const imageSize = process.env.OPENAI_IMAGE_SIZE || "1024x1536";

    const imageQuality = process.env.OPENAI_IMAGE_QUALITY || "low";

    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      const sceneNumber = getSceneNumber(scene, index);

      const { data: existingAsset, error: existingAssetError } = await admin
        .from("generation_assets")
        .select("*")
        .eq("generation_job_id", job.id)
        .eq("scene_number", sceneNumber)
        .eq("asset_type", "image")
        .eq("status", "completed")
        .maybeSingle();

      if (existingAssetError) {
        throw existingAssetError;
      }

      if (existingAsset) {
        generatedAssets.push(existingAsset);

        const progress = Math.min(
          45,
          Math.round(((index + 1) / scenes.length) * 45),
        );

        await admin
          .from("generation_jobs")
          .update({
            current_stage: "scene_visuals",
            progress,
          })
          .eq("id", job.id)
          .eq("user_id", user.id);

        continue;
      }

      const sceneCharacters = sceneCharacterNames(scene, characters);

      const prompt = getScenePrompt({
        series,
        episode,
        scene,
        sceneNumber,
        generationMode,
        referenceNames: sceneCharacters.map((character) => character.name),
      });

      let imageResponse;
      let usedModel;

      if (sceneCharacters.length > 0) {
        const referenceImages = await getReferenceImages(
          admin,
          sceneCharacters,
        );

        const referenceOrder = sceneCharacters
          .map((character, index) => `Image ${index + 1}: ${character.name}`)
          .join("; ");

        usedModel = referenceImageModel;
        providerWorkStarted = true;

        imageResponse = await openai.images.edit({
          model: referenceImageModel,
          image: referenceImages,
          prompt: `${prompt}

REFERENCE IMAGE ORDER:
${referenceOrder}

Create a new cinematic scene composition.
Preserve the identity of each reference person.
Do not simply reproduce the original portrait.`,
          size: imageSize,
          quality: imageQuality,
          output_format: "jpeg",
        });
      } else {
        usedModel = imageModel;
        providerWorkStarted = true;

        imageResponse = await openai.images.generate({
          model: imageModel,
          prompt,
          size: imageSize,
          quality: imageQuality,
          output_format: "jpeg",
          output_compression: 85,
        });
      }

      const base64 = imageResponse.data?.[0]?.b64_json;

      if (!base64) {
        throw new Error(`Scene ${sceneNumber} returned no image.`);
      }

      const imageBuffer = Buffer.from(base64, "base64");

      if (!imageBuffer.length) {
        throw new Error(`Scene ${sceneNumber} returned an empty image.`);
      }

      const storagePath = `${user.id}/${episode.id}/job-${job.id}/scene-${sceneNumber}.jpg`;

      const { error: uploadError } = await admin.storage
        .from("episode-media")
        .upload(storagePath, imageBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = admin.storage
        .from("episode-media")
        .getPublicUrl(storagePath);

      const publicUrl = publicUrlData.publicUrl;

      const assetPayload = {
        user_id: user.id,
        generation_job_id: job.id,
        episode_id: episode.id,
        scene_number: sceneNumber,
        asset_type: "image",
        provider: "openai",
        model: usedModel,
        storage_path: storagePath,
        public_url: publicUrl,
        provider_cost_pence: 0,
        status: "completed",
        error_message: null,
        metadata: {
          character_reference_ids: sceneCharacters.map(
            (character) => character.id,
          ),
          character_reference_names: sceneCharacters.map(
            (character) => character.name,
          ),
          prompt,
          size: imageSize,
          quality: imageQuality,
          duration_seconds: Math.max(1, Number(scene.duration_seconds) || 5),
          ai_generated: true,
        },
        updated_at: new Date().toISOString(),
      };

      const { data: asset, error: assetError } = await admin
        .from("generation_assets")
        .upsert(assetPayload, {
          onConflict: "generation_job_id,scene_number,asset_type",
        })
        .select()
        .single();

      if (assetError) {
        throw assetError;
      }

      const visualProviderCost = imageProviderCostPence();

      const isReferenceImage = sceneCharacters.length > 0;

      const estimatedCostUsd = Number(
        isReferenceImage
          ? process.env.OPENAI_REFERENCE_IMAGE_ESTIMATED_COST_USD
          : process.env.OPENAI_IMAGE_ESTIMATED_COST_USD,
      );

      const usdToGbp = Number(process.env.OPENAI_USD_TO_GBP_RATE);

      const hasValidCostEstimate =
        Number.isFinite(estimatedCostUsd) &&
        estimatedCostUsd >= 0 &&
        Number.isFinite(usdToGbp) &&
        usdToGbp > 0 &&
        (isReferenceImage
          ? process.env.OPENAI_REFERENCE_IMAGE_ESTIMATED_COST_USD !== undefined
          : process.env.OPENAI_IMAGE_ESTIMATED_COST_USD !== undefined);

      const visualProviderCostGbp = hasValidCostEstimate
        ? imageProviderCostGbp({
            estimatedCostUsd,
            usdToGbp,
          })
        : null;

      await recordAssetProviderCost(
        admin,
        asset.id,
        visualProviderCost,
        visualProviderCostGbp,
      );

      asset.provider_cost_pence = visualProviderCost;
      asset.provider_cost_gbp = visualProviderCostGbp;

      generatedAssets.push(asset);

      const progress = Math.min(
        45,
        Math.round(((index + 1) / scenes.length) * 45),
      );

      await admin
        .from("generation_jobs")
        .update({
          current_stage: "scene_visuals",
          progress,
        })
        .eq("id", job.id)
        .eq("user_id", user.id);
    }

    await admin
      .from("generation_jobs")
      .update({
        current_stage: "visuals_complete",
        progress: 45,
      })
      .eq("id", job.id)
      .eq("user_id", user.id);

    return Response.json({
      success: true,
      jobId: job.id,
      episodeId: episode.id,
      sceneCount: generatedAssets.length,
      assets: generatedAssets,
      progress: 45,
      nextStage: "audio",
    });
  } catch (error) {
    console.error("DramaAI visual production error:", error);

    const message = error?.message || "Visual production failed.";

    let providerWorkExists = providerWorkStarted;

    if (admin && jobId) {
      const { data: priorAssets, error: priorError } = await admin
        .from("generation_assets")
        .select("id,asset_type,provider,provider_cost_pence")
        .eq("generation_job_id", jobId)
        .eq("status", "completed");

      if (priorError) {
        providerWorkExists = true;
      } else if (
        (priorAssets || []).some(
          (asset) =>
            Number(asset.provider_cost_pence) > 0 ||
            (asset.provider === "runway" && asset.asset_type === "video") ||
            (asset.provider === "openai" &&
              ["image", "audio"].includes(asset.asset_type)),
        )
      ) {
        providerWorkExists = true;
      }
    }

    if (providerWorkExists || (jobId && !admin)) {
      if (admin && authenticatedUserId && jobId) {
        const { error: pendingError } = await admin
          .from("generation_jobs")
          .update({
            current_stage: "settlement_pending",
            settlement_error: message,
          })
          .eq("id", jobId)
          .eq("user_id", authenticatedUserId);

        if (pendingError) {
          console.error(
            "Could not mark visual settlement pending:",
            pendingError,
          );
        }
      }

      return Response.json(
        {
          success: false,
          message,
          settlementPending: true,
        },
        { status: 500 },
      );
    }

    await releaseCredits(userClient, jobId, message);

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
