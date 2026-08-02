import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is required by the production Dockerfile (Fly.io).
  output: "standalone",
  transpilePackages: ["seraph-graph-types", "seraph-connector-sdk"],
  // bullmq pulls ioredis, whose CJS subpaths ("ioredis/built/utils") break
  // webpack's exports-map resolution — load both natively at runtime.
  serverExternalPackages: ["pg", "bullmq", "ioredis"],
};

export default nextConfig;
