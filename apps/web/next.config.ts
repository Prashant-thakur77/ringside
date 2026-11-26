import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@ringside/client"],
  reactStrictMode: true,
  webpack: (c) => {
    c.resolve.fallback = { ...(c.resolve.fallback ?? {}), fs: false, path: false, os: false, crypto: false };
    c.experiments = { ...(c.experiments ?? {}), asyncWebAssembly: true };
    return c;
  },
};
export default config;
