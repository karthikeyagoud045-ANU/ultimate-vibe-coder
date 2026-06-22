"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { PendingAgentAction } from "@/lib/agent-tools";

const MonacoDiffEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="agent-diff-loading">
        <div className="spinner" />
        <span>Loading Diff...</span>
      </div>
    ),
  }
);

interface AgentApprovalModalProps {
  pendingActions: PendingAgentAction[];
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
}

function getLanguageFromPath(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "ts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "css":
      return "css";
    case "json":
      return "json";
    case "html":
      return "html";
    case "md":
      return "markdown";
    default:
      return "plaintext";
  }
}

export default function AgentApprovalModal({
  pendingActions,
  onApprove,
  onReject,
}: AgentApprovalModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingActions.length === 0) return;

    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    
    // Attempt to focus the "Approve" button by default or fallback to first
    const approveBtn = modal.querySelector(".btn-approve") as HTMLElement | null;
    if (approveBtn) {
      approveBtn.focus();
    } else {
      firstElement.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pendingActions]);

  if (pendingActions.length === 0) return null;

  const action = pendingActions[0]; // Show first pending action

  return (
    <div
      className="agent-approval-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-modal-title"
      aria-describedby="approval-modal-desc"
    >
      <div className="agent-approval-modal glass" ref={modalRef}>
        <div className="agent-approval-header">
          <div className="agent-approval-icon" aria-hidden="true">
            {action.type === "write_file" ? "📝" : "⚡"}
          </div>
          <div>
            <h2 id="approval-modal-title" className="agent-approval-title">
              {action.type === "write_file" ? "File Change Requested" : "Command Execution Requested"}
            </h2>
            <p id="approval-modal-desc" className="agent-approval-subtitle">
              {action.type === "write_file"
                ? `Agent wants to write to: ${action.target}`
                : `Agent wants to run: ${action.target}`}
            </p>
          </div>
        </div>

        <div className="agent-approval-body">
          {action.type === "write_file" ? (
            <div className="agent-diff-container">
              <div className="agent-diff-header">
                <span className="agent-diff-label agent-diff-original">Current</span>
                <span className="agent-diff-label agent-diff-proposed">Proposed</span>
              </div>
              <div className="agent-diff-content">
                <MonacoDiffEditor
                  original={action.originalContent || ""}
                  modified={action.proposedContent}
                  language={getLanguageFromPath(action.target)}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    fontSize: 12,
                    wordWrap: "on",
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="agent-command-warning">
              <div className="agent-command-icon">⚠️</div>
              <div className="agent-command-text">
                <p>This command will be executed in the WebContainer:</p>
                <pre className="agent-command-code">{action.target}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="agent-approval-actions">
          <button
            className="btn btn-ghost btn-reject"
            onClick={() => onReject(action.id)}
            aria-label={`Reject ${action.type === "write_file" ? "file change" : "command"} and halt agent`}
          >
            ✕ Reject & Halt
          </button>
          <button
            className="btn btn-primary btn-approve"
            onClick={() => onApprove(action.id)}
            aria-label={`Approve ${action.type === "write_file" ? "file change" : "command"} and execute`}
          >
            ✓ Approve & Execute
          </button>
        </div>

        {pendingActions.length > 1 && (
          <div className="agent-approval-queue">
            +{pendingActions.length - 1} more action{pendingActions.length > 1 ? "s" : ""} pending
          </div>
        )}
      </div>
    </div>
  );
}
