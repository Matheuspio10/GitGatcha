import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

/**
 * GitHub now adds an `iss` parameter to its OAuth callback (RFC 9207). next-auth v4's
 * openid-client refuses any `iss` when the provider has no issuer configured, which
 * broke "Sign in / Connect with GitHub". We check the issuer here instead (it must be
 * GitHub itself — that is the mix-up protection the parameter exists for) and strip it.
 */
const EXPECTED_ISSUER_HOST: Record<string, string> = { github: "github.com" };

async function GET(req: NextRequest, ctx: { params: Promise<{ nextauth: string[] }> }) {
  const url = new URL(req.url);
  const provider = url.pathname.match(/\/api\/auth\/callback\/([^/]+)$/)?.[1];
  const iss = url.searchParams.get("iss");

  if (provider && iss !== null && EXPECTED_ISSUER_HOST[provider]) {
    let host = "";
    try {
      host = new URL(iss).hostname;
    } catch {
      // not a URL: rejected below
    }
    if (host !== EXPECTED_ISSUER_HOST[provider]) {
      return NextResponse.redirect(new URL("/login?error=OAuthCallback", url));
    }
    url.searchParams.delete("iss");
    return handler(new NextRequest(url, req), ctx);
  }

  return handler(req, ctx);
}

export { GET, handler as POST };
