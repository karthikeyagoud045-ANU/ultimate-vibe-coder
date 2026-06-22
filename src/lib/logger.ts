export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface LogPayload {
  level: LogLevel;
  component: string;
  action: string;
  timestamp: string;
  [key: string]: unknown;
}

const API_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI / Anthropic
  /AIza[0-9A-Za-z-_]{35}/g, // Google
  /xai-[a-zA-Z0-9]{20,}/g, // xAI
  /Bearer\s+[a-zA-Z0-9-._~+/]+=*/ig // Bearer tokens
];

/**
 * Deeply clone and mask API keys in the object
 */
function maskSecrets(obj: unknown): unknown {
  if (typeof obj === "string") {
    let masked = obj;
    for (const pattern of API_KEY_PATTERNS) {
      masked = masked.replace(pattern, "********");
    }
    return masked;
  }

  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(maskSecrets);
  }

  const maskedObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    if (keyLower.includes("key") || keyLower.includes("token") || keyLower.includes("secret") || keyLower.includes("password")) {
      maskedObj[key] = "********";
    } else {
      maskedObj[key] = maskSecrets(value);
    }
  }

  return maskedObj;
}

class Logger {
  private log(level: LogLevel, action: string, metadata?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    
    // Extract component if provided, else default to "System"
    const component = metadata?.component ? String(metadata.component) : "System";
    
    const safeMetadata = metadata ? maskSecrets(metadata) as Record<string, unknown> : {};
    delete safeMetadata.component; // Remove it from metadata since it's at the root level

    // If metadata contains an error object, extract message and stack
    if (metadata?.error instanceof Error) {
      safeMetadata.errorMessage = metadata.error.message;
      safeMetadata.errorStack = maskSecrets(metadata.error.stack) as string;
      delete safeMetadata.error;
    }

    const payload: LogPayload = {
      level,
      component,
      action,
      timestamp,
      ...safeMetadata
    };

    const logString = JSON.stringify(payload);

    switch (level) {
      case "DEBUG":
        console.debug(logString);
        break;
      case "INFO":
        console.info(logString);
        break;
      case "WARN":
        console.warn(logString);
        break;
      case "ERROR":
        console.error(logString);
        break;
    }
  }

  debug(action: string, metadata?: Record<string, unknown>) {
    this.log("DEBUG", action, metadata);
  }

  info(action: string, metadata?: Record<string, unknown>) {
    this.log("INFO", action, metadata);
  }

  warn(action: string, metadata?: Record<string, unknown>) {
    this.log("WARN", action, metadata);
  }

  error(action: string, metadata?: Record<string, unknown>) {
    this.log("ERROR", action, metadata);
  }
}

export const logger = new Logger();
