"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import * as Y from "yjs";
import {
  AIMessage,
  extractCodeFromResponse,
  AIStreamRequest,
} from "@/lib/ai-client";
import { submitPrompt } from "@/lib/agentic-queue";

interface AIPromptPanelProps {
  currentCode: string;
  onApplyCode: (code: string) => void;
  username: string;
  userId: string;
  ydoc: Y.Doc;
  ytext: Y.Text;
  aiQueue: Y.Map<unknown>;
  aiBranches: Y.Map<unknown>;
  files?: Y.Map<unknown>;
  pendingAgentActions?: Y.Map<unknown>;
  onConflict?: () => void;
  onStatusChange?: (status: "idle" | "prompting") => void;
}

export default function AIPromptPanel({
  currentCode,
  onApplyCode,
  username,
  userId,
  ydoc,
  ytext,
  aiQueue,
  aiBranches,
  files,
  pendingAgentActions,
  onConflict,
  onStatusChange,
}: AIPromptPanelProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"openai" | "anthropic" | "google">(
    "openai"
  );
  const [model, setModel] = useState("gpt-4o");
  const [streamingContent, setStreamingContent] = useState("");
  const [isQueued, setIsQueued] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [agentLog, setAgentLog] = useState<Array<{ type: "thought" | "tool" | "output"; content: string }>>([]);

  // Image upload state
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/png");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages, streamingContent, agentLog, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [prompt]);

  // Image processing with compression
  const processImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxWidth = 1024;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL(file.type, 0.8);
          const base64 = compressed.split(",")[1] || "";
          setImageBase64(base64);
          setImageMimeType(file.type);
          setImagePreview(compressed);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processImage(file);
  }, [processImage]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  }, [processImage]);

  const removeImage = useCallback(() => {
    setImageBase64(null);
    setImageMimeType("image/png");
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !apiKey.trim() || isStreaming) return;

    const userMessage: AIMessage = {
      role: "user",
      content: prompt.trim(),
      timestamp: Date.now(),
      username,
    };

    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    setIsStreaming(true);
    setIsQueued(true);
    setStreamingContent("");
    if (agentMode) setAgentLog([]);
    onStatusChange?.("prompting");

    const aiRequest: AIStreamRequest = {
      prompt: prompt.trim(),
      code: currentCode,
      apiKey,
      provider,
      model,
      imageBase64: imageBase64 || undefined,
      imageMimeType: imageBase64 ? imageMimeType : undefined,
    };

    // Clear image after building request
    removeImage();

    await submitPrompt({
      aiQueue,
      aiBranches,
      ytext,
      ydoc,
      userId,
      username,
      prompt: prompt.trim(),
      targetFile: "current",
      aiRequest,
      agentMode,
      files,
      pendingAgentActions,
      onConflict: () => {
        onConflict?.();
        setIsStreaming(false);
        setIsQueued(false);
        setStreamingContent("");
        onStatusChange?.("idle");
      },
      onProgress: (text) => {
        setStreamingContent(text);
      },
      onAgentLog: (entry) => {
        setAgentLog((prev) => [...prev, entry]);
      },
      onComplete: (fullText) => {
        const aiMessage: AIMessage = {
          role: "assistant",
          content: fullText,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, aiMessage]);
        setStreamingContent("");
        setIsStreaming(false);
        setIsQueued(false);
        onStatusChange?.("idle");
      },
      onError: (error) => {
        const errorMessage: AIMessage = {
          role: "system",
          content: `Error: ${error}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setStreamingContent("");
        setIsStreaming(false);
        setIsQueued(false);
        onStatusChange?.("idle");
      },
    });
  };

  const handleApplyCode = (content: string) => {
    const code = extractCodeFromResponse(content);
    if (code) {
      onApplyCode(code);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const providerModels: Record<string, string[]> = {
    openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    anthropic: ["claude-3-opus-20240229", "claude-3-sonnet-20240229"],
    google: ["gemini-1.5-pro", "gemini-1.5-flash"],
  };

  return (
    <div className="ai-panel">
      {/* Agent Mode Toggle */}
      <div className="ai-mode-toggle">
        <button
          className={`btn btn-sm ${agentMode ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setAgentMode(!agentMode)}
          title="Agent Mode: AI can run commands and fix code autonomously"
        >
          {agentMode ? "🤖 Agent ON" : "🤖 Agent Mode"}
        </button>
        {agentMode && (
          <span className="badge badge-yellow">Max 3 iterations</span>
        )}
      </div>

      {/* Messages */}
      <div className="ai-messages">
        {messages.length === 0 && !streamingContent && (
          <div className="empty-state">
            <div className="empty-state-icon">🤖</div>
            <div className="empty-state-title">AI Assistant</div>
            <div className="empty-state-desc">
              Enter your API key below and ask the AI to generate or modify
              code. Drop an image to convert designs to code.
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`ai-message ${
              msg.role === "user"
                ? "ai-message-user"
                : msg.role === "system"
                  ? "ai-message-user"
                  : "ai-message-assistant"
            }`}
          >
            <div className="ai-message-header">
              <span>
                {msg.role === "user"
                  ? `👤 ${msg.username || "You"}`
                  : msg.role === "system"
                    ? "⚠️ System"
                    : "🤖 AI"}
              </span>
              <span>
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="ai-message-content">
              {msg.content.split("```").map((part, idx) => {
                if (idx % 2 === 1) {
                  const lines = part.split("\n");
                  const code = lines.slice(1).join("\n");
                  return (
                    <pre key={idx}>
                      <code>{code || part}</code>
                    </pre>
                  );
                }
                return <span key={idx}>{part}</span>;
              })}
            </div>
            {msg.role === "assistant" &&
              extractCodeFromResponse(msg.content) && (
                <div className="ai-message-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleApplyCode(msg.content)}
                  >
                    ✓ Apply to Editor
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        extractCodeFromResponse(msg.content) || ""
                      )
                    }
                  >
                    📋 Copy
                  </button>
                </div>
              )}
          </div>
        ))}

        {/* Agent Log */}
        {agentMode && agentLog.length > 0 && (
          <div className="agent-log">
            {agentLog.map((entry, i) => (
              <div key={i} className={`agent-log-entry agent-log-${entry.type}`}>
                <span className="agent-log-icon">
                  {entry.type === "thought" ? "💭" : entry.type === "tool" ? "🔧" : "📤"}
                </span>
                <pre>{entry.content}</pre>
              </div>
            ))}
          </div>
        )}

        {/* Streaming message */}
        {streamingContent && (
          <div className="ai-message ai-message-assistant">
            <div className="ai-message-header">
              <span>🤖 AI</span>
              <span className="badge badge-blue">
                <span className="spinner spinner-sm" />{" "}
                {isQueued ? "Queued..." : agentMode ? "Thinking..." : "Generating..."}
              </span>
            </div>
            <div className="ai-message-content">
              {streamingContent.split("```").map((part, idx) => {
                if (idx % 2 === 1) {
                  const lines = part.split("\n");
                  const code = lines.slice(1).join("\n");
                  return (
                    <pre key={idx}>
                      <code>{code || part}</code>
                    </pre>
                  );
                }
                return <span key={idx}>{part}</span>;
              })}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Image Preview */}
      {imagePreview && (
        <div className="ai-image-preview">
          <img src={imagePreview} alt="Upload preview" />
          <button className="btn btn-ghost btn-sm" onClick={removeImage}>✕</button>
        </div>
      )}

      {/* Input Area */}
      <div className="ai-input-area">
        {/* Drag and Drop Zone */}
        <div
          className={`ai-drop-zone ${isDragging ? "ai-drop-zone-active" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="ai-drop-zone-text">
            📷 Drop image or click to upload
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="ai-input-row">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                apiKey
                  ? imageBase64
                    ? "Describe how to implement this design..."
                    : agentMode
                      ? "e.g. 'Run tests and fix any failures'..."
                      : "Describe what you want to build..."
                  : "Enter your API key first ↓"
              }
              disabled={isStreaming || !apiKey}
              rows={1}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isStreaming || !prompt.trim() || !apiKey}
            >
              {isStreaming ? (
                <span className="spinner spinner-sm" />
              ) : agentMode ? (
                "🤖"
              ) : (
                "→"
              )}
            </button>
          </div>
        </form>

        <div className="ai-settings">
          <select
            value={provider}
            onChange={(e) => {
              const p = e.target.value as "openai" | "anthropic" | "google";
              setProvider(p);
              setModel(providerModels[p][0]);
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
          </select>

          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {providerModels[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key"
          />
        </div>
      </div>
    </div>
  );
}
