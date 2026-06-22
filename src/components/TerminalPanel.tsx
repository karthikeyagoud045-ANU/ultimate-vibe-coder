"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as Y from "yjs";

interface TerminalPanelProps {
  terminalOutput: Y.Array<unknown>;
}

interface TerminalLine {
  text: string;
  timestamp: number;
}

export default function TerminalPanel({ terminalOutput }: TerminalPanelProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [lineCount, setLineCount] = useState(0);

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const loadLines = () => {
      const allLines = terminalOutput.toArray() as TerminalLine[];
      setLines(allLines);
      setLineCount(allLines.length);
    };

    loadLines();

    const observer = () => {
      loadLines();
    };

    terminalOutput.observe(observer);

    return () => {
      terminalOutput.unobserve(observer);
    };
  }, [terminalOutput]);

  useEffect(scrollToBottom, [lines, scrollToBottom]);

  const clearTerminal = useCallback(() => {
    terminalOutput.delete(0, terminalOutput.length);
  }, [terminalOutput]);

  const copyToClipboard = useCallback(() => {
    const text = lines.map((l) => l.text).join("\n");
    navigator.clipboard.writeText(text);
  }, [lines]);

  return (
    <div
      className="terminal-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        height: isExpanded ? "200px" : "38px",
        borderTop: "1px solid var(--border-primary)",
        background: "var(--bg-primary)",
        transition: "height 0.2s ease",
      }}
    >
      <div
        className="panel-header"
        style={{
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="panel-title">
          <span>⌨️</span>
          <span>Terminal</span>
          {lineCount > 0 && (
            <span
              className="badge badge-blue"
              style={{ marginLeft: "var(--space-xs)" }}
            >
              {lineCount} lines
            </span>
          )}
        </div>
        <div className="panel-actions">
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard();
            }}
            title="Copy output"
            id="terminal-copy-btn"
          >
            📋
          </button>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              clearTerminal();
            }}
            title="Clear terminal"
            id="terminal-clear-btn"
          >
            🗑️
          </button>
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--text-tertiary)",
              transition: "transform 0.2s ease",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            ▲
          </span>
        </div>
      </div>

      {isExpanded && (
        <div
          ref={outputRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--space-sm) var(--space-md)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--font-size-xs)",
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            background: "hsl(228, 28%, 6%)",
          }}
        >
          {lines.length === 0 && (
            <div
              style={{
                color: "var(--text-tertiary)",
                fontStyle: "italic",
                padding: "var(--space-sm)",
              }}
            >
              Terminal output will appear here...
            </div>
          )}

          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                color: line.text.startsWith("[stderr]")
                  ? "var(--accent-red)"
                  : line.text.includes("Error")
                    ? "var(--accent-red)"
                    : line.text.includes("success") || line.text.includes("ready")
                      ? "var(--accent-green)"
                      : "var(--text-secondary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
