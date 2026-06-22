/**
 * Custom Error Classes - Typed errors for better error handling and debugging.
 * [HARDENING] Replaces all `throw new Error("string")` with typed errors.
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true; // Expected errors vs programming errors
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

interface ProviderErrorShape extends Error {
  status?: number;
  response?: {
    data?: {
      error?: {
        message?: string;
      };
    };
  };
}

export class AIAPIError extends AppError {
  public readonly provider: string;
  public readonly model: string;

  constructor(
    message: string,
    provider: string,
    model: string,
    statusCode: number = 502,
    context?: Record<string, unknown>
  ) {
    super(message, "AI_API_ERROR", statusCode, { provider, model, ...context });
    this.provider = provider;
    this.model = model;
  }

  static fromProviderError(
    provider: string,
    model: string,
    error: ProviderErrorShape
  ): AIAPIError {
    const status = error.status ?? 502;
    const message = status === 401 || status === 403
      ? "AI provider rejected the supplied credentials"
      : "AI provider request failed";
    return new AIAPIError(message, provider, model, status);
  }

  static rateLimited(provider: string, model: string, retryAfter?: number): AIAPIError {
    return new AIAPIError(
      `Rate limited by ${provider}. ${retryAfter ? `Retry after ${retryAfter}s.` : "Please wait."}`,
      provider,
      model,
      429,
      { retryAfter }
    );
  }

  static invalidKey(provider: string, model: string): AIAPIError {
    return new AIAPIError("Invalid API key. Please check and try again.", provider, model, 401);
  }

  static unavailable(provider: string, model: string): AIAPIError {
    return new AIAPIError("AI provider temporarily unavailable. Try another provider.", provider, model, 503);
  }
}

export class WebContainerError extends AppError {
  constructor(message: string, context?: Record<string, unknown>, statusCode: number = 500) {
    super(message, "WEBCONTAINER_ERROR", statusCode, context);
  }

  static bootFailed(cause: Error): WebContainerError {
    return new WebContainerError(`WebContainer boot failed: ${cause.message}`, { cause: cause.message });
  }

  static mountFailed(path: string, cause: Error): WebContainerError {
    return new WebContainerError(`Failed to mount ${path}: ${cause.message}`, { path, cause: cause.message });
  }

  static commandFailed(command: string, exitCode: number, stderr: string): WebContainerError {
    return new WebContainerError(`Command failed: ${command}`, { command, exitCode, stderr });
  }

  static notAvailable(): WebContainerError {
    return new WebContainerError("WebContainer is not available in this environment", {}, 503);
  }
}

export class YjsSyncError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "YJS_SYNC_ERROR", 500, context);
  }

  static connectionFailed(cause: Error): YjsSyncError {
    return new YjsSyncError(`Yjs connection failed: ${cause.message}`, { cause: cause.message });
  }

  static syncTimeout(): YjsSyncError {
    return new YjsSyncError("Yjs sync timeout - document may be out of sync");
  }

  static invalidState(): YjsSyncError {
    return new YjsSyncError("Invalid Yjs document state");
  }
}

export class AgentToolError extends AppError {
  public readonly toolName: string;
  public readonly actionId?: string;

  constructor(
    message: string,
    toolName: string,
    actionId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, "AGENT_TOOL_ERROR", 500, { toolName, actionId, ...context });
    this.toolName = toolName;
    this.actionId = actionId;
  }

  static approvalTimeout(actionId: string, toolName: string): AgentToolError {
    return new AgentToolError("Human approval timed out", toolName, actionId, { actionId });
  }

  static rejected(actionId: string, toolName: string): AgentToolError {
    return new AgentToolError("Action rejected by user", toolName, actionId, { actionId });
  }

  static validationFailed(toolName: string, reason: string): AgentToolError {
    return new AgentToolError(`Tool validation failed: ${reason}`, toolName);
  }

  static executionFailed(toolName: string, cause: Error): AgentToolError {
    return new AgentToolError(`Tool execution failed: ${cause.message}`, toolName, undefined, { cause: cause.message });
  }
}

export class ValidationError extends AppError {
  public readonly field: string;

  constructor(message: string, field: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, { field, ...context });
    this.field = field;
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, "AUTH_ERROR", 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "Access denied") {
    super(message, "AUTHZ_ERROR", 403);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message, "RATE_LIMIT_ERROR", 429, { retryAfter });
    this.retryAfter = retryAfter;
  }
}

/** Type guard to check if error is an operational AppError */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Extract user-safe error message */
export function getUserSafeMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    // Don't expose internal error details
    return "An unexpected error occurred";
  }
  return "An unknown error occurred";
}

/** Extract error context for logging (strips sensitive data) */
export function getErrorContext(error: unknown): Record<string, unknown> {
  if (isAppError(error)) {
    const { context, ...rest } = error;
    // Strip sensitive fields
    const safeContext = { ...context };
    delete safeContext.apiKey;
    delete safeContext.password;
    delete safeContext.token;
    delete safeContext.secret;
    return { ...rest, context: safeContext };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}
