import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["meridian-graph-types", "meridian-connector-sdk"],
  serverExternalPackages: ["pg"],
};

export default nextConfig;
