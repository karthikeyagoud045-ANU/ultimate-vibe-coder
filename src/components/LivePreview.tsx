"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import * as Y from "yjs";
import {
  bootWebContainer,
  mountFileSystem,
  startDevServer,
  isWebContainerSupported,
} from "@/lib/webcontainer";

interface LivePreviewProps {
  files: Y.Map<unknown>;
  onTerminalOutput?: (output: string) => void;
}

export default function LivePreview({ files, onTerminalOutput }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isBooted, setIsBooted] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const mountedFilesRef = useRef<string>("");

  const handleStdout = useCallback(
    (text: string) => {
      onTerminalOutput?.(text);
    },
    [onTerminalOutput]
  );

  const handleStderr = useCallback(
    (text: string) => {
      onTerminalOutput?.(`[stderr] ${text}`);
    },
    [onTerminalOutput]
  );

  const mountFiles = useCallback(async () => {
    if (!isWebContainerSupported()) {
      setError(
        "WebContainer requires SharedArrayBuffer. Your browser may not support it or COOP/COEP headers are missing."
      );
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      if (!isBooted) {
        handleStdout("[WebContainer] Booting environment...\n");
        await bootWebContainer();
        setIsBooted(true);
      }

      handleStdout("[WebContainer] Mounting files...\n");
      await mountFileSystem(files, "/");

      const fileKeys = Array.from(files.keys()).join(",");
      if (fileKeys !== mountedFilesRef.current) {
        mountedFilesRef.current = fileKeys;
        handleStdout("[WebContainer] Files synced\n");
      }

      if (!previewUrl) {
        setIsInstalling(true);
        handleStdout("[WebContainer] Running npm install...\n");

        const serverResult = await startDevServer({
          onStdout: handleStdout,
          onStderr: handleStderr,
        });

        setIsInstalling(false);
        setIsStartingServer(false);
        setPreviewUrl(serverResult.url);
        handleStdout(`[WebContainer] Dev server running at ${serverResult.url}\n`);
      }

      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start WebContainer");
      setIsLoading(false);
      setIsInstalling(false);
      setIsStartingServer(false);
    }
  }, [files, isBooted, previewUrl, handleStdout, handleStderr]);

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      mountFiles();
    }, 500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [files, mountFiles]);

  if (!isWebContainerSupported()) {
    return (
      <div className="preview-container">
        <div className="preview-iframe-wrapper">
          <div className="preview-loading">
            <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠️</div>
            <div className="preview-loading-text" style={{ color: "var(--accent-orange)" }}>
              WebContainer requires SharedArrayBuffer
            </div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--text-tertiary)",
                maxWidth: 300,
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              Your browser does not support SharedArrayBuffer or COOP/COEP headers are not configured.
              Using basic preview mode instead.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-container">
      <div className="preview-iframe-wrapper">
        {isLoading && !previewUrl && (
          <div className="preview-loading">
            <div className="spinner" />
            <div className="preview-loading-text">
              {isInstalling
                ? "Installing dependencies..."
                : isStartingServer
                  ? "Starting dev server..."
                  : "Booting WebContainer..."}
            </div>
          </div>
        )}

        {previewUrl && (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            title="Live Preview"
            style={{
              opacity: isLoading ? 0 : 1,
              transition: "opacity 0.3s ease",
            }}
            onLoad={() => setIsLoading(false)}
          />
        )}

        {!previewUrl && !isLoading && (
          <div className="preview-loading">
            <div className="spinner" />
            <div className="preview-loading-text">Starting preview...</div>
          </div>
        )}
      </div>

      {error && (
        <div className="preview-error">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
