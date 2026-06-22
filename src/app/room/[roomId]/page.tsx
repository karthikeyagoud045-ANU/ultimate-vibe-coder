"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import * as Y from "yjs";
import {
  getYjsProvider,
  destroyYjsProvider,
  UserPresenceState,
} from "@/lib/yjs-provider";
import { getQueueStatus } from "@/lib/agentic-queue";
import { getRuntimeForFile, executeWithJudge0, getRuntimeMessage } from "@/lib/code-execution";
import type { WebsocketProvider } from "y-websocket";
import UserPresence from "@/components/UserPresence";
import AIPromptPanel from "@/components/AIPromptPanel";
import ChatPanel from "@/components/ChatPanel";
import LivePreview from "@/components/LivePreview";
import TerminalPanel from "@/components/TerminalPanel";
import ConflictResolver from "@/components/ConflictResolver";
import AgentApprovalModal from "@/components/AgentApprovalModal";
import { useAgentApprovals } from "@/hooks/useAgentApprovals";
import ErrorBoundary from "@/components/ErrorBoundary";
import ToastContainer from "@/components/ui/ToastContainer";
import { useToast, showToast } from "@/hooks/useToast";
import { IDESkeleton } from "@/components/ui/Skeleton";
import { logger } from "@/lib/logger";

const CollaborativeEditor = dynamic(
  () => import("@/components/CollaborativeEditor"),
  { ssr: false }
);

type RightPanelTab = "preview" | "ai" | "chat" | "terminal";

