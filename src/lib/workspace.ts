/**
 * Workspace Helper — Server-side RBAC logic
 *
 * Handles workspace membership, role verification, and room assignment.
 */

import { createClient } from "@/utils/supabase/server";

export type WorkspaceRole = "owner" | "editor" | "viewer";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  invited_by: string | null;
  created_at: string;
}

export interface WorkspaceWithMembers extends Workspace {
  members: (WorkspaceMember & { username?: string; avatar_url?: string })[];
  member_count: number;
}

interface WorkspaceMemberWorkspaceRow {
  workspaces: Workspace | Workspace[] | null;
}

/**
 * Get all workspaces the current user is a member of
 */
export async function getUserWorkspaces(): Promise<Workspace[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspaces(*)")
    .eq("user_id", user.id);

  if (error || !data) return [];

  const rows = data as WorkspaceMemberWorkspaceRow[];
  return rows.flatMap((row) => {
    if (!row.workspaces) return [];
    return Array.isArray(row.workspaces) ? row.workspaces : [row.workspaces];
  });
}

/**
 * Get a workspace by ID with its members
 */
export async function getWorkspace(
  workspaceId: string
): Promise<WorkspaceWithMembers | null> {
  const supabase = await createClient();

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();

  if (wsError || !workspace) return null;

  const { data: members, error: memError } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (memError) return null;

  return {
    ...workspace,
    members: members || [],
    member_count: members?.length || 0,
  };
}

/**
 * Get a workspace by slug
 */
export async function getWorkspaceBySlug(
  slug: string
): Promise<WorkspaceWithMembers | null> {
  const supabase = await createClient();

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .single();

  if (wsError || !workspace) return null;

  return getWorkspace(workspace.id);
}

/**
 * Verify if a user has a specific role in a workspace
 */
export async function verifyWorkspaceRole(
  workspaceId: string,
  userId: string,
  requiredRole: WorkspaceRole = "viewer"
): Promise<boolean> {
  const supabase = await createClient();

  const roleHierarchy: Record<WorkspaceRole, number> = {
    owner: 3,
    editor: 2,
    viewer: 1,
  };

  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (error || !data) return false;

  const userLevel = roleHierarchy[data.role as WorkspaceRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  return userLevel >= requiredLevel;
}

/**
 * Create a new workspace
 */
export async function createWorkspace(
  name: string,
  slug: string,
  description?: string
): Promise<Workspace | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("workspaces")
    .insert({
      name,
      slug,
      description: description || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error || !data) return null;

  // Add creator as owner
  await supabase.from("workspace_members").insert({
    workspace_id: data.id,
    user_id: user.id,
    role: "owner",
    invited_by: user.id,
  });

  return data;
}

/**
 * Add a member to a workspace
 */
export async function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole = "editor"
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // Verify the current user is an owner
  const isOwner = await verifyWorkspaceRole(workspaceId, user.id, "owner");
  if (!isOwner) return false;

  const { error } = await supabase.from("workspace_members").upsert({
    workspace_id: workspaceId,
    user_id: userId,
    role,
    invited_by: user.id,
  });

  return !error;
}

/**
 * Remove a member from a workspace
 */
export async function removeWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // Verify the current user is an owner
  const isOwner = await verifyWorkspaceRole(workspaceId, user.id, "owner");
  if (!isOwner) return false;

  // Cannot remove yourself if you're the only owner
  const { data: owners } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("role", "owner");

  if (owners && owners.length <= 1 && userId === user.id) {
    return false; // Cannot remove the last owner
  }

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  return !error;
}

/**
 * Assign a room to a workspace
 */
export async function assignRoomToWorkspace(
  roomId: string,
  workspaceId: string | null
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // If assigning to a workspace, verify the user is an editor or owner
  if (workspaceId) {
    const hasAccess = await verifyWorkspaceRole(workspaceId, user.id, "editor");
    if (!hasAccess) return false;
  }

  const { error } = await supabase
    .from("rooms")
    .update({ workspace_id: workspaceId })
    .eq("id", roomId);

  return !error;
}

/**
 * Get rooms in a workspace
 */
export async function getWorkspaceRooms(
  workspaceId: string
): Promise<{ id: string; name: string; created_at: string }[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data;
}

/**
 * Generate a unique slug from a workspace name
 */
export function generateWorkspaceSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}
