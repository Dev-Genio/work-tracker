import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@work-tracker/shared"],
  experimental: {
    typedRoutes: true,
  },
};

export default config;
