import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const { pathname } = req.nextUrl;

    // Allowed without full setup
    const isPublicRoute = pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/setup-profile") || pathname.startsWith("/api");

    if (isAuth && !token.username && !isPublicRoute) {
      if (pathname !== "/setup-profile") {
        return NextResponse.redirect(new URL("/setup-profile", req.url));
      }
    }
    
    // Additional protected routes check could be here if needed 
    // Usually withAuth handles the redirect to login automatically 
    // for matched routes in config.matcher
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/store/:path*",
    "/collection/:path*",
    "/battle/:path*",
    "/friends/:path*",
    "/profile/:path*",
    // Exclude public paths explicitly to let middleware handle it
    "/((?!api|_next/static|_next/image|favicon.ico|login|register).*)",
  ]
}
