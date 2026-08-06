import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is required by the production Dockerfile (Fly.io).
  output: "standalone",
  transpilePackages: [
    "seraph-graph-types",
    "seraph-connector-sdk",
    "@worldwideview/wwv-plugin-sdk",
    "resium",
    "react-player",
    "satellite.js",
    "@worldwideview/wwv-lib-aviation",
    "@worldwideview/wwv-lib-incidents",
  ],
  // bullmq pulls ioredis, whose CJS subpaths ("ioredis/built/utils") break
  // webpack's exports-map resolution — load both natively at runtime.
  serverExternalPackages: ["pg", "bullmq", "ioredis", "@prisma/client", "@prisma/adapter-neon", "@prisma/adapter-pg", "@neondatabase/serverless"],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    CESIUM_BASE_URL: "/cesium",
  },
  webpack: (config, { isServer, webpack }) => {
    config.ignoreWarnings = [
      { module: /node_modules[\\/]@opentelemetry/ },
      { module: /node_modules[\\/]require-in-the-middle/ },
      { module: /node_modules[\\/]@sentry/ },
    ];
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

    if (!isServer) {
      // Define CESIUM_BASE_URL for Cesium's worker resolution
      config.plugins?.push(
        new webpack.DefinePlugin({
          CESIUM_BASE_URL: JSON.stringify("/cesium"),
        }),
      );

      // Cesium uses some Node.js modules that should be excluded in the browser
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        http: false,
        https: false,
        zlib: false,
        url: false,
      };
    }
    return config;
  },
};

export default nextConfig;
