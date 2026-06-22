/**
 * Application Constants - Centralized configuration for security, performance, and limits.
 * [HARDENING] Extracted all magic numbers and strings for maintainability and auditability.
 */

// ============================================================
// SECURITY LIMITS
// ============================================================

/** Maximum prompt length to prevent DoS via large payloads */
export const MAX_PROMPT_LENGTH = 100_000;

/** Maximum current-code context sent with an AI request (500KB) */
export const MAX_CODE_CONTEXT_LENGTH = 500_000;

/** Maximum file size for write operations (5MB) */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Maximum image base64 size (10MB for vision) */
export const MAX_IMAGE_BASE64_SIZE = 10 * 1024 * 1024;

/** Maximum model identifier length accepted from clients */
export const MAX_MODEL_ID_LENGTH = 128;

/** Maximum API key length accepted from clients */
export const MAX_API_KEY_LENGTH = 512;

/** Maximum terminal command length accepted from agents */
export const MAX_COMMAND_LENGTH = 1_000;

/** Maximum relative project path length accepted from agents */
export const MAX_FILE_PATH_LENGTH = 256;

/** Supported AI providers */
export const AI_PROVIDERS = ["openai", "anthropic", "google"] as const;

export type AIProvider = (typeof AI_PROVIDERS)[number];

/** Supported image MIME types for vision requests */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** Allowed origins for CORS (configured via env in production) */
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:3000",
  "https://*.vercel.app",
];

// ============================================================
// AGENT LIMITS
// ============================================================

/** Maximum agent loop iterations */
export const AGENT_MAX_ITERATIONS = 3;

/** Timeout waiting for human approval (2 minutes) */
export const APPROVAL_TIMEOUT_MS = 120_000;

/** Maximum terminal command output lines to store */
export const MAX_TERMINAL_OUTPUT_LINES = 500;

/** Commands that are blocked for security */
export const COMMAND_BLOCKLIST = [
  // Destructive commands
  "rm -rf",
  "rm -rf /",
  "rm -rf /*",
  "rm -rf ~",
  "rm -rf $HOME",
  "rm -fr",
  "rmdir /s",
  "del /f",
  "format ",
  // Shell injection vectors
  "curl | bash",
  "curl | sh",
  "wget | bash",
  "wget | sh",
  "bash -c",
  "sh -c",
  "eval ",
  "exec ",
  // Process manipulation
  "kill -9",
  "killall",
  "pkill",
  // Network exposure
  "nc -l",
  "netcat -l",
  "socat",
  // Privilege escalation
  "sudo",
  "su ",
  "chmod 777",
  "chmod -r 777",
  "chown root",
  // Filesystem escape
  "dd if=",
  "dd of=",
  "mkfs",
  "fdisk",
  "parted",
  "mount ",
  "umount ",
  "/etc/passwd",
  "/etc/shadow",
  "/dev/",
  // Crypto mining / abuse
  "cryptonight",
  "xmrig",
  "minerd",
];

