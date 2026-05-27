import { auth } from "@/lib/auth/server";

type RouteCtx = { params: Promise<{ path: string[] }> };

// Build handlers lazily so Next.js page-data collection doesn't evaluate auth
// before envs exist (e.g. on Vercel preview without secrets).
function handlers() {
  return auth.handler();
}

export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  return (handlers().GET as (r: Request, c: RouteCtx) => Promise<Response>)(req, ctx);
}

export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  return (handlers().POST as (r: Request, c: RouteCtx) => Promise<Response>)(req, ctx);
}

export const dynamic = "force-dynamic";
