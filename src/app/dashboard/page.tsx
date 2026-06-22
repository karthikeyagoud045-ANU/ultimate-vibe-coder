"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

// DEV MODE: Mock user — no Supabase auth required
const DEV_USER = {
  id: "dev-user-001",
  username: "Developer",
  avatarUrl: "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=dev-user",
  email: "dev@vibeide.local",
};

export default function DashboardPage() {
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleCreateRoom = () => {
    const newRoomId = uuidv4().slice(0, 8);
    router.push(`/room/${newRoomId}`);
  };

  const user = DEV_USER;

  return (
    <div className="dashboard-page">
      <div className="landing-bg" />

      <header className="dashboard-header" style={{ position: "relative", zIndex: 2 }}>
        <div className="dashboard-header-left">
          <div className="topbar-logo">
            <div className="topbar-logo-icon">⚡</div>
            <span>Vibe Code</span>
          </div>
        </div>
        <div className="dashboard-header-right">
          <div className="user-menu">
            <button
              className="user-menu-trigger"
              onClick={() => setShowUserMenu(!showUserMenu)}
              id="dashboard-user-menu"
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
                <button
                  className="user-menu-item"
                  onClick={() => router.push("/")}
                  id="dashboard-sign-out"
                >
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="dashboard-content" style={{ position: "relative", zIndex: 1 }}>
        <h1 className="dashboard-title">Welcome back, {user.username} 👋</h1>
        <p className="dashboard-subtitle">
          Create a new room or join an existing one to start collaborating.
        </p>

        <div className="dashboard-actions">
          <button
            className="btn btn-primary"
            onClick={handleCreateRoom}
            id="dashboard-create-room"
          >
            ✨ Create New Room
          </button>
        </div>

        <div className="room-grid">
          <div
            className="room-card glass"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "var(--space-3xl)",
              cursor: "pointer",
              borderStyle: "dashed",
            }}
            onClick={handleCreateRoom}
          >
            <div style={{ fontSize: "2rem", marginBottom: "var(--space-md)", opacity: 0.4 }}>+</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-sm)" }}>
              Create new room
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
