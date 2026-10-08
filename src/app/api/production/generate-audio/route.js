import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";

import { createClient } from "@supabase/supabase-js";

import { cleanProductionText, createProductionDirectory, removeProductionDirectory, runFFmpeg } from "@/lib/production";

import { speechProviderCostPence } from "@/lib/providerCosts";

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



function normalizeSpeakerName(value) {

  return cleanProductionText(value)

    .replace(/^["'“”]+|["'“”]+$/g, "")

    .replace(/\s+/g, " ")

    .trim();

}



function splitDialogueText(dialogue) {

  const text = cleanProductionText(dialogue);



  if (!text) return [];



  const parts = [];

  const pattern =

    /(?:^|\n)\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{0,50})\s*:\s*([\s\S]*?)(?=(?:\n\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{0,50}\s*:)|$)/g;



  let match;



  while ((match = pattern.exec(text)) !== null) {

    const speaker = normalizeSpeakerName(match[1]);

    const spokenText = cleanProductionText(match[2]);



    if (speaker && spokenText) {

      parts.push({

        type: "dialogue",

        speaker,

        text: spokenText,

      });

    }

  }



  if (parts.length) {

    return parts;

  }



  return [

    {

      type: "dialogue",

      speaker: "Character",

      text,

    },

  ];

}



function createSceneSpeechSegments(scene) {

  const segments = [];



  const narration = cleanProductionText(scene?.narration);



  if (narration && !(Array.isArray(scene?.dialogue_lines) && scene.dialogue_lines.length) && !cleanProductionText(scene?.dialogue)) {

    segments.push({

      type: "narration",

      speaker: "Narrator",

      text: narration,

    });

  }



  const structuredDialogue =

    Array.isArray(scene?.dialogue_lines) && scene.dialogue_lines.length

      ? scene.dialogue_lines

          .map((line) => ({

            type: "dialogue",

            speaker: normalizeSpeakerName(

              line?.speaker || line?.character || "Character",

            ),

            text: cleanProductionText(

              line?.text || line?.dialogue || line?.line,

            ),

          }))

          .filter((line) => line.text)

      : [];



  if (structuredDialogue.length) {

    segments.push(...structuredDialogue);

  } else {

    segments.push(...splitDialogueText(scene?.dialogue));

  }



  return segments;

}



function hashString(value) {

  let hash = 0;



  for (let index = 0; index < value.length; index += 1) {

    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;

  }



  return hash;

}



function chooseCharacterVoice(speaker) {

  const normalized = normalizeSpeakerName(speaker).toLowerCase();



  const knownVoices = {

    ama: "coral",

    kwame: "onyx",

    "nana yaa": "shimmer",

  };



  if (knownVoices[normalized]) {

    return knownVoices[normalized];

  }



  const voices = [

    "alloy",

    "ash",

    "coral",

    "echo",

    "fable",

    "onyx",

    "nova",

    "sage",

    "shimmer",

  ];



  return voices[hashString(normalized || "character") % voices.length];

}



function getSegmentVoice(segment) {

  if (segment.type === "narration") {

    return process.env.OPENAI_NARRATOR_VOICE || "marin";

  }



  return chooseCharacterVoice(segment.speaker);

}



function createSpeechInstructions(segment, scene) {

  const direction = cleanProductionText(scene?.sound_direction);

  const speaker = normalizeSpeakerName(segment?.speaker);



  if (segment.type === "narration") {

    return `

Perform only the narration for a premium short-form television drama.

Use a natural, intimate cinematic storytelling delivery.

The drama may feature British-Ghanaian characters.

Use emotional restraint, tension and realism.

Do not sound like an advertisement.

Do not announce the word narrator.

Do not read character names or stage directions.

Do not perform dialogue that is not contained in the supplied text.

Keep the delivery natural and concise.

Scene direction: ${direction || "Tense, intimate dramatic atmosphere."}

    `.trim();

  }



  return `

You are performing the spoken dialogue of ${speaker || "a character"} in a premium short-form television drama.

Speak only the supplied dialogue.

Do not narrate the scene.

Do not announce the character name.

Do not read stage directions.

Use natural conversational acting rather than audiobook narration.

The production may feature British-Ghanaian characters living in London or Ghana.

Keep the accent natural and believable rather than exaggerated.

React emotionally to the meaning of the line.

Use realistic pauses, tension and conversational rhythm.

Avoid theatrical overacting.

The voice should remain suitable for the same character across future episodes.

Scene direction: ${direction || "Natural dramatic conversation."}

  `.trim();

}



function sanitizeStorageName(value) {

  return String(value || "speaker")

    .toLowerCase()

    .replace(/[^a-z0-9]+/g, "-")

    .replace(/^-+|-+$/g, "")

    .slice(0, 40);

}



async function releaseCredits(userClient, jobId, reason) {

  if (!userClient || !jobId) return;



  try {

    await userClient.rpc("release_generation_credits", {

      p_job_id: jobId,

      p_reason: reason,

    });

  } catch (releaseError) {

    console.error(

      "DramaAI audio credit release error:",

      releaseError,

    );

  }

}



async function hasProviderWork(admin, jobId) {

  const { data, error } = await admin

    .from("generation_assets")

    .select(

      "id, provider, asset_type, provider_cost_pence, status",

    )

    .eq("generation_job_id", jobId)

    .eq("status", "completed");



  if (error) {

    console.error(

      "DramaAI provider-work lookup error:",

      error,

    );



    return true;

  }



  return (data || []).some((asset) => {

    const cost = Number(asset.provider_cost_pence) || 0;



    return (

      cost > 0 ||
        (asset.provider === "openai" && ["image", "audio"].includes(asset.asset_type)) ||

      (asset.provider === "runway" &&

        asset.asset_type === "video")

    );

  });

}



async function recordSettlementPending(

  admin,

  userId,

  jobId,

  message,

) {

  try {

    const { error } = await admin.rpc(

      "record_generation_settlement_error",

      {

        p_job_id: jobId,

        p_user_id: userId,

        p_error: message,

      },

    );



    if (error) {

      console.error(

        "DramaAI settlement error RPC failed:",

        error,

      );



      await admin

        .from("generation_jobs")

        .update({

          current_stage: "settlement_pending",

          settlement_error: message,

        })

        .eq("id", jobId)

        .eq("user_id", userId);

    }

  } catch (error) {

    console.error(

      "DramaAI settlement pending update failed:",

      error,

    );

  }

}



export async function POST(request) {

  let userClient = null;

  let admin = null;

  let jobId = null;

  let authenticatedUserId = null;
  let providerWorkStarted = false;



  try {

    if (!process.env.OPENAI_API_KEY) {

      throw new Error(

        "OpenAI API key is not configured.",

      );

    }



    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {

      throw new Error(

        "Supabase service role key is not configured.",

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

          message:

            "Production job ID is required.",

        },

        { status: 400 },

      );

    }



    const { data: job, error: jobError } =

      await userClient

        .from("generation_jobs")

        .select(

          "id, user_id, episode_id, status, credits_reserved, current_stage",

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

        { status: 404 },

      );

    }



    if (job.status !== "processing") {

      return Response.json(

        {

          success: false,

          message:

            "Scene visuals must be generated before audio production.",

        },

        { status: 400 },

      );

    }



    if (!Number(job.credits_reserved)) {

      return Response.json(

        {

          success: false,

          message:

            "This production job does not have reserved credits.",

        },

        { status: 400 },

      );

    }



    const { data: episode, error: episodeError } =

      await userClient

        .from("episodes")

        .select(

          "id, episode_number, title, storyboard",

        )

        .eq("id", job.episode_id)

        .eq("user_id", user.id)

        .single();



    if (episodeError || !episode) {

      throw new Error(

        "Episode could not be found.",

      );

    }



    const scenes = Array.isArray(

      episode.storyboard?.scenes,

    )

      ? episode.storyboard.scenes

      : [];



    if (!scenes.length) {

      throw new Error(

        "This episode has no storyboard scenes.",

      );

    }



    admin = createAdminClient();



    const { data: visualAssets, error: visualError } =

      await admin

        .from("generation_assets")

        .select("scene_number, asset_type")

        .eq("generation_job_id", job.id)

        .eq("status", "completed")

        .in("asset_type", ["image", "video"]);



    if (visualError) {

      throw visualError;

    }



    const visualSceneNumbers = new Set(

      (visualAssets || []).map((asset) =>

        Number(asset.scene_number),

      ),

    );



    const missingVisuals = scenes.filter(

      (scene, index) => {

        const number =

          Number(scene.scene_number) || index + 1;



        return !visualSceneNumbers.has(number);

      },

    );



    if (missingVisuals.length) {

      throw new Error(

        "All scene visuals must be completed before audio generation.",

      );

    }



    await admin

      .from("generation_jobs")

      .update({

        current_stage: "audio",

        progress: 46,

      })

      .eq("id", job.id)

      .eq("user_id", user.id);



    const speechModel =

      process.env.OPENAI_SPEECH_MODEL ||

      "gpt-4o-mini-tts";



    const audioAssets = [];
    const temporaryDirectory = await createProductionDirectory();
    try {
      for (let index = 0; index < scenes.length; index += 1) {
        const scene = scenes[index];
        const sceneNumber = Number(scene.scene_number) || index + 1;
        const segments = createSceneSpeechSegments(scene);
        if (!segments.length) continue;
        const { data: existing, error: existingError } = await admin.from("generation_assets").select("*").eq("generation_job_id", job.id).eq("scene_number", sceneNumber).eq("asset_type", "audio").eq("status", "completed").maybeSingle();
        if (existingError) throw existingError;
        if (existing) { audioAssets.push(existing); continue; }
        const files = [];
        const speechSegments = [];
        let totalCost = 0;
        for (let i = 0; i < segments.length; i += 1) {
          const segment = segments[i];
          const text = cleanProductionText(segment.text);
          if (!text) continue;
          const voice = getSegmentVoice(segment);
          const speech = await openai.audio.speech.create({ model: speechModel, voice, input: text.slice(0,4096), instructions: createSpeechInstructions(segment, scene), response_format: "mp3", speed: 1 });
          providerWorkStarted = true;
          const buffer = Buffer.from(await speech.arrayBuffer());
          if (!buffer.length) throw new Error(`Scene ${sceneNumber} returned empty speech`);
          const filename = path.join(temporaryDirectory, `scene-${sceneNumber}-${i}.mp3`);
          await fs.writeFile(filename, buffer);
          files.push(filename);
          totalCost += speechProviderCostPence(text.slice(0,4096));
          speechSegments.push({ segment_index: i, speaker: segment.speaker, speech_type: segment.type, speech_text: text, voice });
        }
        if (!files.length) continue;
        const combined = path.join(temporaryDirectory, `scene-${sceneNumber}-combined.mp3`);
        if (files.length === 1) await fs.copyFile(files[0], combined);
        else {
          const args = ["-y"];
          files.forEach((file) => args.push("-i", file));
          const filters = files.map((_,i) => `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`).join(";");
          const labels = files.map((_,i) => `[a${i}]`).join("");
          args.push("-filter_complex", `${filters};${labels}concat=n=${files.length}:v=0:a=1[out]`, "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "160k", combined);
          await runFFmpeg(args);
        }
        const storagePath = `${user.id}/${episode.id}/job-${job.id}/scene-${sceneNumber}-dialogue.mp3`;
        const { error: uploadError } = await admin.storage.from("episode-media").upload(storagePath, await fs.readFile(combined), { contentType: "audio/mpeg", upsert: true });
        if (uploadError) throw uploadError;
        const { data: url } = admin.storage.from("episode-media").getPublicUrl(storagePath);
        const { data: asset, error: assetError } = await admin.from("generation_assets").upsert({
          user_id: user.id, generation_job_id: job.id, episode_id: episode.id, scene_number: sceneNumber,
          asset_type: "audio", provider: "openai", model: speechModel, storage_path: storagePath,
          public_url: url.publicUrl, provider_cost_pence: 0, status: "completed", error_message: null,
          metadata: { segments: speechSegments, segment_count: speechSegments.length, ai_generated_voice: true, character_dialogue: speechSegments.some(x => x.speech_type === "dialogue"), intended_duration_seconds: Math.max(1, Number(scene.duration_seconds) || 5) },
          updated_at: new Date().toISOString(),
        }, { onConflict: "generation_job_id,scene_number,asset_type" }).select().single();
        if (assetError) throw assetError;
        await recordAssetProviderCost(admin, asset.id, totalCost);
        asset.provider_cost_pence = totalCost;
        audioAssets.push(asset);
        await admin.from("generation_jobs").update({ current_stage: "audio", progress: Math.min(65,45 + Math.round(((index+1)/scenes.length)*20)) }).eq("id",job.id).eq("user_id",user.id);
      }
    } finally {
      await removeProductionDirectory(temporaryDirectory);
    }
    await admin

      .from("generation_jobs")

      .update({

        current_stage: "audio_complete",

        progress: 65,

      })

      .eq("id", job.id)

      .eq("user_id", user.id);



    return Response.json({

      success: true,

      jobId: job.id,

      episodeId: episode.id,

      audioCount: audioAssets.length,

      assets: audioAssets,

      progress: 65,

      nextStage: "assembly",

      aiVoiceDisclosure: true,

      characterVoices: true,

    });

  } catch (error) {

    console.error(

      "DramaAI audio production error:",

      error,

    );



    const message =

      error?.message ||

      "Audio production failed.";



    let providerWorkExists = providerWorkStarted;



    if (admin && jobId) {

      providerWorkExists =

        await hasProviderWork(

          admin,

          jobId,

        );

    }



    if (

      providerWorkExists &&

      admin &&

      authenticatedUserId &&

      jobId

    ) {

      await recordSettlementPending(

        admin,

        authenticatedUserId,

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



    await releaseCredits(

      userClient,

      jobId,

      message,

    );



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