import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { WS_RECONNECT_BASE_MS, WS_RECONNECT_MAX_MS } from "./constants";

export interface UserPresenceState {
  userId: string;
  username: string;
  avatarUrl: string;
  color: string;
  status?: string;
  cursor?: { lineNumber: number; column: number } | null;
  selection?: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
}


export interface AIPromptQueueItem {
  id: string;
  userId: string;
  username: string;
  prompt: string;
  targetFile: string;
  timestamp: number;
  status: "pending" | "processing" | "completed" | "conflict";
}

export interface AIBranch {
  id: string;
  promptId: string;
  userId: string;
  username: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  timestamp: number;
  votes: { [userId: string]: "accept" | "reject" };
}

const colors = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", 
  "#22c55e", "#06b6d4", "#3b82f6", "#6366f1", 
  "#a855f7", "#ec4899"
];

function getRandomColor() {
  return colors[Math.floor(Math.random() * colors.length)];
}

let providerInstance: WebsocketProvider | null = null;
let providerCleanup: (() => void) | null = null;

type ProviderStatus = "connected" | "disconnected" | "connecting";

function installReconnectBackoff(provider: WebsocketProvider): () => void {
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let isDisposed = false;

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const emitStatus = (status: ProviderStatus) => {
    provider.emit("status", [{ status }]);
  };

  const scheduleReconnect = () => {
    if (isDisposed) return;

    provider.shouldConnect = false;
    clearReconnectTimer();

    const delay = Math.min(
      WS_RECONNECT_BASE_MS * 2 ** reconnectAttempt,
      WS_RECONNECT_MAX_MS
    );
    reconnectAttempt += 1;
    emitStatus("connecting");

    reconnectTimer = setTimeout(() => {
      if (isDisposed) return;
      provider.shouldConnect = true;
      provider.connect();
    }, delay);
  };

  const handleStatus = ({ status }: { status: ProviderStatus }) => {
    if (status === "connected") {
      reconnectAttempt = 0;
      clearReconnectTimer();
    }
  };

  const handleConnectionClose = () => {
    scheduleReconnect();
  };

  provider.on("status", handleStatus);
  provider.on("connection-close", handleConnectionClose);

  emitStatus("connecting");
  provider.connect();

  return () => {
    isDisposed = true;
    clearReconnectTimer();
    provider.off("status", handleStatus);
    provider.off("connection-close", handleConnectionClose);
  };
}

export interface YjsUserInfo {
  userId: string;
  username: string;
  avatarUrl: string;
}

export function getYjsProvider(roomId: string, user: YjsUserInfo) {
  if (providerInstance) {
    providerCleanup?.();
    providerInstance.destroy();
    providerCleanup = null;
  }

  const ydoc = new Y.Doc();
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:1234";
  
  const provider = new WebsocketProvider(wsUrl, roomId, ydoc, {
    connect: false,
    maxBackoffTime: WS_RECONNECT_MAX_MS,
  });
  
  const userState: UserPresenceState = {
    userId: user.userId,
    username: user.username,
    avatarUrl: user.avatarUrl,
    color: getRandomColor(),
    status: "online"
  };

  provider.awareness.setLocalStateField("user", userState);


  const ytext = ydoc.getText("monaco");
  const ychat = ydoc.getArray("chat");
  const aiQueue = ydoc.getMap("aiQueue");
  const aiBranches = ydoc.getMap("aiBranches");
  const terminalOutput = ydoc.getArray("terminalOutput");
  const files = ydoc.getMap("files");
  const pendingAgentActions = ydoc.getMap("pendingAgentActions");

  providerInstance = provider;
  providerCleanup = installReconnectBackoff(provider);

  return { 
    provider, 
    ydoc, 
    ytext, 
    ychat,
    aiQueue,
    aiBranches,
    terminalOutput,
    files,
    pendingAgentActions
  };
}

export function destroyYjsProvider() {
  if (providerInstance) {
    providerCleanup?.();
    providerInstance.destroy();
    providerInstance = null;
    providerCleanup = null;
  }
}

export function updatePresence(provider: WebsocketProvider, partialState: Partial<UserPresenceState>) {
  const currentState = provider.awareness.getLocalState()?.user as UserPresenceState | undefined;
  if (currentState) {
    provider.awareness.setLocalStateField("user", { ...currentState, ...partialState });
  }
}
