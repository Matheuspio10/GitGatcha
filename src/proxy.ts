import { withAuth } from "next-auth/middleware";

// Next 16 "proxy" (formerly middleware): signed-out visitors of these pages go to the login
export default withAuth;

export const config = {
  matcher: [
    "/store/:path*",
    "/collection/:path*",
    "/battle/:path*",
    "/friends/:path*",
    "/profile/:path*",
    "/inventory/:path*",
    "/forge/:path*",
    "/bits/:path*",
  ]
}
