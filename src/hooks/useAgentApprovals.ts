"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as Y from "yjs";
import { PendingAgentAction } from "@/lib/agent-tools";

/**
 * Custom hook that subscribes to pendingAgentActions Y.Map.
 * Returns the list of pending actions and approve/reject functions.
 */
export function useAgentApprovals(
  pendingAgentActions: Y.Map<unknown> | null
) {
  const [pendingActions, setPendingActions] = useState<PendingAgentAction[]>([]);
  const mapRef = useRef<Y.Map<unknown> | null>(null);

  // Sync Yjs map to React state
  useEffect(() => {
    if (!pendingAgentActions) return;

    mapRef.current = pendingAgentActions;

    const syncActions = () => {
      const actions: PendingAgentAction[] = [];
      pendingAgentActions.forEach((value) => {
        const map = value as Y.Map<string | number>;
        const action: PendingAgentAction = {
          id: (map.get("id") as string) || "",
          type: (map.get("type") as "write_file" | "run_terminal") || "write_file",
          target: (map.get("target") as string) || "",
          originalContent: (map.get("originalContent") as string) || "",
          proposedContent: (map.get("proposedContent") as string) || "",
          status: (map.get("status") as "pending" | "approved" | "rejected") || "pending",
          requestedBy: (map.get("requestedBy") as string) || "",
          timestamp: (map.get("timestamp") as number) || 0,
        };
        if (action.status === "pending") {
          actions.push(action);
        }
      });
      setPendingActions(actions);
    };

    syncActions();
    pendingAgentActions.observe(syncActions);

    return () => {
      pendingAgentActions.unobserve(syncActions);
    };
  }, [pendingAgentActions]);

  const approveAction = useCallback((actionId: string) => {
    const map = mapRef.current;
    if (!map) return;

    const action = map.get(actionId) as Y.Map<string> | undefined;
    if (action) {
      action.set("status", "approved");
      map.set(actionId, action);
    }
  }, []);

  const rejectAction = useCallback((actionId: string) => {
    const map = mapRef.current;
    if (!map) return;

    const action = map.get(actionId) as Y.Map<string> | undefined;
    if (action) {
      action.set("status", "rejected");
      map.set(actionId, action);
    }

    // Clean up after a short delay
    setTimeout(() => {
      map.delete(actionId);
    }, 1000);
  }, []);

  return { pendingActions, approveAction, rejectAction };
}