interface UserProfile {
  id: string;
  username: string;
  avatarUrl: string;
  email: string;
}

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  // User session state (DEV MODE: mock user — no Supabase auth required)
  const [user] = useState<UserProfile | null>({
    id: "dev-user-001",
    username: "Developer",
    avatarUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=dev-user",
    email: "dev@vibeide.local",
  });
  const [isLoadingUser] = useState(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RightPanelTab>("preview");
  const [currentCode, setCurrentCode] = useState("");
  const [language, setLanguage] = useState("html");
  const [queueStatus, setQueueStatus] = useState({ pending: 0, processing: 0, conflicts: 0 });
  const [showConflictResolver, setShowConflictResolver] = useState(false);
  const [conflictFilePath, setConflictFilePath] = useState<string>("current");
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [ytext, setYtext] = useState<Y.Text | null>(null);
  const [ychat, setYchat] = useState<Y.Array<unknown> | null>(null);
  const [aiQueue, setAiQueue] = useState<Y.Map<unknown> | null>(null);
  const [aiBranches, setAiBranches] = useState<Y.Map<unknown> | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<Y.Array<unknown> | null>(null);
  const [files, setFiles] = useState<Y.Map<unknown> | null>(null);
  const [pendingAgentActions, setPendingAgentActions] = useState<Y.Map<unknown> | null>(null);
  const [userColor, setUserColor] = useState<string>("#3B82F6");

  // Toast system
  const { toasts, removeToast } = useToast();

  // Agent approval state
  const { pendingActions, approveAction, rejectAction } = useAgentApprovals(pendingAgentActions);

  // Initialize Yjs when user is loaded
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    let providerRef: WebsocketProvider | null = null;
    let ydocRef: Y.Doc | null = null;

    const init = () => {
      try {
        const result = getYjsProvider(roomId, {
          userId: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        });

        if (!mounted) {
          result.provider.awareness.destroy();
          result.provider.destroy();
          result.ydoc.destroy();
          return;
        }

        providerRef = result.provider;
        ydocRef = result.ydoc;

        setProvider(result.provider);
        setYdoc(result.ydoc);
        setYtext(result.ytext);
        setYchat(result.ychat);
        setAiQueue(result.aiQueue);
        setAiBranches(result.aiBranches);
        setTerminalOutput(result.terminalOutput);
        setFiles(result.files);
        setPendingAgentActions(result.pendingAgentActions);

        const localState = result.provider.awareness.getLocalState();
        if (localState?.user) {
          setUserColor((localState.user as UserPresenceState).color);
        }

        result.provider.on("status", ({ status }: { status: string }) => {
          if (!mounted) return;
          setIsConnected(status === "connected");
          setIsConnecting(status === "connecting");
          if (status === "connected") {
            setConnectionError(null);
          }
        });

        result.provider.on("connection-error", () => {
          if (!mounted) return;
          setConnectionError(
            "Reconnecting to collaboration server..."
          );
          setIsConnecting(true);
        });

        const initialCode = result.ytext.toString();
        if (initialCode) {
          setCurrentCode(initialCode);
        }

        result.ychat.push([
          {
            username: "System",
            text: `${user.username} joined the room`,
            timestamp: Date.now(),
            color: "#6B7280",
            type: "system",
          },
        ]);

        result.aiQueue.observe(() => {
          if (!mounted) return;
          setQueueStatus(getQueueStatus(result.aiQueue));
        });

        result.aiBranches.observe(() => {
          if (!mounted) return;
          const branches = result.aiBranches.toJSON();
          const hasConflicts = Object.values(branches).some(
            (b: Record<string, unknown>) => b.filePath === "current"
          );
          if (hasConflicts) {
            setShowConflictResolver(true);
          }
        });
      } catch (err) {
        logger.error("Failed to initialize Yjs", { component: "RoomPage", error: err });
        if (mounted) {
          setConnectionError("Failed to connect to collaboration server.");
          setIsConnecting(false);
        }
      }
    };

    init();

    return () => {
      mounted = false;
      if (providerRef) {
        providerRef.awareness.destroy();
        providerRef.destroy();
      }
      if (ydocRef) {
        ydocRef.destroy();
      }
      destroyYjsProvider();

      // Teardown webcontainer on exit
      import("@/lib/webcontainer").then(m => m.teardown()).catch(err => logger.error("WebContainer teardown failed", { component: "RoomPage", error: err }));
    };
  }, [roomId, user]);

  const handleContentChange = useCallback((content: string) => {
    setCurrentCode(content);
  }, []);

  const handleApplyAICode = useCallback(
    (code: string) => {
      if (ytext && ydoc) {
        ydoc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, code);
        });
        setCurrentCode(code);

        if (files) {
          const ext = language === "typescript" ? "ts" : language === "javascript" ? "js" : language;
          files.set(`index.${ext}`, code);
        }
      }
    },
    [ytext, ydoc, files, language]
  );

  const handleTerminalOutput = useCallback((output: string) => {
    if (terminalOutput) {
      terminalOutput.push([{ text: output, timestamp: Date.now() }]);
    }
  }, [terminalOutput]);

  const handleRunCode = useCallback(async (filename: string, code: string) => {
    const runtime = getRuntimeForFile(filename);

    if (runtime === "judge0") {
      handleTerminalOutput(getRuntimeMessage(filename));
      try {
        const result = await executeWithJudge0(filename, code);
        if (result.stdout) handleTerminalOutput(result.stdout);
        if (result.stderr) handleTerminalOutput(`[stderr] ${result.stderr}`);
        handleTerminalOutput(`[Exit code: ${result.exitCode}] [Time: ${result.time}s] [Memory: ${result.memory}KB]`);
      } catch (err) {
        handleTerminalOutput(`[error] ${err instanceof Error ? err.message : "Execution failed"}`);
      }
    } else {
      handleTerminalOutput("[WebContainer] Running in browser preview...");
    }
  }, [handleTerminalOutput]);

  const handleSignOut = async () => {
    window.location.href = "/";
  };

  const hasQueueActivity = queueStatus.pending > 0 || queueStatus.processing > 0;
  const hasConflicts = queueStatus.conflicts > 0;

  // Loading state
  if (isLoadingUser) {
    return <IDESkeleton />;
  }

  if (connectionError && !isConnected && !isConnecting) {
    return (
      <div className="ide-container">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: "var(--space-lg)",
            padding: "var(--space-3xl)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "3rem" }}>🔌</div>
          <h2
            style={{
              color: "var(--text-primary)",
              fontSize: "var(--font-size-xl)",
            }}
          >
            Connection Required
          </h2>
          <p
            style={{
              color: "var(--text-secondary)",
              maxWidth: 420,
              lineHeight: 1.6,
              fontSize: "var(--font-size-sm)",
            }}
          >
            {connectionError}
          </p>
          <div
            style={{
              background: "var(--bg-tertiary)",
              padding: "var(--space-lg)",
              borderRadius: "var(--radius-md)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--font-size-sm)",
              color: "var(--accent-green)",
            }}
          >
            $ node server/index.js
          </div>
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
            id="retry-connection-btn"
          >
            ↻ Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const username = user?.username || "Anonymous";
  const userId = user?.id || "anon";

  return (
    <div className="ide-container">
      <header className="ide-topbar">
        <div className="topbar-left">
          <a href="/dashboard" className="topbar-logo" style={{ textDecoration: "none" }}>
            <div className="topbar-logo-icon">⚡</div>
            <span>Vibe Code</span>
          </a>
          <div className="topbar-divider" />
          <div className="topbar-room">
            <span className="badge badge-blue">{roomId}</span>
          </div>
        </div>

        <div className="topbar-center">
          <div className="status-indicator">
            <div
              className={`status-dot ${
                isConnected
                  ? "status-dot-connected"
                  : isConnecting
                    ? "status-dot-connecting"
                    : "status-dot-disconnected"
              }`}
            />
            <span>
              {isConnected
                ? "Connected"
                : isConnecting
                  ? connectionError
                    ? "Reconnecting..."
                    : "Connecting..."
                  : "Disconnected"}
            </span>
          </div>

          {hasQueueActivity && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-xs)",
                padding: "2px 8px",
                borderRadius: "var(--radius-full)",
                background: hasConflicts
                  ? "hsla(0, 72%, 58%, 0.15)"
                  : "hsla(217, 91%, 60%, 0.15)",
                fontSize: "var(--font-size-xs)",
                color: hasConflicts ? "var(--accent-red)" : "var(--accent-blue)",
              }}
            >
              <span
                className="spinner spinner-sm"
                style={{
                  width: "10px",
                  height: "10px",
                  borderWidth: "1.5px",
                  borderTopColor: hasConflicts ? "var(--accent-red)" : "var(--accent-blue)",
                }}
              />
              <span>
                {hasConflicts
                  ? `${queueStatus.conflicts} conflict${queueStatus.conflicts > 1 ? "s" : ""}`
                  : `${queueStatus.processing + queueStatus.pending} queued`}
              </span>
            </div>
          )}
        </div>

        <div className="topbar-right">
          {provider && (
            <UserPresence
              provider={provider}
              currentUsername={username}
            />
          )}

          {/* User avatar dropdown */}
          {user && (
            <div className="user-menu">
              <button
                className="user-menu-trigger"
                onClick={() => setShowUserMenu(!showUserMenu)}
                id="user-menu-btn"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="user-menu-avatar"
                />
                <span className="user-menu-name">{user.username}</span>
              </button>

              {showUserMenu && (
                <div className="user-menu-dropdown">
                  <div
                    style={{
                      padding: "var(--space-sm) var(--space-md)",
                      fontSize: "var(--font-size-xs)",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {user.email}
                  </div>
                  <div className="user-menu-divider" />
                  <a href="/dashboard" className="user-menu-item" style={{ textDecoration: "none" }}>
                    📊 Dashboard
                  </a>
                  <div className="user-menu-divider" />
                  <button
                    className="user-menu-item"
                    onClick={handleSignOut}
                    id="sign-out-btn"
                  >
                    🚪 Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="ide-main">
        <section className="ide-editor-section">
          <div className="panel-header">
            <div className="panel-title">
              <span>📝</span>
              <span>Editor</span>
            </div>
            <div className="panel-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const ext = language === "typescript" ? "ts" : language === "javascript" ? "js" : language;
                  handleRunCode(`index.${ext}`, currentCode);
                }}
                id="run-code-btn"
                title="Run code"
              >
                ▶ Run
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  const repoName = prompt("Repository name:", "my-vibe-app");
                  if (!repoName) return;

                  const ext = language === "typescript" ? "ts" : language === "javascript" ? "js" : language;
                  const files = { [`index.${ext}`]: currentCode };

                  try {
                    const res = await fetch("/api/github/push", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ repoName, files, isPrivate: false }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      showToast("Successfully pushed to GitHub!", "success");
                      window.open(data.repoUrl, "_blank");
                    } else {
                      showToast(data.error || "Failed to push to GitHub", "error");
                    }
                  } catch {
                    showToast("Failed to push to GitHub", "error");
                  }
                }}
                id="push-github-btn"
                title="Push to GitHub"
              >
                ⬆ Push
              </button>
              <select
                className="btn btn-ghost btn-sm"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border-primary)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-secondary)",
                  padding: "2px 8px",
                  fontSize: "var(--font-size-xs)",
                  fontFamily: "var(--font-sans)",
                  cursor: "pointer",
                }}
                id="language-select"
              >
                <option value="html">HTML</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="css">CSS</option>
                <option value="json">JSON</option>
              </select>
            </div>
          </div>

          {ytext && provider ? (
            <ErrorBoundary panelName="Editor">
              <CollaborativeEditor
                ytext={ytext}
                provider={provider}
                language={language}
                onContentChange={handleContentChange}
              />
            </ErrorBoundary>
          ) : (
            <div className="editor-container">
              <div className="preview-loading">
                <div className="spinner" />
                <div className="preview-loading-text">
                  Initializing editor...
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="ide-right-section">
          <div className="tab-bar">
            <button
              className={`tab ${activeTab === "preview" ? "active" : ""}`}
              onClick={() => setActiveTab("preview")}
              id="tab-preview"
            >
              ⚡ Preview
            </button>
            <button
              className={`tab ${activeTab === "ai" ? "active" : ""}`}
              onClick={() => setActiveTab("ai")}
              id="tab-ai"
            >
              🤖 AI Assistant
            </button>
            <button
              className={`tab ${activeTab === "chat" ? "active" : ""}`}
              onClick={() => setActiveTab("chat")}
              id="tab-chat"
            >
              💬 Chat
            </button>
            <button
              className={`tab ${activeTab === "terminal" ? "active" : ""}`}
              onClick={() => setActiveTab("terminal")}
              id="tab-terminal"
            >
              ⌨️ Terminal
            </button>
          </div>

          <div className="right-panel-content">
            {activeTab === "preview" && files && (
              <ErrorBoundary panelName="Preview">
                <LivePreview
                  files={files}
                  onTerminalOutput={handleTerminalOutput}
                />
              </ErrorBoundary>
            )}

            {activeTab === "ai" && ydoc && ytext && aiQueue && aiBranches && (
              <ErrorBoundary panelName="AI Assistant">
                <AIPromptPanel
                  currentCode={currentCode}
                  onApplyCode={handleApplyAICode}
                  username={username}
                  userId={userId}
                  ydoc={ydoc}
                  ytext={ytext}
                  aiQueue={aiQueue}
                  aiBranches={aiBranches}
                  files={files || undefined}
                  pendingAgentActions={pendingAgentActions || undefined}
                  onConflict={() => {
                    setShowConflictResolver(true);
                    setConflictFilePath("current");
                  }}
                />
              </ErrorBoundary>
            )}

            {activeTab === "chat" && ychat && (
              <ErrorBoundary panelName="Chat">
                <ChatPanel
                  ychat={ychat}
                  username={username}
                  userColor={userColor}
                />
              </ErrorBoundary>
            )}

            {activeTab === "terminal" && terminalOutput && (
              <ErrorBoundary panelName="Terminal">
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <TerminalPanel terminalOutput={terminalOutput} />
                </div>
              </ErrorBoundary>
            )}
          </div>
        </section>
      </div>

      {showConflictResolver && aiBranches && ydoc && ytext && (
        <ConflictResolver
          aiBranches={aiBranches}
          ytext={ytext}
          ydoc={ydoc}
          userId={userId}
          filePath={conflictFilePath}
          onClose={() => setShowConflictResolver(false)}
        />
      )}

      <AgentApprovalModal
        pendingActions={pendingActions}
        onApprove={approveAction}
        onReject={rejectAction}
      />
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
