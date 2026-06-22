"use client";

import { useEffect, useState } from "react";
import { WebsocketProvider } from "y-websocket";
import { UserPresenceState } from "@/lib/yjs-provider";

interface UserPresenceProps {
  provider: WebsocketProvider;
  currentUsername: string;
}

interface ConnectedUser {
  clientId: number;
  username: string;
  color: string;
  status: string;
}

export default function UserPresence({
  provider,
  currentUsername,
}: UserPresenceProps) {
  const [users, setUsers] = useState<ConnectedUser[]>([]);

  useEffect(() => {
    const updateUsers = () => {
      const connectedUsers: ConnectedUser[] = [];

      provider.awareness.getStates().forEach((state, clientId) => {
        const user = state.user as UserPresenceState | undefined;
        if (user) {
          connectedUsers.push({
            clientId,
            username: user.username,
            color: user.color,
            status: user.status || "idle",
          });
        }
      });

      setUsers(connectedUsers);
    };

    updateUsers();
    provider.awareness.on("change", updateUsers);

    return () => {
      provider.awareness.off("change", updateUsers);
    };
  }, [provider]);

  return (
    <div className="presence-bar">
      {users.map((user) => (
        <div
          key={user.clientId}
          className="presence-avatar tooltip"
          style={{ backgroundColor: user.color }}
          data-tooltip={`${user.username}${user.username === currentUsername ? " (you)" : ""}`}
        >
          {user.username.charAt(0).toUpperCase()}
        </div>
      ))}
      {users.length > 0 && (
        <span className="presence-count">
          {users.length} online
        </span>
      )}
    </div>
  );
}
