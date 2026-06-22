import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  getWorkspace,
  addWorkspaceMember,
  removeWorkspaceMember,
  verifyWorkspaceRole,
} from "@/lib/workspace";

// Get workspace members
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user is a member
  const isMember = await verifyWorkspaceRole(workspaceId, user.id, "viewer");
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ members: workspace.members });
}

// Add a member to the workspace
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email, role } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Find user by email
    const { data: targetUser, error: findError } = await supabase
      .from("auth.users")
      .select("id")
      .eq("email", email)
      .single();

    if (findError || !targetUser) {
      return NextResponse.json(
        { error: "User not found with that email" },
        { status: 404 }
      );
    }

    const success = await addWorkspaceMember(
      workspaceId,
      targetUser.id as string,
      role || "editor"
    );

    if (!success) {
      return NextResponse.json(
        { error: "Failed to add member. Are you an owner?" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding member:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Remove a member from the workspace
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const userId = searchParams.get("userId");

    if (!workspaceId || !userId) {
      return NextResponse.json(
        { error: "workspaceId and userId are required" },
        { status: 400 }
      );
    }

    const success = await removeWorkspaceMember(workspaceId, userId);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to remove member" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
