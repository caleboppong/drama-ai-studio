
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  outputFileTracingIncludes: {
    "/api/production/render": [
      "./node_modules/ffmpeg-static/ffmpeg",
    ],
    "/api/production/ffmpeg-check": [
      "./node_modules/ffmpeg-static/ffmpeg",
    ],
  },
};

export default nextConfig;
