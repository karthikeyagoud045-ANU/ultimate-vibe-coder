import * as Y from "yjs";
import { AIPromptQueueItem, AIBranch } from "./yjs-provider";
import { streamAIResponse, AIStreamRequest } from "./ai-client";
import { runAgentLoop } from "./agent-loop";

const CONFLICT_WINDOW_MS = 3000;

export interface QueueSubmitOptions {
  aiQueue: Y.Map<unknown>;
  aiBranches: Y.Map<unknown>;
  ytext: Y.Text;
  ydoc: Y.Doc;
  userId: string;
  username: string;
  prompt: string;
  targetFile: string;
  aiRequest: AIStreamRequest;
  agentMode?: boolean;
  files?: Y.Map<unknown>;
  pendingAgentActions?: Y.Map<unknown>;
  onConflict?: (branchA: AIBranch, branchB: AIBranch) => void;
  onProgress?: (text: string) => void;
  onAgentLog?: (entry: { type: "thought" | "tool" | "output"; content: string }) => void;
  onComplete?: (text: string) => void;
  onError?: (error: string) => void;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function checkForConflicts(
  aiQueue: Y.Map<unknown>,
  targetFile: string,
  userId: string
): AIPromptQueueItem | null {
  const now = Date.now();

  for (const [, value] of aiQueue.entries()) {
    const item = value as AIPromptQueueItem;
    if (
      item.targetFile === targetFile &&
      item.userId !== userId &&
      item.status === "processing" &&
      now - item.timestamp < CONFLICT_WINDOW_MS
    ) {
      return item;
    }
  }

  return null;
}

function extractCodeFromText(text: string): string | null {
  const match = text.match(/```[a-z]*\n([\s\S]*?)\n```/);
  if (match) {
    return match[1];
  }
  return text;
}

export async function submitPrompt(options: QueueSubmitOptions): Promise<void> {
  const {
    aiQueue,
    aiBranches,
    ytext,
    ydoc,
    userId,
    username,
    prompt,
    targetFile,
    aiRequest,
    agentMode,
    files,
    pendingAgentActions,
    onConflict,
    onProgress,
    onAgentLog,
    onComplete,
    onError,
  } = options;

  const promptId = generateId();

  const queueItem: AIPromptQueueItem = {
    id: promptId,
    userId,
    username,
    prompt,
    targetFile,
    timestamp: Date.now(),
    status: "processing",
  };

  aiQueue.set(promptId, queueItem);

  // Agent Mode: Run autonomous loop
  if (agentMode) {
    try {
      const result = await runAgentLoop({
        prompt,
        apiKey: aiRequest.apiKey,
        provider: aiRequest.provider,
        model: aiRequest.model,
        systemContext: `Current code context:\n\`\`\`\n${aiRequest.code}\n\`\`\``,
        ydoc,
        files: files || ydoc.getMap("files"),
        pendingAgentActions: pendingAgentActions || ydoc.getMap("pendingAgentActions"),
        userId,
        callbacks: {
          onThought: (thought) => onAgentLog?.({ type: "thought", content: thought }),
          onToolCall: (call) => onAgentLog?.({ type: "tool", content: `${call.name}(${JSON.stringify(call.arguments)})` }),
          onToolResult: (result) => onAgentLog?.({ type: "output", content: result.output }),
          onProgress: (text) => onProgress?.(text),
          onError: (err) => onError?.(err),
        },
      });

      // Try to extract and apply code from final result
      const extractedCode = extractCodeFromText(result);
      if (extractedCode) {
        ydoc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, extractedCode);
        });
      }

