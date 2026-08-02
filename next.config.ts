import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is required by the production Dockerfile (Fly.io).
  output: "standalone",
  transpilePackages: ["seraph-graph-types", "seraph-connector-sdk"],
  // bullmq pulls ioredis, whose CJS subpaths ("ioredis/built/utils") break
  // webpack's exports-map resolution — load both natively at runtime.
  serverExternalPackages: ["pg", "bullmq", "ioredis", "@prisma/client", "@prisma/adapter-neon", "@prisma/adapter-pg", "@neondatabase/serverless"],
  webpack: (config, { isServer }) => {
    // instrumentation.ts compiles with a webpack config that ignores
    // serverExternalPackages, so optional deps (pg-native, @valkey/valkey-glide)
    // and dotenv's node builtins fail to resolve in dev. Keep the same
    // packages external for every server compile, instrumentation included.
    if (isServer) {
      const serverExternals = [
        /^pg(?:\/|$)/,
        /^bullmq(?:\/|$)/,
        /^ioredis(?:\/|$)/,
        /^dotenv(?:\/|$)/,
        /^@prisma\/(?:client|adapter-neon|adapter-pg)(?:\/|$)/,
        /^@neondatabase\/serverless(?:\/|$)/,
      ];
      config.externals.push(...serverExternals);
      // node: scheme imports (generated Prisma client, libs) are fine as
      // runtime require()s on the Node server — webpack must not try to
      // bundle them (dev fails with UnhandledSchemeError otherwise).
      config.externals.push(
        ({ request }: { request?: string }, callback: (err?: Error, result?: string) => void) => {
          if (typeof request === "string" && request.startsWith("node:")) {
            return callback(undefined, `commonjs ${request}`);
          }
          callback();
        },
      );
    }
    return config;
  },
};

export default nextConfig;
