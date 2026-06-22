import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  createWorkspace,
  getUserWorkspaces,
  generateWorkspaceSlug,
} from "@/lib/workspace";

// Get all workspaces for the current user
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaces = await getUserWorkspaces();
  return NextResponse.json({ workspaces });
}

// Create a new workspace
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
    const { name, description } = await request.json();

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Workspace name is required" },
        { status: 400 }
      );
    }

    let slug = generateWorkspaceSlug(name);

    // Ensure slug is unique
    const { data: existing } = await supabase
      .from("workspaces")
      .select("slug")
      .eq("slug", slug)
      .single();

    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const workspace = await createWorkspace(name.trim(), slug, description);

    if (!workspace) {
      return NextResponse.json(
        { error: "Failed to create workspace" },
        { status: 500 }
      );
    }

    return NextResponse.json({ workspace });
  } catch (error) {
    console.error("Error creating workspace:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
