import fs from "fs/promises";

import path from "path";

import { createClient } from "@supabase/supabase-js";

import {
  createProductionDirectory,
  removeProductionDirectory,
  downloadAsset,
  runFFmpeg,
  createWebVtt,
  escapeFFmpegSubtitlePath,
  escapeConcatPath,
} from "@/lib/production";

export const runtime = "nodejs";

export const maxDuration = 300;

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

async function releaseCredits(userClient, jobId, reason) {
  if (!userClient || !jobId) return;

  try {
    await userClient.rpc("release_generation_credits", {
      p_job_id: jobId,

      p_reason: reason,
    });
  } catch (releaseError) {
    console.error("DramaAI render credit release error:", releaseError);
  }
}

export async function POST(request) {
  let directory = null;

  let userClient = null;

  let jobId = null;

  let settlementCompleted = false;

  let finalAssetReady = false;
  let admin = null;

  try {
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

      .select("id, user_id, episode_id, status, credits_reserved, output_url")

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

    if (job.status === "completed" && job.output_url) {
      return Response.json({
        success: true,

        existing: true,

        jobId: job.id,

        episodeId: job.episode_id,

        outputUrl: job.output_url,

        progress: 100,

        status: "completed",
      });
    }

    if (job.status !== "processing") {
      return Response.json(
        {
          success: false,

          message: "Production is not ready for final rendering.",
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

    const { data: episode, error: episodeError } = await userClient

      .from("episodes")

      .select(
        "id, episode_number, title, storyboard, duration_seconds, generation_mode",
      )

      .eq("id", job.episode_id)

      .eq("user_id", user.id)

      .single();

    if (episodeError || !episode) {
      throw new Error("Episode could not be found.");
    }

    const scenes = Array.isArray(episode.storyboard?.scenes)
      ? episode.storyboard.scenes
      : [];

    if (!scenes.length) {
      throw new Error("The episode has no storyboard scenes.");
    }

    admin = createAdminClient();

    const { data: assets, error: assetError } = await admin

      .from("generation_assets")

      .select("*")

      .eq("generation_job_id", job.id)

      .eq("status", "completed");

    if (assetError) throw assetError;

    const imageAssets = (assets || []).filter(
      (asset) => asset.asset_type === "image",
    );

    const videoAssets = (assets || []).filter(
      (asset) => asset.asset_type === "video",
    );

    const audioAssets = (assets || []).filter(
      (asset) => asset.asset_type === "audio",
    );

    const existingFinalAsset = (assets || []).find(
      (asset) => asset.asset_type === "final_video",
    );

    if (existingFinalAsset?.public_url) {
      finalAssetReady = true;

      const { data: finalReady, error: finalReadyError } = await userClient.rpc(
        "mark_generation_final_asset_ready",
        {
          p_job_id: job.id,

          p_output_url: existingFinalAsset.public_url,
        },
      );

      if (finalReadyError || finalReady !== true) {
        throw finalReadyError || new Error("Unable to mark final video ready.");
      }

      const { data: completed, error: completeError } = await userClient.rpc(
        "complete_generation_job",
        {
          p_job_id: job.id,

          p_output_url: existingFinalAsset.public_url,
        },
      );

      if (completeError) throw completeError;

      if (!completed) {
        throw new Error(
          "The final video exists but production settlement could not be completed.",
        );
      }

      settlementCompleted = true;

      return Response.json({
        success: true,

        existing: true,

        jobId: job.id,

        episodeId: episode.id,

        outputUrl: existingFinalAsset.public_url,

        asset: existingFinalAsset,

        progress: 100,

        status: "completed",
      });
    }

    for (let index = 0; index < scenes.length; index += 1) {
      const number = getSceneNumber(scenes[index], index);

      const hasImage = imageAssets.some(
        (asset) => Number(asset.scene_number) === number,
      );

      const hasVideo = videoAssets.some(
        (asset) => Number(asset.scene_number) === number,
      );

      if (!hasImage && !hasVideo) {
        throw new Error(`Scene ${number} is missing its visual.`);
      }
    }

    await admin

      .from("generation_jobs")

      .update({
        current_stage: "rendering",

        progress: 66,
      })

      .eq("id", job.id)

      .eq("user_id", user.id);

    directory = await createProductionDirectory();

    const renderedScenes = [];

    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];

      const number = getSceneNumber(scene, index);

      const duration = Math.max(
        1,

        Number(scene.duration_seconds) || 5,
      );

      const imageAsset = imageAssets.find(
        (asset) => Number(asset.scene_number) === number,
      );

      const videoAsset = videoAssets.find(
        (asset) => Number(asset.scene_number) === number,
      );

      const sceneAudioAssets = audioAssets
        .filter((asset) => Number(asset.scene_number) === number)
        .sort((a, b) => {
          const aIndex = Number(a.metadata?.segment_index);
          const bIndex = Number(b.metadata?.segment_index);
          return (
            (Number.isFinite(aIndex) ? aIndex : 0) -
            (Number.isFinite(bIndex) ? bIndex : 0)
          );
        });

      const imagePath = path.join(directory, `scene-${number}.jpg`);
      const videoPath = path.join(directory, `scene-${number}-source.mp4`);
      const audioPath = path.join(directory, `scene-${number}.mp3`);
      const scenePath = path.join(directory, `rendered-${number}.mp4`);

      if (videoAsset?.public_url) {
        await downloadAsset(videoAsset.public_url, videoPath);
      } else {
        await downloadAsset(imageAsset.public_url, imagePath);
      }

      if (sceneAudioAssets.length === 1) {
        await downloadAsset(sceneAudioAssets[0].public_url, audioPath);
      } else if (sceneAudioAssets.length > 1) {
        const audioFiles = [];
        for (
          let audioIndex = 0;
          audioIndex < sceneAudioAssets.length;
          audioIndex += 1
        ) {
          const segmentPath = path.join(
            directory,
            `scene-${number}-audio-${audioIndex + 1}.mp3`,
          );
          await downloadAsset(
            sceneAudioAssets[audioIndex].public_url,
            segmentPath,
          );
          audioFiles.push(segmentPath);
        }
        const audioConcatFile = path.join(
          directory,
          `scene-${number}-audio.txt`,
        );
        const audioConcatContent = audioFiles
          .map((file) => `file '${escapeConcatPath(file)}'`)
          .join("\n");
        await fs.writeFile(audioConcatFile, audioConcatContent, "utf8");
        await runFFmpeg([
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          audioConcatFile,
          "-vn",
          "-c:a",
          "libmp3lame",
          "-ar",
          "48000",
          "-ac",
          "2",
          audioPath,
        ]);
      }

      const frames = Math.max(30, Math.round(duration * 30));

      const videoFilter =
        `scale=1200:2134:force_original_aspect_ratio=increase,` +
        `crop=1080:1920,` +
        `zoompan=z='min(zoom+0.0008,1.08)':` +
        `x='iw/2-(iw/zoom/2)':` +
        `y='ih/2-(ih/zoom/2)':` +
        `d=${frames}:s=1080x1920:fps=30,` +
        `format=yuv420p`;

      const args = videoAsset?.public_url
        ? ["-y", "-stream_loop", "-1", "-i", videoPath]
        : ["-y", "-loop", "1", "-framerate", "30", "-i", imagePath];

      if (sceneAudioAssets.length) {
        args.push("-i", audioPath);
      } else {
        args.push(
          "-f",

          "lavfi",

          "-i",

          "anullsrc=channel_layout=stereo:sample_rate=48000",
        );
      }

      const audioFilter =
        "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad";

      const activeVideoFilter = videoAsset?.public_url
        ? "scale=1200:2134:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p"
        : videoFilter;

      args.push(
        "-vf",
        activeVideoFilter,
        "-af",
        audioFilter,
        "-t",
        String(duration),
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        scenePath,
      );

      await runFFmpeg(args);

      renderedScenes.push(scenePath);

      const renderProgress =
        65 + Math.round(((index + 1) / scenes.length) * 15);

      await admin

        .from("generation_jobs")

        .update({
          current_stage: "cinematic_motion",

          progress: Math.min(renderProgress, 80),
        })

        .eq("id", job.id)

        .eq("user_id", user.id);
    }

    const concatFile = path.join(directory, "scenes.txt");

    const concatContent = renderedScenes

      .map((file) => `file '${escapeConcatPath(file)}'`)

      .join("\n");

    await fs.writeFile(concatFile, concatContent, "utf8");

    const joinedVideo = path.join(directory, "joined.mp4");

    await runFFmpeg([
      "-y",

      "-f",

      "concat",

      "-safe",

      "0",

      "-i",

      concatFile,

      "-c:v",

      "libx264",

      "-preset",

      "medium",

      "-crf",

      "20",

      "-c:a",

      "aac",

      "-ar",

      "48000",

      "-ac",

      "2",

      "-b:a",

      "160k",

      "-pix_fmt",

      "yuv420p",

      "-movflags",

      "+faststart",

      joinedVideo,
    ]);

    const requestedFinalAudioAdvance = Number(
      process.env.PRODUCTION_AUDIO_ADVANCE_SECONDS || 0,
    );

    const finalAudioAdvance = Number.isFinite(requestedFinalAudioAdvance)
      ? Math.max(0, Math.min(3, requestedFinalAudioAdvance))
      : 0;

    if (finalAudioAdvance > 0) {
      const synchronizedVideo = path.join(directory, "joined-synchronized.mp4");

      await runFFmpeg([
        "-y",
        "-i",
        joinedVideo,
        "-af",
        `atrim=start=${finalAudioAdvance},asetpts=PTS-STARTPTS,apad`,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        String(
          scenes.reduce(
            (total, scene) =>
              total + Math.max(1, Number(scene.duration_seconds) || 5),
            0,
          ),
        ),
        "-movflags",
        "+faststart",
        synchronizedVideo,
      ]);

      await fs.copyFile(synchronizedVideo, joinedVideo);
    }

    await admin

      .from("generation_jobs")

      .update({
        current_stage: "captions",

        progress: 85,
      })

      .eq("id", job.id)

      .eq("user_id", user.id);

    const subtitlePath = path.join(directory, "captions.vtt");

    const subtitleContent = createWebVtt(scenes);

    await fs.writeFile(subtitlePath, subtitleContent, "utf8");

    const finalVideo = path.join(directory, "final.mp4");

    const escapedSubtitlePath = escapeFFmpegSubtitlePath(subtitlePath);

    const subtitleFilter =
      `subtitles='${escapedSubtitlePath}':` +
      `force_style='FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,` +
      `OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,` +
      `Alignment=2,MarginV=120'`;

    await runFFmpeg([
      "-y",

      "-i",

      joinedVideo,

      "-vf",

      subtitleFilter,

      "-c:v",

      "libx264",

      "-preset",

      "medium",

      "-crf",

      "20",

      "-c:a",

      "copy",

      "-pix_fmt",

      "yuv420p",

      "-movflags",

      "+faststart",

      finalVideo,
    ]);

    await admin

      .from("generation_jobs")

      .update({
        current_stage: "final_render",

        progress: 95,
      })

      .eq("id", job.id)

      .eq("user_id", user.id);

    const videoBuffer = await fs.readFile(finalVideo);

    if (!videoBuffer.length) {
      throw new Error("The final video renderer returned an empty file.");
    }

    const storagePath =
      `${user.id}/${episode.id}/job-${job.id}/` +
      `episode-${episode.episode_number}-final.mp4`;

    const { error: uploadError } = await admin.storage

      .from("episode-media")

      .upload(storagePath, videoBuffer, {
        contentType: "video/mp4",

        upsert: true,
      });

    if (uploadError) throw uploadError;

    finalAssetReady = true;

    const { data: publicUrlData } = admin.storage

      .from("episode-media")

      .getPublicUrl(storagePath);

    const outputUrl = publicUrlData.publicUrl;

    const finalAssetPayload = {
      user_id: user.id,

      generation_job_id: job.id,

      episode_id: episode.id,

      scene_number: null,

      asset_type: "final_video",

      provider: "dramaai",

      model: `${episode.generation_mode || "economy"}-ffmpeg-v3`,

      storage_path: storagePath,

      public_url: outputUrl,

      provider_cost_pence: 0,

      status: "completed",

      error_message: null,

      metadata: {
        width: 1080,

        height: 1920,

        fps: 30,

        format: "mp4",

        ai_generated: true,

        ai_generated_voice: true,

        captions: true,

        motion: videoAssets.length ? "ai_video" : "ken_burns",

        ai_video_scenes: videoAssets.length,
      },

      updated_at: new Date().toISOString(),
    };

    const {
      data: currentFinalAsset,

      error: currentFinalAssetError,
    } = await admin

      .from("generation_assets")

      .select("id")

      .eq("generation_job_id", job.id)

      .eq("asset_type", "final_video")

      .maybeSingle();

    if (currentFinalAssetError) {
      throw currentFinalAssetError;
    }

    let finalAsset;

    let finalAssetError;

    if (currentFinalAsset) {
      const result = await admin

        .from("generation_assets")

        .update(finalAssetPayload)

        .eq("id", currentFinalAsset.id)

        .select()

        .single();

      finalAsset = result.data;

      finalAssetError = result.error;
    } else {
      const result = await admin

        .from("generation_assets")

        .insert(finalAssetPayload)

        .select()

        .single();

      finalAsset = result.data;

      finalAssetError = result.error;
    }

    if (finalAssetError) throw finalAssetError;

    const { data: finalReady, error: finalReadyError } = await userClient.rpc(
      "mark_generation_final_asset_ready",

      {
        p_job_id: job.id,

        p_output_url: outputUrl,
      },
    );

    if (finalReadyError || finalReady !== true) {
      throw finalReadyError || new Error("Unable to mark final video ready.");
    }

    const { data: completed, error: completeError } = await userClient.rpc(
      "complete_generation_job",
      {
        p_job_id: job.id,

        p_output_url: outputUrl,
      },
    );

    if (completeError) throw completeError;

    if (!completed) {
      throw new Error(
        "Production completed but the credit settlement could not be finalized.",
      );
    }

    settlementCompleted = true;

    return Response.json({
      success: true,

      existing: false,

      jobId: job.id,

      episodeId: episode.id,

      outputUrl,

      asset: finalAsset,

      progress: 100,

      status: "completed",
    });
  } catch (error) {
    console.error("DramaAI final render error:", error);

    if (!settlementCompleted && finalAssetReady && userClient && jobId) {
      try {
        await userClient.rpc(
          "record_generation_settlement_error",

          {
            p_job_id: jobId,

            p_reason:
              error?.message ||
              "Final video exists but account settlement is pending.",
          },
        );
      } catch (settlementError) {
        console.error(
          "DramaAI settlement status recording error:",

          settlementError,
        );
      }

      return Response.json(
        {
          success: false,

          settlementPending: true,

          message:
            "The final video was created, but account settlement is pending. Credits have not been refunded.",
        },

        { status: 500 },
      );
    }

    let providerWorkExists = false;

    if (!settlementCompleted && !finalAssetReady && admin && jobId) {
      try {
        const { data: providerAssets, error: providerAssetError } = await admin
          .from("generation_assets")
          .select("id, provider, asset_type, provider_cost_pence, status")
          .eq("generation_job_id", jobId)
          .eq("status", "completed");
        if (providerAssetError) {
          console.error(
            "DramaAI render provider-work lookup error:",
            providerAssetError,
          );
          providerWorkExists = true;
        } else {
          providerWorkExists = (providerAssets || []).some(
            (asset) =>
              Number(asset.provider_cost_pence) > 0 ||
              (asset.provider === "runway" && asset.asset_type === "video"),
          );
        }
      } catch (providerLookupError) {
        console.error(
          "DramaAI render provider-work lookup failed:",
          providerLookupError,
        );
        providerWorkExists = true;
      }
    }

    if (
      !settlementCompleted &&
      !finalAssetReady &&
      providerWorkExists &&
      userClient &&
      jobId
    ) {
      try {
        await userClient.rpc("record_generation_settlement_error", {
          p_job_id: jobId,
          p_reason:
            error?.message ||
            "Final rendering failed after paid provider work had already completed.",
        });
      } catch (settlementError) {
        console.error(
          "DramaAI render settlement status recording error:",
          settlementError,
        );
      }
      return Response.json(
        {
          success: false,
          settlementPending: true,
          message:
            error?.message ||
            "Final rendering failed after provider work. Credits have not been refunded.",
        },
        { status: 500 },
      );
    }

    if (!settlementCompleted) {
      await releaseCredits(
        userClient,

        jobId,

        error?.message || "Final rendering failed.",
      );
    }

    return Response.json(
      {
        success: false,

        settlementPending: false,

        message: error?.message || "Final video rendering failed.",
      },

      { status: 500 },
    );
  } finally {
    await removeProductionDirectory(directory);
  }
}
