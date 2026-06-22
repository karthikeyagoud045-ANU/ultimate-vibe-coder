import { WebContainer, FileSystemTree } from "@webcontainer/api";
import * as Y from "yjs";
import {
  FILE_MOUNT_DEBOUNCE_MS,
  TERMINAL_OUTPUT_MAX_PER_SECOND,
  TERMINAL_OUTPUT_THROTTLE_MS,
} from "./constants";
import { showToast } from "@/hooks/useToast";
import { logger } from "@/lib/logger";

let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let pendingMountRequest: { yFiles: Y.Map<unknown>; targetPath: string } | null = null;
let mountDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let mountQueue: Promise<void> = Promise.resolve();
let pendingMountCallbacks: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
const trackedProcesses: Array<{ kill: () => void }> = [];

export function bootWebContainer(): Promise<WebContainer> {
  if (webcontainerInstance) {
    return Promise.resolve(webcontainerInstance);
  }

  if (bootPromise) {
    return bootPromise;
  }

  if (typeof window === "undefined") {
    throw new Error("WebContainer can only run in browser environment");
  }

  if (!window.crossOriginIsolated) {
    showToast(
      "SharedArrayBuffer not available - WebContainer requires COOP/COEP headers.",
      "warning"
    );
  }

  bootPromise = (async () => {
    try {
      logger.info("Booting", { component: "WebContainer" });
      const instance = await WebContainer.boot();
      webcontainerInstance = instance;
      logger.info("Booted successfully", { component: "WebContainer" });
      return instance;
    } catch (err) {
      bootPromise = null;
      logger.error("Boot failed", { component: "WebContainer", error: err });
      showToast("WebContainer boot failed. Check console.", "error");
      throw err;
    }
  })();

  return bootPromise;
}

export function getWebContainerInstance(): WebContainer | null {
  return webcontainerInstance;
}

function buildFileSystemTree(
  yFiles: Y.Map<unknown>,
  basePath: string
): FileSystemTree {
  const tree: FileSystemTree = {};

  yFiles.forEach((value, key) => {
    const filePath = basePath === "/" ? `/${key}` : `${basePath}/${key}`;

    if (typeof value === "string") {
      setFileInTree(tree, filePath, value);
    } else if (value instanceof Y.Map) {
      setDirectoryInTree(tree, filePath);
      mountYMapToTree(value, filePath, tree);
    }
  });

  return tree;
}

function setFileInTree(tree: FileSystemTree, path: string, content: string): void {
  const parts = path.split("/").filter(Boolean);
  let current: FileSystemTree = tree;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = { directory: {} };
    }
    current = (current[part] as { directory: FileSystemTree }).directory;
  }

  const fileName = parts[parts.length - 1];
  current[fileName] = { file: { contents: content } };
}

function setDirectoryInTree(tree: FileSystemTree, path: string): void {
  const parts = path.split("/").filter(Boolean);
  let current: FileSystemTree = tree;

  for (const part of parts) {
    if (!current[part]) {
      current[part] = { directory: {} };
    }
    current = (current[part] as { directory: FileSystemTree }).directory;
  }
}

function mountYMapToTree(
  yMap: Y.Map<unknown>,
  basePath: string,
  tree: FileSystemTree
): void {
  yMap.forEach((value, key) => {
    const fullPath = `${basePath}/${key}`;

    if (typeof value === "string") {
      setFileInTree(tree, fullPath, value);
    } else if (value instanceof Y.Map) {
      setDirectoryInTree(tree, fullPath);
      mountYMapToTree(value, fullPath, tree);
    }
  });
}

export async function mountFileSystem(
  yFiles: Y.Map<unknown>,
  targetPath = "/"
): Promise<void> {
  pendingMountRequest = { yFiles, targetPath };

  return new Promise<void>((resolve, reject) => {
    pendingMountCallbacks.push({ resolve, reject });

    if (mountDebounceTimer) {
      clearTimeout(mountDebounceTimer);
    }

    mountDebounceTimer = setTimeout(() => {
      flushPendingMount();
    }, FILE_MOUNT_DEBOUNCE_MS);
  });
}

function flushPendingMount(): void {
  if (!pendingMountRequest) return;

  const request = pendingMountRequest;
  const callbacks = pendingMountCallbacks;
  pendingMountRequest = null;
  pendingMountCallbacks = [];
  mountDebounceTimer = null;

  mountQueue = mountQueue
    .catch(() => undefined)
    .then(async () => {
      const instance = await bootWebContainer();
      const tree = buildFileSystemTree(request.yFiles, request.targetPath);
      await instance.mount(tree);
    })
    .then(() => {
      callbacks.forEach(({ resolve }) => resolve());
    })
    .catch((error: unknown) => {
      showToast("Failed to mount file system to WebContainer.", "error");
      callbacks.forEach(({ reject }) => reject(error));
    });
}

interface OutputThrottle {
  write: (chunk: string) => void;
  flush: () => void;
  close: () => void;
}

