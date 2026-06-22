"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Friendly name shown in the fallback UI (e.g. "Editor", "Chat") */
  panelName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — catches rendering crashes in child components
 * and shows a graceful, on-brand fallback instead of a white screen.
 *
 * Wrap each major panel (Editor, Preview, AI, Chat, Terminal) in its
 * own ErrorBoundary so that a crash in one does not affect the others.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `[ErrorBoundary:${this.props.panelName ?? "unknown"}]`,
      error,
      errorInfo.componentStack
    );
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const panelName = this.props.panelName ?? "Component";

      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "var(--space-3xl)",
            textAlign: "center",
            gap: "var(--space-lg)",
            background: "var(--bg-primary)",
          }}
          role="alert"
        >
          {/* Icon */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-lg)",
              background: "hsla(0, 72%, 58%, 0.1)",
              border: "1px solid hsla(0, 72%, 58%, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
            }}
          >
            💥
          </div>

          {/* Title */}
          <h3
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {panelName} crashed
          </h3>

          {/* Description */}
          <p
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--text-secondary)",
              maxWidth: 320,
              lineHeight: 1.6,
            }}
          >
            Something went wrong in the {panelName.toLowerCase()} panel. Your
            other panels are still working fine.
          </p>

          {/* Error detail (collapsed) */}
          {this.state.error && (
            <pre
              style={{
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--font-mono)",
                color: "var(--accent-red)",
                background: "hsla(0, 72%, 58%, 0.05)",
                border: "1px solid hsla(0, 72%, 58%, 0.15)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-md)",
                maxWidth: "100%",
                overflow: "auto",
                maxHeight: 80,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.error.message}
            </pre>
          )}

          {/* Reload button */}
          <button
            className="btn btn-primary btn-sm"
            onClick={this.handleReload}
            id={`error-boundary-reload-${panelName.toLowerCase().replace(/\s+/g, "-")}`}
          >
            ↻ Reload {panelName}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
