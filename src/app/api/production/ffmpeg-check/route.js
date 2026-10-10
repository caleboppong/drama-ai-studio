
import { NextResponse } from "next/server";
import ffmpegStatic from "ffmpeg-static";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

export const runtime = "nodejs";

export async function GET() {
  const executable = process.env.FFMPEG_PATH || ffmpegStatic;

  if (!executable || !existsSync(executable)) {
    return NextResponse.json(
      {
        ok: false,
        message: "FFmpeg executable not found",
        platform: process.platform,
        binaryExists: false,
      },
      { status: 503 }
    );
  }

  try {
    const version = await new Promise((resolve, reject) => {
      const child = spawn(
        /* turbopackIgnore: true */ executable,
        ["-version"],
        { windowsHide: true }
      );

      let output = "";

      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });

      child.on("error", reject);

      child.on("close", (code) => {
        if (code === 0) {
          resolve(output.split("\n")[0]);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });

    return NextResponse.json({ ok: true, version });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "FFmpeg could not execute",
        error: error.code || error.message,
      },
      { status: 503 }
    );
  }
}