/** Dangerous command patterns (regex) */
export const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+(\/|~|\$HOME|\*)/i,
  /\brm\s+-[a-z]*f[a-z]*r[a-z]*\s+(\/|~|\$HOME|\*)/i,
  /\b(curl|wget)\b[\s\S]*\|\s*(bash|sh|zsh|fish)\b/i,
  /\b(curl|wget)\b[\s\S]*\|\s*sudo\b/i,
  /\bsudo\b/i,
  /\bsu\s+-?\b/i,
  /\bchmod\s+(-R\s+)?777\b/i,
  /\bchown\s+(-R\s+)?root\b/i,
  /\b(dd|mkfs|fdisk|parted)\b/i,
  /\bmount\s+/i,
  /\bumount\s+/i,
  />\s*\/dev\/[a-z]+/i,
  /\b(nc|netcat)\s+.*\s-l\b/i,
  /\bsocat\b/i,
  /\b(eval|exec)\s+/i,
  /`[^`]+`/,
  /\$\([^)]*\)/,
  /(^|[\s;&|]):\(\)\s*\{\s*:\|:&\s*\};:/,
];

// ============================================================
// PERFORMANCE LIMITS
// ============================================================

/** Debounce file mounts (500ms) */
export const FILE_MOUNT_DEBOUNCE_MS = 500;

/** Throttle terminal output to Yjs (100ms) */
export const TERMINAL_OUTPUT_THROTTLE_MS = 100;

/** Maximum terminal output lines per second */
export const TERMINAL_OUTPUT_MAX_PER_SECOND = 100;

/** WebSocket reconnection base delay (1s) */
export const WS_RECONNECT_BASE_MS = 1_000;

/** WebSocket max reconnection delay (30s) */
export const WS_RECONNECT_MAX_MS = 30_000;

/** AI request hard timeout (120s) */
export const AI_REQUEST_TIMEOUT_MS = 120_000;

/** Rate limit: AI requests per minute per session */
export const AI_RATE_LIMIT_PER_MINUTE = 60;

/** Rate limit window for AI requests */
export const AI_RATE_LIMIT_WINDOW_MS = 60_000;

/** Rate limit: context requests per minute */
export const CONTEXT_RATE_LIMIT_PER_MINUTE = 30;

// ============================================================
// YJS / CRDT
// ============================================================

/** Maximum chat messages to keep in memory */
export const MAX_CHAT_MESSAGES = 100;

/** Yjs update batch window (ms) */
export const YJS_BATCH_WINDOW_MS = 50;

/** Large update threshold for compression (100KB) */
export const YJS_LARGE_UPDATE_THRESHOLD = 100 * 1024;

// ============================================================
// ERROR MESSAGES (User-facing, no sensitive info)
// ============================================================

export const ERROR_MESSAGES = {
  PROMPT_TOO_LONG: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
  FILE_TOO_LARGE: `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
  INVALID_FILE_PATH: "Invalid file path: path traversal not allowed",
  COMMAND_BLOCKED: "Command blocked for security reasons",
  INVALID_API_KEY: "Invalid API key. Please check and try again.",
  RATE_LIMITED: "Too many requests. Please wait before trying again.",
  PROVIDER_UNAVAILABLE: "AI provider temporarily unavailable. Try another provider.",
  INVALID_PROVIDER: "Unsupported AI provider",
  INVALID_REQUEST: "Invalid request payload",
  IMAGE_TOO_LARGE: `Image exceeds maximum size of ${MAX_IMAGE_BASE64_SIZE / (1024 * 1024)}MB`,
  INVALID_IMAGE_TYPE: "Unsupported image type",
  APPROVAL_TIMEOUT: "Approval timed out. Action cancelled.",
  MAX_ITERATIONS: "Agent reached maximum iterations. Please provide more specific guidance.",
  CONNECTION_LOST: "Connection lost. Attempting to reconnect...",
  WEBCONTAINER_UNAVAILABLE: "WebContainer unavailable. Please refresh the page.",
} as const;

// ============================================================
// VALIDATION HELPERS
// ============================================================

/** Type guard for supported AI providers */
export function isAIProvider(provider: string): provider is AIProvider {
  return AI_PROVIDERS.includes(provider as AIProvider);
}

/** Normalize a relative project path without using Node-only path APIs. */
export function normalizeRelativePath(filePath: string): string | null {
  const trimmed = filePath.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.length > MAX_FILE_PATH_LENGTH) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("~/")) return null;
  if (/^[a-zA-Z]:/.test(trimmed)) return null;
  if (trimmed.includes("\0")) return null;

  const parts: string[] = [];
  for (const part of trimmed.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }

  if (parts.length === 0) return null;
  return parts.join("/");
}

/** Validate file path - prevent directory traversal */
export function validateFilePath(filePath: string): { valid: boolean; normalizedPath?: string; reason?: string } {
  const normalizedPath = normalizeRelativePath(filePath);
  if (!normalizedPath) {
    return { valid: false, reason: ERROR_MESSAGES.INVALID_FILE_PATH };
  }

  return { valid: true, normalizedPath };
}

/** Validate terminal command against blocklist and patterns */
export function validateCommand(command: string): { valid: boolean; reason?: string } {
  const trimmed = command.trim();
  const lowered = trimmed.toLowerCase();

  if (!trimmed) {
    return { valid: false, reason: "Command cannot be empty" };
  }

  if (trimmed.length > MAX_COMMAND_LENGTH) {
    return { valid: false, reason: `Command exceeds maximum length of ${MAX_COMMAND_LENGTH} characters` };
  }

  // Check exact blocklist
  for (const blocked of COMMAND_BLOCKLIST) {
    if (lowered.includes(blocked.toLowerCase())) {
      return { valid: false, reason: `Blocked command: ${blocked}` };
    }
  }

  // Check dangerous patterns
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `Dangerous pattern detected: ${pattern.source}` };
    }
  }

  // Prevent command chaining and shell interpolation that can hide unsafe behavior.
  if (/[;&|`]/.test(trimmed) || /\$\(/.test(trimmed)) {
    return { valid: false, reason: "Command chaining or shell interpolation is not allowed" };
  }

  return { valid: true };
}

/** Sanitize string for safe display (basic XSS prevention) */
export function sanitizeForDisplay(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Check if origin is allowed */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) => {
    if (allowed.includes("*")) {
      const regex = new RegExp("^" + allowed.replace(/\*/g, ".*") + "$");
      return regex.test(origin);
    }
    return allowed === origin;
  });
}
