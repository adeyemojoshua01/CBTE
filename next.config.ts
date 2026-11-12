import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/index.html", destination: "/" },
      { source: "/question-builder.html", destination: "/question-builder" },
    ];
  },
};
export default nextConfig;
