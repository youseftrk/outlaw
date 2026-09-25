import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  typedRoutes: false,
  // ssh2 is Node-only (native optional deps, streams); keep it external so the standalone server requires it at runtime
  serverExternalPackages: ["ssh2"],
  // Old SOC-era routes → the authority vocabulary (docs/PIVOT.md §2)
  async redirects() {
    return [
      { source: "/fleet", destination: "/systems", permanent: false },
      { source: "/threats", destination: "/incidents", permanent: false },
      { source: "/threats/:id", destination: "/incidents/:id", permanent: false },
      { source: "/governance", destination: "/record", permanent: false },
      { source: "/range", destination: "/drill/replay", permanent: false },
      { source: "/research", destination: "/agents", permanent: false },
      { source: "/deck", destination: "/why", permanent: false },
    ];
  },
};

export default nextConfig;
