import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const isSupabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseStatus = "not_configured";
  let isHealthy = true;

  if (isSupabaseConfigured) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok || res.status === 400 || res.status === 401 || res.status === 404) {
        // Even if unauthorized or bad request, the server is reachable
        supabaseStatus = "connected";
      } else {
        supabaseStatus = "unreachable";
        isHealthy = false;
      }
    } catch (err) {
      supabaseStatus = "unreachable";
      isHealthy = false;
    }
  }

  const envVars = {
    ALLOWED_ORIGINS: !!process.env.ALLOWED_ORIGINS,
    NEXT_PUBLIC_WS_URL: !!process.env.NEXT_PUBLIC_WS_URL,
    SUPABASE: isSupabaseConfigured,
  };

  if (!envVars.NEXT_PUBLIC_WS_URL) {
    // We expect the WS URL to be defined in production or explicitly locally
    // However, it's not strictly required to fail health if it defaults to localhost,
    // but a production app should configure it.
    // We won't mark it unhealthy just for WS URL to prevent local dev issues,
    // but ALLOWED_ORIGINS should ideally be checked if in production.
  }

  return NextResponse.json(
    {
      status: isHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        supabase: supabaseStatus,
        env: envVars,
      },
    },
    { status: isHealthy ? 200 : 503 }
  );
}
