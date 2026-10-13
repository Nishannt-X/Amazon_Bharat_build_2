import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Runtime SQLite databases contain private accounts, photos and sessions.
  outputFileTracingExcludes: { "/*": ["./.data/**/*"] },
  turbopack: {
    rules: {
      // Only the global entry compiles Tailwind. Rewriting every CSS file
      // as *.css strips the native CSS Module type and its class exports.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
