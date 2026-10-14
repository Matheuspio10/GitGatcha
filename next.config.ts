import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./src/lib/securityHeaders";

// Interface languages (src/i18n): the locale comes from a cookie, not the URL
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // CSP (report-only for now), HSTS, nosniff, no framing… (src/lib/securityHeaders.ts)
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ dev: process.env.NODE_ENV !== "production" }) }];
  },
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
