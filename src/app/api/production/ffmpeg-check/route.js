
import { NextResponse } from "next/server";
import ffmpegStatic from "ffmpeg-static";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const require = createRequire(import.meta.url);

function inspectFile(filePath) {
  if (!filePath) return { path: null, exists: false };

  try {
    const stats = statSync(filePath);

    return {
      path: filePath,
      exists: true,
      isFile: stats.isFile(),
      size: stats.size,
      executable: Boolean(stats.mode & 0o111),
    };
  } catch {
    return {
      path: filePath,
      exists: existsSync(filePath),
    };
  }
}

export async function GET() {
  let packageRoot = null;
  let packageError = null;

  try {
    packageRoot = path.dirname(
      require.resolve("ffmpeg-static/package.json")
    );
  } catch (error) {
    packageError = error.message;
  }

  const executable = process.env.FFMPEG_PATH || ffmpegStatic;
  const filename = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

  const candidates = [
    executable,
    ffmpegStatic,
    packageRoot ? path.join(packageRoot, filename) : null,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", filename),
    path.join(process.cwd(), ".next", "server", filename),
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
  ];

  const inspected = [...new Set(candidates.filter(Boolean))].map(inspectFile);
  const available = inspected.find((item) => item.exists && item.isFile);

  let version = null;
  let executionError = null;

  if (available) {
    try {
      version = await new Promise((resolve, reject) => {
        const child = spawn(
          /* turbopackIgnore: true */ available.path,
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
    } catch (error) {
      executionError = error.code || error.message;
    }
  }

  return NextResponse.json({
    ok: Boolean(version),
    platform: process.platform,
    architecture: process.arch,
    cwd: process.cwd(),
    packageRoot,
    packageError,
    configuredPath: process.env.FFMPEG_PATH ? "set" : "not set",
    resolvedExecutable: executable || null,
    files: inspected,
    version,
    executionError,
  });
}
