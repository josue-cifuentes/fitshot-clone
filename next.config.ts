import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "prisma",
    "@flow-js/garmin-connect",
  ],
};

export default nextConfig;