function createOutputThrottle(onOutput?: (text: string) => void): OutputThrottle {
  const maxLinesPerFlush = Math.max(
    1,
    Math.ceil((TERMINAL_OUTPUT_MAX_PER_SECOND * TERMINAL_OUTPUT_THROTTLE_MS) / 1_000)
  );
  const buffer: string[] = [];
  let trailingPartial = "";
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleFlush = () => {
    if (!onOutput || flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, TERMINAL_OUTPUT_THROTTLE_MS);
  };

  const flush = () => {
    if (!onOutput) {
      buffer.length = 0;
      trailingPartial = "";
      return;
    }

    const batch = buffer.splice(0, maxLinesPerFlush);
    if (batch.length > 0) {
      onOutput(batch.join("\n") + "\n");
    }

    if (buffer.length > 0) {
      scheduleFlush();
    }
  };

  return {
    write(chunk: string) {
      if (!onOutput) return;

      const text = trailingPartial + chunk;
      const lines = text.split(/\r?\n/);
      trailingPartial = lines.pop() ?? "";
      buffer.push(...lines.filter((line) => line.length > 0));
      scheduleFlush();
    },
    flush() {
      if (trailingPartial) {
        buffer.push(trailingPartial);
        trailingPartial = "";
      }
      flush();
    },
    close() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      this.flush();
    },
  };
}

async function pipeProcessOutput(
  output: ReadableStream<string>,
  onOutput?: (text: string) => void
): Promise<void> {
  const throttle = createOutputThrottle(onOutput);

  await output.pipeTo(
    new WritableStream<string>({
      write(chunk) {
        throttle.write(chunk);
      },
      close() {
        throttle.close();
      },
      abort() {
        throttle.close();
      },
    })
  );
}

export interface DevServerOptions {
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
  onExit?: (code: number) => void;
}

export async function startDevServer(
  options: DevServerOptions = {}
): Promise<{ port: number; url: string }> {
  const instance = await bootWebContainer();

  logger.info("Installing dependencies", { component: "WebContainer" });
  const installProcess = await instance.spawn("npm", ["install"]);
  trackedProcesses.push(installProcess);

  const installOutput = pipeProcessOutput(installProcess.output, options.onStdout);

  await installProcess.exit;
  await installOutput.catch(() => undefined);
  logger.info("Dependencies installed", { component: "WebContainer" });

  logger.info("Starting dev server", { component: "WebContainer" });
  const devProcess = await instance.spawn("npm", ["run", "dev"]);
  trackedProcesses.push(devProcess);

  pipeProcessOutput(devProcess.output, options.onStdout).catch(() => undefined);

  devProcess.exit.then((code) => {
    options.onExit?.(code);
  });

  return new Promise((resolve) => {
    instance.on("server-ready", (port, url) => {
      logger.info("Dev server running", { component: "WebContainer", port, url });
      resolve({ port, url });
    });
  });
}

export async function writeFile(path: string, content: string): Promise<void> {
  const instance = await bootWebContainer();
  await instance.fs.writeFile(path, content);
}

export async function readFile(path: string): Promise<string> {
  const instance = await bootWebContainer();
  const file = await instance.fs.readFile(path, "utf-8");
  return file;
}

export async function removeFile(path: string): Promise<void> {
  const instance = await bootWebContainer();
  await instance.fs.rm(path, { recursive: true });
}

/**
 * Execute a shell command in the WebContainer and return stdout + stderr.
 * Used by the Agent Mode for autonomous code execution.
 */
export async function executeCommand(
  command: string[],
  options?: { workDir?: string; timeoutMs?: number }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const instance = await bootWebContainer();
  const timeout = options?.timeoutMs ?? 30000;

  const [cmd, ...args] = command;
  const process = await instance.spawn(cmd, args, {
    cwd: options?.workDir,
  });
  trackedProcesses.push(process);

  let stdout = "";
  const stderr = "";

  process.output.pipeTo(
    new WritableStream<string>({
      write(chunk) {
        stdout += chunk;
      },
    })
  );

  // Capture stderr separately via exit
  const exitPromise = process.exit;
  const timeoutPromise = new Promise<number>((_, reject) =>
    setTimeout(() => reject(new Error(`Command timed out after ${timeout}ms`)), timeout)
  );

  try {
    const exitCode = await Promise.race([exitPromise, timeoutPromise]);
    return { stdout, stderr, exitCode: exitCode as number };
  } catch (err) {
    process.kill();
    return { stdout, stderr: err instanceof Error ? err.message : "Unknown error", exitCode: 1 };
  }
}

export function isWebContainerSupported(): boolean {
  if (typeof window === "undefined") return false;
  return window.crossOriginIsolated === true;
}

export function teardown(): void {
  trackedProcesses.forEach(p => {
    try {
      p.kill();
    } catch (e) {
      // Ignore kill errors
    }
  });
  trackedProcesses.length = 0;

  if (mountDebounceTimer) {
    clearTimeout(mountDebounceTimer);
    mountDebounceTimer = null;
  }

  pendingMountCallbacks.forEach(({ reject }) => reject(new Error("WebContainer teardown")));
  pendingMountCallbacks = [];
  pendingMountRequest = null;

  if (webcontainerInstance) {
    try {
      webcontainerInstance.teardown();
    } catch (e) {
      // Ignore teardown errors
    }
  }

  webcontainerInstance = null;
  bootPromise = null;
}
