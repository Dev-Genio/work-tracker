import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { STORAGE_MODE_COOKIE } from "@/lib/storage-mode";

const authMiddleware = auth.middleware({ loginUrl: "/sign-in" });

// In local-only mode there is no account — data lives in the browser's
// IndexedDB — so we skip the auth/session check entirely. Cloud mode keeps
// the OAuth verifier exchange + protected-route redirect.
export default function middleware(req: NextRequest) {
  const mode = req.cookies.get(STORAGE_MODE_COOKIE)?.value;
  if (mode === "local") return NextResponse.next();
  return authMiddleware(req);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/track/:path*",
    "/timesheet/:path*",
    "/report/:path*",
    "/chat/:path*",
    "/settings/:path*",
  ],
};
