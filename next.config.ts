import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Interface languages (src/i18n): the locale comes from a cookie, not the URL
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextIntl(nextConfig);
