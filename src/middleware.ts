import { NextResponse, type NextRequest } from "next/server";
import { COCKPIT_COOKIE_NAME, verifySession } from "@/lib/auth/session";

const PUBLIC_PATH_PREFIXES = [
  "/api/health",
  "/api/cron",
  "/api/auth",
  "/login",
  "/_next",
  "/favicon",
  "/robots.txt",
  "/sitemap.xml",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and public paths bypass auth
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (pathname.match(/\.[a-zA-Z0-9]+$/)) {
    // Anything with a file extension (e.g. .ico, .png) is a static asset
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COCKPIT_COOKIE_NAME)?.value;
  const verification = verifySession(cookie);
  if (verification.valid) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
