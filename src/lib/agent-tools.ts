import * as Y from "yjs";
import { ERROR_MESSAGES, MAX_FILE_SIZE, validateCommand, validateFilePath } from "./constants";
import { AgentToolError } from "./errors";

/**
 * Agent tool definitions for LLM function calling.
 * These schemas are sent to the LLM so it knows what tools are available.
 *
 * In HITL mode, write_file and run_terminal do NOT execute immediately.
 * They queue actions in pendingAgentActions for human approval.
 */

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, string>;
}

export interface AgentToolResult {
  id: string;
  name: string;
  output: string;
  success: boolean;
}

export interface PendingAgentAction {
  id: string;
  type: "write_file" | "run_terminal";
  target: string;
  originalContent: string;
  proposedContent: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  timestamp: number;
}

export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description: "Write content to a file in the project. Creates the file if it doesn't exist. NOTE: This action requires human approval before execution.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to the project root (e.g., 'src/App.tsx')",
          },
          content: {
            type: "string",
            description: "The full content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read the contents of a file from the project. This action does not require approval.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path relative to the project root (e.g., 'src/App.tsx')",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_terminal",
      description: "Execute a shell command in the WebContainer (e.g., 'npm test', 'npx lint'). NOTE: This action requires human approval before execution.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The full command to run (e.g., 'npm run test')",
          },
        },
        required: ["command"],
      },
    },
  },
] as const;

export type AgentToolName = (typeof AGENT_TOOLS)[number]["function"]["name"];

/**
 * Context provided to tools that need Yjs access for HITL queuing.
 */
export interface AgentToolContext {
  ydoc: Y.Doc;
  files: Y.Map<unknown>;
  pendingAgentActions: Y.Map<unknown>;
  userId: string;
}

/**
 * Generate a short unique ID for actions.
 */
function generateActionId(): string {
  return `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Execute a tool call. For write_file and run_terminal,
 * this queues the action for human approval instead of executing directly.
 */
export async function executeTool(
  call: AgentToolCall,
  context?: AgentToolContext
): Promise<AgentToolResult> {
  try {
    let output = "";

    switch (call.name) {
      case "write_file": {
        if (!context) {
          return { id: call.id, name: call.name, output: "Error: No context provided", success: false };
        }

        const filePathValidation = validateFilePath(call.arguments.path);
        if (!filePathValidation.valid || !filePathValidation.normalizedPath) {
          throw AgentToolError.validationFailed("write_file", filePathValidation.reason ?? ERROR_MESSAGES.INVALID_FILE_PATH);
        }

        const filePath = filePathValidation.normalizedPath;
        const proposedContent = call.arguments.content;
        if (proposedContent.length > MAX_FILE_SIZE) {
          throw AgentToolError.validationFailed("write_file", ERROR_MESSAGES.FILE_TOO_LARGE);
        }

        // Read current content from Yjs files map
        let originalContent = "";
        const pathParts = filePath.split("/").filter(Boolean);
        let current: Y.Map<unknown> = context.files;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = current.get(pathParts[i]);
          if (part instanceof Y.Map) {
            current = part;
          } else {
            current = new Y.Map();
            break;
          }
        }
        const fileContent = current.get(pathParts[pathParts.length - 1]);
        if (typeof fileContent === "string") {
          originalContent = fileContent;
        }

        // Create pending action
        const actionId = generateActionId();
        const action = new Y.Map() as Y.Map<string | number>;
        action.set("id", actionId);
        action.set("type", "write_file");
        action.set("target", filePath);
        action.set("originalContent", originalContent);
        action.set("proposedContent", proposedContent);
        action.set("status", "pending");
        action.set("requestedBy", context.userId);
        action.set("timestamp", Date.now());

        context.pendingAgentActions.set(actionId, action);

        output = `ACTION_QUEUED:write_file:${actionId}:File "${filePath}" has been queued for human approval. You must wait for the user to approve before continuing.`;
        break;
      }

      case "read_file": {
        const filePathValidation = validateFilePath(call.arguments.path);
        if (!filePathValidation.valid || !filePathValidation.normalizedPath) {
          throw AgentToolError.validationFailed("read_file", filePathValidation.reason ?? ERROR_MESSAGES.INVALID_FILE_PATH);
        }

        const filePath = filePathValidation.normalizedPath;

        // read_file does NOT require approval — execute directly
        if (!context) {
          // Fallback: try WebContainer
          const { readFile } = await import("./webcontainer");
          output = await readFile(filePath);
          break;
        }

        // Read from Yjs files map
        const pathParts = filePath.split("/").filter(Boolean);
        let current: Y.Map<unknown> = context.files;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = current.get(pathParts[i]);
          if (part instanceof Y.Map) {
            current = part;
          } else {
            output = `File not found: ${filePath}`;
            break;
          }
        }
        const fileContent = current.get(pathParts[pathParts.length - 1]);
        output = typeof fileContent === "string" ? fileContent : `File not found: ${filePath}`;
        break;
      }

      case "run_terminal": {
        if (!context) {
          return { id: call.id, name: call.name, output: "Error: No context provided", success: false };
        }

        const command = call.arguments.command;
        const commandValidation = validateCommand(command);
        if (!commandValidation.valid) {
          throw AgentToolError.validationFailed("run_terminal", commandValidation.reason ?? ERROR_MESSAGES.COMMAND_BLOCKED);
        }

        // Create pending action for terminal command
        const actionId = generateActionId();
        const action = new Y.Map() as Y.Map<string | number>;
        action.set("id", actionId);
        action.set("type", "run_terminal");
        action.set("target", command);
        action.set("originalContent", "");
        action.set("proposedContent", command);
        action.set("status", "pending");
        action.set("requestedBy", context.userId);
        action.set("timestamp", Date.now());

        context.pendingAgentActions.set(actionId, action);

        output = `ACTION_QUEUED:run_terminal:${actionId}:Command "${command}" has been queued for human approval. You must wait for the user to approve before continuing.`;
        break;
      }

      default:
        output = `Unknown tool: ${call.name}`;
    }

    return { id: call.id, name: call.name, output, success: true };
  } catch (err) {
    return {
      id: call.id,
      name: call.name,
      output: err instanceof Error ? err.message : "Unknown error",
      success: false,
    };
  }
}
