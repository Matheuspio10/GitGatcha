import { withAuth } from "next-auth/middleware";

export default withAuth;

export const config = {
  matcher: [
    "/store/:path*",
    "/collection/:path*",
    "/battle/:path*",
    "/friends/:path*",
    "/profile/:path*",
  ]
}
