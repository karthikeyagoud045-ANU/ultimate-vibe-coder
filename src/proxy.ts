import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Initialize rate limiter only if Upstash is configured
let ratelimit: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(30, "60 s"), // 30 requests per minute
    analytics: true,
  });
}

async function handleRateLimit(request: NextRequest, key: string): Promise<NextResponse | null> {
  if (!ratelimit) return null; // No rate limiting if Upstash not configured

  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "anonymous";
  const identifier = `${key}:${ip}`;

  const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

  if (!success) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        retryAfter: Math.ceil((reset - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
          "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  return null; // No rate limit hit
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit AI proxy (30 requests per minute)
  if (pathname.startsWith("/api/ai")) {
    const rateLimitResponse = await handleRateLimit(request, "ai");
    if (rateLimitResponse) return rateLimitResponse;
  }

  // Rate limit GitHub API (10 requests per minute)
  if (pathname.startsWith("/api/github")) {
    const rateLimitResponse = await handleRateLimit(request, "github");
    if (rateLimitResponse) return rateLimitResponse;
  }

  // Rate limit templates (20 requests per minute)
  if (pathname.startsWith("/api/templates")) {
    const rateLimitResponse = await handleRateLimit(request, "templates");
    if (rateLimitResponse) return rateLimitResponse;
  }

  // Default session handling (DEV MODE: passes through without auth)
  return await updateSession();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth/ (auth callback routes)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
