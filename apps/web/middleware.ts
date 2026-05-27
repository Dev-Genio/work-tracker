import { auth } from "@/lib/auth/server";

// 1. Exchanges OAuth verifier (?neon_auth_session_verifier=…) for a session
//    cookie on our origin (the missing piece for the Google callback).
// 2. Redirects unauthenticated requests on protected routes to /sign-in.
//
// We intentionally exclude "/" and "/sign-in" via the matcher so the
// marketing landing and login pages stay public.
export default auth.middleware({ loginUrl: "/sign-in" });

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/track/:path*",
    "/timesheet/:path*",
    "/chat/:path*",
    "/settings/:path*",
  ],
};
