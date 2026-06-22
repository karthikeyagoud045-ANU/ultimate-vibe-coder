"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import * as Y from "yjs";

interface ChatMessage {
  username: string;
  text: string;
  timestamp: number;
  color: string;
  type: "user" | "system";
}

interface ChatPanelProps {
  ychat: Y.Array<unknown>;
  username: string;
  userColor: string;
}

export default function ChatPanel({ ychat, username, userColor }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    // Load existing messages
    const loadMessages = () => {
      const msgs = ychat.toArray() as ChatMessage[];
      setMessages(msgs);
    };

    loadMessages();

    // Listen for new messages
    const observer = () => {
      loadMessages();
    };

    ychat.observe(observer);

    return () => {
      ychat.unobserve(observer);
    };
  }, [ychat]);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const message: ChatMessage = {
      username,
      text: input.trim(),
      timestamp: Date.now(),
      color: userColor,
      type: "user",
    };

    ychat.push([message]);
    setInput("");
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-title">Team Chat</div>
            <div className="empty-state-desc">
              Messages are synced in real-time with all collaborators in this
              room.
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.type === "system") {
            return (
              <div key={i} className="chat-message-system">
                {msg.text}
              </div>
            );
          }

          return (
            <div key={i} className="chat-message">
              <div
                className="chat-message-avatar"
                style={{ backgroundColor: msg.color || "#3B82F6" }}
              >
                {msg.username.charAt(0).toUpperCase()}
              </div>
              <div className="chat-message-body">
                <div className="chat-message-header">
                  <span className="chat-message-name">{msg.username}</span>
                  <span className="chat-message-time">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                <div className="chat-message-text">{msg.text}</div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <form onSubmit={sendMessage} className="chat-input-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            maxLength={500}
            id="chat-input"
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!input.trim()}
            id="chat-send-btn"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
