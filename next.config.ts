import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Use fallback so dynamic routes (e.g. app/api/convert/route.ts) are matched first.
    // The route handler proxies with a long timeout; the rewrite proxy is limited to 30s.
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination:
            process.env.NODE_ENV === "development"
              ? "http://127.0.0.1:5328/api/:path*"
              : "/api/",
        },
      ],
    };
  },
};

export default nextConfig;
