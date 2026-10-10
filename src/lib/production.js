import fs from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

export async function createProductionDirectory() {
  const directory = path.join(os.tmpdir(), `dramaai-${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function removeProductionDirectory(directory) {
  if (!directory) return;
  try {
    await fs.rm(directory, { recursive: true, force: true });
  } catch {
    return;
  }
}

export async function downloadAsset(url, destination) {
  if (!url) {
    throw new Error("Production asset URL is missing.");
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not download production asset: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error("Downloaded production asset is empty.");
  }

  await fs.writeFile(destination, buffer);
  return destination;
}

export function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const filename = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

    const candidates = [
      process.env.FFMPEG_PATH,
      path.join(process.cwd(), "node_modules", "ffmpeg-static", filename),
      ffmpegStatic,
    ].filter(Boolean);

    const executable = candidates.find((candidate) => {
      try {
        return statSync(candidate).isFile();
      } catch {
        return false;
      }
    });

    if (!executable) {
      reject(
        new Error(
          "FFmpeg executable was not found. Check ffmpeg-static installation and Vercel file tracing.",
        ),
      );
      return;
    }

    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let errorOutput = "";
    let settled = false;

    child.stderr.on("data", (data) => {
      errorOutput += data.toString();

      if (errorOutput.length > 20000) {
        errorOutput = errorOutput.slice(-10000);
      }
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;

      reject(new Error(`FFmpeg failed to start: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          errorOutput.trim().slice(-5000) ||
            `FFmpeg exited with code ${code}, signal ${signal || "none"}.`,
        ),
      );
    });
  });
}

export function cleanProductionText(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") {
    return value.replace(/\r/g, "").replace(/\s+/g, " ").trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return cleanProductionText(item);

        if (item && typeof item === "object") {
          const speaker =
            cleanProductionText(item.character) ||
            cleanProductionText(item.speaker) ||
            cleanProductionText(item.name);

          const text =
            cleanProductionText(item.text) ||
            cleanProductionText(item.dialogue) ||
            cleanProductionText(item.line);

          if (speaker && text) return `${speaker}: ${text}`;
          if (text) return text;

          return cleanProductionText(item);
        }

        return cleanProductionText(item);
      })
      .filter(Boolean)
      .join(" ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => {
        const text = cleanProductionText(item);
        if (!text) return "";
        return `${key}: ${text}`;
      })
      .filter(Boolean)
      .join(" ");
  }

  return String(value).trim();
}

export function escapeSubtitleText(value) {
  return cleanProductionText(value)
    .replace(/-->/g, "→")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .trim();
}

export function secondsToVttTime(totalSeconds) {
  const milliseconds = Math.max(
    0,
    Math.round(Number(totalSeconds || 0) * 1000),
  );

  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;

  return (
    [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0"),
    ].join(":") +
    "." +
    String(ms).padStart(3, "0")
  );
}

export function getSceneCaption(scene) {
  const caption = cleanProductionText(scene?.caption);
  if (caption) return caption;

  const dialogue = cleanProductionText(scene?.dialogue);
  if (dialogue) return dialogue;

  return cleanProductionText(scene?.narration);
}

export function createWebVtt(scenes) {
  let currentTime = 0;
  const cues = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const duration = Math.max(1, Number(scene?.duration_seconds) || 5);
    const start = currentTime;
    const end = currentTime + duration;
    const caption = escapeSubtitleText(getSceneCaption(scene));

    if (caption) {
      cues.push(
        `${index + 1}\n${secondsToVttTime(start)} --> ${secondsToVttTime(
          end,
        )}\n${caption}\n`,
      );
    }

    currentTime = end;
  }

  return `WEBVTT\n\n${cues.join("\n")}`;
}

export function escapeFFmpegSubtitlePath(filePath) {
  return path
    .resolve(filePath)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

export function escapeConcatPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, "/").replace(/'/g, "'\\''");
}
