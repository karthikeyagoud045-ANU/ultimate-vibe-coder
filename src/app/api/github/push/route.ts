import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { Octokit } from "octokit";
import { decrypt } from "@/lib/encryption";

interface FileTree {
  [path: string]: string;
}

/**
 * Convert a flat file tree to GitHub API tree format
 */
function buildGitTree(files: FileTree) {
  return Object.entries(files).map(([path, content]) => ({
    path,
    mode: "100644" as const,
    type: "blob" as const,
    content,
  }));
}

// Push files to GitHub repository
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
    const { repoName, files, isPrivate, description } = await request.json();

    if (!repoName || !files || typeof files !== "object") {
      return NextResponse.json(
        { error: "repoName and files are required" },
        { status: 400 }
      );
    }

    // Get encrypted GitHub token
    const { data: connection, error: connError } = await supabase
      .from("github_connections")
      .select("encrypted_token, iv, auth_tag, github_username")
      .eq("user_id", user.id)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: "GitHub account not connected. Please connect GitHub in Settings." },
        { status: 404 }
      );
    }

    // Decrypt the token
    const token = decrypt(
      connection.encrypted_token,
      connection.iv,
      connection.auth_tag
    );

    const octokit = new Octokit({ auth: token });

    // Check if repo exists, create if not
    let repo;
    try {
      const { data: existingRepo } = await octokit.rest.repos.get({
        owner: connection.github_username,
        repo: repoName,
      });
      repo = existingRepo;
    } catch {
      // Repo doesn't exist, create it
      const { data: newRepo } = await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        description: description || `Vibe coded with Antigravity IDE`,
        private: isPrivate || false,
        auto_init: false,
      });
      repo = newRepo;
    }

    // Build the file tree
    const tree = buildGitTree(files as FileTree);

    // Create a tree
    const { data: treeData } = await octokit.rest.git.createTree({
      owner: connection.github_username,
      repo: repoName,
      tree,
    });

    // Get the latest commit on the default branch
    const { data: refData } = await octokit.rest.git.getRef({
      owner: connection.github_username,
      repo: repoName,
      ref: `heads/${repo.default_branch || "main"}`,
    });

    // Create a commit
    const { data: commitData } = await octokit.rest.git.createCommit({
      owner: connection.github_username,
      repo: repoName,
      message: `✨ Update from Antigravity IDE\n\nPushed via Antigravity IDE at ${new Date().toISOString()}`,
      tree: treeData.sha,
      parents: [refData.object.sha],
    });

    // Update the ref to point to the new commit
    await octokit.rest.git.updateRef({
      owner: connection.github_username,
      repo: repoName,
      ref: `heads/${repo.default_branch || "main"}`,
      sha: commitData.sha,
      force: true,
    });

    return NextResponse.json({
      success: true,
      repoUrl: repo.html_url,
      commitSha: commitData.sha,
    });
  } catch (error) {
    console.error("Error pushing to GitHub:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to push to GitHub",
      },
      { status: 500 }
    );
  }
}
