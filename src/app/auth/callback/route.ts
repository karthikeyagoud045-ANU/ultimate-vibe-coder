import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // "redirect" is the path user was trying to visit before auth
  const redirect = searchParams.get("redirect") || "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Redirect to the original destination or dashboard
      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  // If code exchange fails, redirect to landing with error
  return NextResponse.redirect(`${origin}/?error=auth_callback_failed`);
}
