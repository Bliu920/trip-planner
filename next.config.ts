import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/trips/*/chat": ["./services/assistant/agent/guides/documents/*.md"],
  },
  // Redirect before rendering.
  redirects() {
    return [
      { source: "/", destination: "/projects/new", permanent: false },
      { source: "/projects", destination: "/projects/new", permanent: false },
    ];
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
