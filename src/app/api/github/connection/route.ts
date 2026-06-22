import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { Octokit } from "octokit";
import { encrypt } from "@/lib/encryption";

// Get GitHub connection status
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("github_connections")
    .select("github_username, created_at")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    github_username: data.github_username,
    connected_at: data.created_at,
  });
}

// Connect GitHub account using a personal access token
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: "GitHub token is required" },
        { status: 400 }
      );
    }

    // Verify the token and get user info
    const octokit = new Octokit({ auth: token });
    const { data: githubUser } = await octokit.rest.users.getAuthenticated();

    // Encrypt the token
    const { encrypted, iv, authTag } = encrypt(token);

    // Upsert the connection
    const { error } = await supabase.from("github_connections").upsert(
      {
        user_id: user.id,
        github_username: githubUser.login,
        github_user_id: githubUser.id,
        encrypted_token: encrypted,
        iv,
        auth_tag: authTag,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to save GitHub connection" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      github_username: githubUser.login,
    });
  } catch (error) {
    console.error("Error connecting GitHub:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to connect GitHub",
      },
      { status: 500 }
    );
  }
}

// Disconnect GitHub account
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("github_connections")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to disconnect GitHub" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
