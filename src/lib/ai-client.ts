export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  username?: string;
}

export function buildSystemPrompt(code: string): string {
  return `You are an AI coding assistant. You can write, review, and explain code. The user's current code is:\n\n\`\`\`\n${code}\n\`\`\`\n\nIf you suggest code to replace the current file, enclose it in a single markdown code block. Do not wrap code in multiple blocks if it's meant to be a single file replacement.`;
}

export function extractCodeFromResponse(response: string): string | null {
  const match = response.match(/```[a-z]*\n([\s\S]*?)\n```/);
  return match ? match[1] : null;
}

export interface AIStreamRequest {
  prompt: string;
  code: string;
  apiKey: string;
  provider: "openai" | "anthropic" | "google";
  model: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface AIStreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullText: string, usage?: { prompt_tokens: number; completion_tokens: number }) => void;
  onError: (error: string) => void;
}

export interface NormalizedChunk {
  type: "chunk" | "done" | "error";
  content?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  error?: string;
}

export async function streamAIResponse(
  req: AIStreamRequest,
  callbacks: AIStreamCallbacks
) {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to fetch AI response");
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No reader");

    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.slice(6);
          try {
            const data: unknown = JSON.parse(dataStr);

            if (typeof data === "object" && data !== null) {
              const chunkData = data as Record<string, unknown>;

              if (chunkData.type === "chunk" && "content" in chunkData && typeof chunkData.content === "string") {
                fullText += chunkData.content;
                callbacks.onToken(chunkData.content);
              }

              if (chunkData.type === "done") {
                const usage = "usage" in chunkData ? (chunkData.usage as { prompt_tokens: number; completion_tokens: number }) : undefined;
                callbacks.onComplete(fullText, usage);
              }

              if (chunkData.type === "error") {
                const errorMsg = "error" in chunkData && typeof chunkData.error === "string" ? chunkData.error : "Stream error";
                throw new Error(errorMsg);
              }
            }
          } catch {
            // Ignore parse errors on incomplete chunks
          }
        }
      }
    }

    // Fallback if no "done" event received
    if (fullText && !fullText.endsWith("[DONE]")) {
      callbacks.onComplete(fullText);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    callbacks.onError(message);
  }
}
