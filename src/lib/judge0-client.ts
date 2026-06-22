/**
 * Judge0 Client — Multi-language code execution fallback
 *
 * When WebContainers can't run a language (Python, Go, Rust, etc.),
 * this client sends code to a self-hosted Judge0 instance for execution.
 *
 * Judge0 API: https://judge0.com/docs
 */

const JUDGE0_API_URL = process.env.JUDGE0_API_URL || "";
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || "";

// Judge0 language IDs: https://judge0.com/docs/languages
export const LANGUAGE_IDS = {
  javascript: 102,   // Node.js 18.15.0
  typescript: 101,   // TypeScript 5.0.3
  python: 100,       // Python 3.11.2
  go: 107,           // Go 1.21.3
  rust: 108,         // Rust 1.65.0
  java: 104,         // Java 17.0.6
  c: 105,            // GCC 12.2.0
  cpp: 106,          // GCC 12.2.0
  ruby: 109,         // Ruby 3.2.2
  php: 110,          // PHP 8.2.3
  swift: 111,        // Swift 5.3.3
  kotlin: 112,       // Kotlin 1.8.20
  csharp: 113,       // C# 11.0
  scala: 114,        // Scala 3.2.2
  r: 115,            // R 4.3.1
  dart: 116,         // Dart 3.0.4
} as const;

export type LanguageKey = keyof typeof LANGUAGE_IDS;

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  status: string;
  time: string;
  memory: number;
  exitCode: number;
}

export interface Judge0Submission {
  stdout: string | null;
  stderr: string | null;
  status: {
    id: number;
    description: string;
  };
  time: string | null;
  memory: number | null;
  compile_output: string | null;
  message: string | null;
}

/**
 * Map file extensions to Judge0 language IDs
 */
export function getLanguageFromExtension(ext: string): LanguageKey | null {
  const mapping: Record<string, LanguageKey> = {
    js: "javascript",
    mjs: "javascript",
    ts: "typescript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    cc: "cpp",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    cs: "csharp",
    scala: "scala",
    r: "r",
    dart: "dart",
  };
  return mapping[ext.toLowerCase()] || null;
}

/**
 * Check if a language should be routed to Judge0
 * (i.e., it's not supported by WebContainers)
 */
export function shouldUseJudge0(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const judge0Lang = getLanguageFromExtension(ext);

  // WebContainers only support JS/TS natively
  if (ext === "js" || ext === "ts" || ext === "mjs" || ext === "html" || ext === "css" || ext === "json") {
    return false;
  }

  return judge0Lang !== null;
}

/**
 * Encode string to base64
 */
function encodeBase64(str: string): string {
  if (typeof btoa === "function") {
    return btoa(str);
  }
  return Buffer.from(str).toString("base64");
}

/**
 * Decode base64 to string
 */
function decodeBase64(str: string): string {
  if (typeof atob === "function") {
    return atob(str);
  }
  return Buffer.from(str, "base64").toString("utf-8");
}

/**
 * Submit code to Judge0 and wait for result
 */
export async function executeCode(
  sourceCode: string,
  languageId: number,
  stdin?: string
): Promise<ExecutionResult> {
  if (!JUDGE0_API_URL) {
    throw new Error("Judge0 API URL not configured. Set JUDGE0_API_URL environment variable.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (JUDGE0_API_KEY) {
    headers["X-Auth-Token"] = JUDGE0_API_KEY;
  }

  // Submit code
  const submissionPayload = {
    source_code: encodeBase64(sourceCode),
    language_id: languageId,
    stdin: stdin ? encodeBase64(stdin) : undefined,
  };

  const submitRes = await fetch(
    `${JUDGE0_API_URL}/submissions/?base64_encoded=true&wait=false`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(submissionPayload),
    }
  );

  if (!submitRes.ok) {
    const errorText = await submitRes.text();
    throw new Error(`Judge0 submission failed (${submitRes.status}): ${errorText}`);
  }

  const { token } = await submitRes.json();

  if (!token) {
    throw new Error("No submission token returned from Judge0");
  }

  // Poll for result
  const maxAttempts = 60; // 30 seconds max (500ms intervals)
  const intervalMs = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const statusRes = await fetch(
      `${JUDGE0_API_URL}/submissions/${token}?base64_encoded=true`,
      { headers }
    );

    if (!statusRes.ok) {
      continue;
    }

    const submission: Judge0Submission = await statusRes.json();

    // Status IDs: 1 = In Queue, 2 = Processing, 3+ = Terminal
    if (submission.status.id <= 2) {
      continue;
    }

    // Execution complete
    return {
      stdout: submission.stdout ? decodeBase64(submission.stdout) : "",
      stderr: submission.stderr
        ? decodeBase64(submission.stderr)
        : submission.compile_output
          ? decodeBase64(submission.compile_output)
          : submission.message || "",
      status: submission.status.description,
      time: submission.time || "0",
      memory: submission.memory || 0,
      exitCode: submission.status.id === 3 ? 0 : submission.status.id,
    };
  }

  throw new Error("Judge0 execution timed out after 30 seconds");
}

/**
 * Execute a file using Judge0 based on its extension
 */
export async function executeFile(
  filename: string,
  sourceCode: string,
  stdin?: string
): Promise<ExecutionResult> {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const language = getLanguageFromExtension(ext);

  if (!language) {
    throw new Error(`Unsupported language for file: ${filename}`);
  }

  const languageId = LANGUAGE_IDS[language];
  return executeCode(sourceCode, languageId, stdin);
}
