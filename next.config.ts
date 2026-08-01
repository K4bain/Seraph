import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["meridian-graph-types", "meridian-connector-sdk"],
  // bullmq pulls ioredis, whose CJS subpaths ("ioredis/built/utils") break
  // webpack's exports-map resolution — load both natively at runtime.
  serverExternalPackages: ["pg", "bullmq", "ioredis"],
};

export default nextConfig;