      queueItem.status = "completed";
      aiQueue.set(promptId, queueItem);
      onComplete?.(result);
    } catch (err) {
      queueItem.status = "completed";
      aiQueue.set(promptId, queueItem);
      onError?.(err instanceof Error ? err.message : "Agent loop failed");
    }
    return;
  }

  const conflictingItem = checkForConflicts(aiQueue, targetFile, userId);

  if (conflictingItem) {
    queueItem.status = "conflict";
    aiQueue.set(promptId, queueItem);

    const originalContent = ytext.toString();

    let branchAContent = "";
    let branchBContent = "";

    const branchAPromise = new Promise<string>((resolve) => {
      streamAIResponse(aiRequest, {
        onToken: () => {},
        onComplete: (text) => resolve(text),
        onError: () => resolve(""),
      });
    });

    const branchBRequest = { ...aiRequest };
    const branchBPromise = new Promise<string>((resolve) => {
      streamAIResponse(branchBRequest, {
        onToken: () => {},
        onComplete: (text) => resolve(text),
        onError: () => resolve(""),
      });
    });

    [branchAContent, branchBContent] = await Promise.all([
      branchAPromise,
      branchBPromise,
    ]);

    const branchA: AIBranch = {
      id: generateId(),
      promptId,
      userId,
      username,
      filePath: targetFile,
      originalContent,
      proposedContent: extractCodeFromText(branchAContent) || branchAContent,
      timestamp: Date.now(),
      votes: {},
    };

    const branchB: AIBranch = {
      id: generateId(),
      promptId: conflictingItem.id,
      userId: conflictingItem.userId,
      username: conflictingItem.username,
      filePath: targetFile,
      originalContent,
      proposedContent: extractCodeFromText(branchBContent) || branchBContent,
      timestamp: Date.now(),
      votes: {},
    };

    aiBranches.set(branchA.id, branchA);
    aiBranches.set(branchB.id, branchB);

    onConflict?.(branchA, branchB);
  } else {
    let fullResponse = "";

    await streamAIResponse(aiRequest, {
      onToken: (token) => {
        fullResponse += token;
        onProgress?.(fullResponse);
      },
      onComplete: (text) => {
        const extractedCode = extractCodeFromText(text);
        if (extractedCode) {
          ydoc.transact(() => {
            ytext.delete(0, ytext.length);
            ytext.insert(0, extractedCode);
          });
        }

        queueItem.status = "completed";
        aiQueue.set(promptId, queueItem);

        onComplete?.(text);
      },
      onError: (error) => {
        queueItem.status = "completed";
        aiQueue.set(promptId, queueItem);

        onError?.(error);
      },
    });
  }
}

export function acceptBranch(
  aiBranches: Y.Map<unknown>,
  branchId: string,
  userId: string,
  ytext: Y.Text,
  ydoc: Y.Doc
): void {
  const branch = aiBranches.get(branchId) as AIBranch | undefined;
  if (!branch) return;

  branch.votes[userId] = "accept";
  aiBranches.set(branchId, branch);

  const allBranches = getBranchesForFile(aiBranches, branch.filePath);
  let totalAccepts = 0;

  allBranches.forEach((b) => {
    const votes = Object.values(b.votes);
    totalAccepts += votes.filter((v) => v === "accept").length;
  });

  if (totalAccepts >= 2) {
    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, branch.proposedContent);
    });

    clearBranchesForFile(aiBranches, branch.filePath);
  }
}

export function rejectBranch(
  aiBranches: Y.Map<unknown>,
  branchId: string,
  userId: string
): void {
  const branch = aiBranches.get(branchId) as AIBranch | undefined;
  if (!branch) return;

  branch.votes[userId] = "reject";
  aiBranches.set(branchId, branch);

  const allBranches = getBranchesForFile(aiBranches, branch.filePath);
  let totalRejects = 0;

  allBranches.forEach((b) => {
    const votes = Object.values(b.votes);
    totalRejects += votes.filter((v) => v === "reject").length;
  });

  if (totalRejects >= 2) {
    clearBranchesForFile(aiBranches, branch.filePath);
  }
}

export function discardAllBranches(
  aiBranches: Y.Map<unknown>,
  filePath: string
): void {
  clearBranchesForFile(aiBranches, filePath);
}

function clearBranchesForFile(
  aiBranches: Y.Map<unknown>,
  filePath: string
): void {
  const toDelete: string[] = [];

  aiBranches.forEach((value, key) => {
    const branch = value as AIBranch;
    if (branch.filePath === filePath) {
      toDelete.push(key);
    }
  });

  toDelete.forEach((key) => aiBranches.delete(key));
}

export function getBranchesForFile(
  aiBranches: Y.Map<unknown>,
  filePath: string
): AIBranch[] {
  const branches: AIBranch[] = [];

  aiBranches.forEach((value) => {
    const branch = value as AIBranch;
    if (branch.filePath === filePath) {
      branches.push(branch);
    }
  });

  return branches.sort((a, b) => a.timestamp - b.timestamp);
}

export function getQueueStatus(
  aiQueue: Y.Map<unknown>
): {
  pending: number;
  processing: number;
  conflicts: number;
} {
  let pending = 0;
  let processing = 0;
  let conflicts = 0;

  aiQueue.forEach((value) => {
    const item = value as AIPromptQueueItem;
    switch (item.status) {
      case "pending":
        pending++;
        break;
      case "processing":
        processing++;
        break;
      case "conflict":
        conflicts++;
        break;
    }
  });

  return { pending, processing, conflicts };
}
