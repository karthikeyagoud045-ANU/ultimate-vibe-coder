/**
 * Code Execution Router
 *
 * Routes code execution to the appropriate runtime:
 * - JS/TS/HTML/CSS → WebContainers (in-browser)
 * - Python/Go/Rust/etc → Judge0 (server-side)
 */

import {
  shouldUseJudge0,
  executeFile as judge0Execute,
  ExecutionResult as Judge0Result,
} from "./judge0-client";

export interface ExecutionOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  runtime: "webcontainer" | "judge0";
  time?: string;
  memory?: number;
}

/**
 * Determine which runtime should execute a file
 */
export function getRuntimeForFile(filename: string): "webcontainer" | "judge0" {
  if (shouldUseJudge0(filename)) {
    return "judge0";
  }
  return "webcontainer";
}

/**
 * Execute code using Judge0 (for non-JS/TS languages)
 */
export async function executeWithJudge0(
  filename: string,
  sourceCode: string,
  stdin?: string
): Promise<ExecutionOutput> {
  const result: Judge0Result = await judge0Execute(filename, sourceCode, stdin);

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    runtime: "judge0",
    time: result.time,
    memory: result.memory,
  };
}

/**
 * Get a user-friendly message about the runtime being used
 */
export function getRuntimeMessage(filename: string): string {
  const runtime = getRuntimeForFile(filename);
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (runtime === "judge0") {
    const langMap: Record<string, string> = {
      py: "Python",
      go: "Go",
      rs: "Rust",
      java: "Java",
      c: "C",
      cpp: "C++",
      rb: "Ruby",
      php: "PHP",
      swift: "Swift",
      kt: "Kotlin",
      cs: "C#",
      scala: "Scala",
      r: "R",
      dart: "Dart",
    };
    const lang = langMap[ext] || ext.toUpperCase();
    return `[Judge0] Executing ${lang} code on remote server...`;
  }

  return "[WebContainer] Executing locally in browser...";
}
