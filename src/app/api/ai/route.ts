import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt } from "@/lib/ai-client";
import {
  AI_RATE_LIMIT_PER_MINUTE,
  AI_RATE_LIMIT_WINDOW_MS,
  ALLOWED_IMAGE_MIME_TYPES,
  ERROR_MESSAGES,
  MAX_API_KEY_LENGTH,
  MAX_CODE_CONTEXT_LENGTH,
  MAX_IMAGE_BASE64_SIZE,
  MAX_MODEL_ID_LENGTH,
  MAX_PROMPT_LENGTH,
  type AIProvider,
  isAIProvider,
} from "@/lib/constants";
import { AIAPIError, RateLimitError, ValidationError, getUserSafeMessage, isAppError } from "@/lib/errors";

export const runtime = "edge";

interface AIRequestPayload {
  prompt: string;
  code: string;
  apiKey: string;
  provider: AIProvider;
  model: string;
  imageBase64?: string;
  imageMimeType?: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface ImageUrlBlock {
  type: "image_url";
  image_url: { url: string };
}

interface TextBlock {
  type: "text";
  text: string;
}

type UserContent = string | Array<ImageUrlBlock | TextBlock>;

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export async function POST(req: NextRequest) {
  try {
    enforceRateLimit(getClientIdentifier(req));

    const payload = await parseAIRequest(req);
    const { prompt, code, apiKey, provider, model, imageBase64, imageMimeType } = payload;

    const systemPrompt = buildSystemPrompt(code);

    // Build user message content - array for vision, string for text-only.
    const userContent: UserContent = imageBase64
      ? [
          {
            type: "image_url",
            image_url: { url: `data:${imageMimeType ?? "image/png"};base64,${imageBase64}` },
          },
          { type: "text", text: prompt },
        ]
      : prompt;

    let response: Response;

    switch (provider) {
      case "openai":
        response = await callOpenAI(apiKey, model, systemPrompt, userContent);
        break;
      case "anthropic":
        response = await callAnthropic(apiKey, model, systemPrompt, userContent);
        break;
      case "google":
        response = await callGoogle(apiKey, model, systemPrompt, userContent);
        break;
    }

    if (!response.ok) {
      await response.text().catch(() => "");
      const safeError = getProviderError(provider, model, response.status);
      return NextResponse.json(
        { error: safeError.message },
        { status: safeError.statusCode }
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json(
        { error: "No response body from provider" },
        { status: 502 }
      );
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let usage: Usage = { prompt_tokens: 0, completion_tokens: 0 };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "done", usage })}\n\n`)
              );
              controller.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.trim()) continue;

              if (provider === "openai") {
                const result = parseOpenAIStreamLine(line);
                if (result.done) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "done", usage })}\n\n`)
                  );
                  continue;
                }
                if (result.content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: result.content })}\n\n`)
                  );
                }
                if (result.usage) usage = result.usage;
              } else if (provider === "anthropic") {
                const result = parseAnthropicStreamLine(line, usage);
                if (result.content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: result.content })}\n\n`)
                  );
                }
                if (result.usage) usage = result.usage;
              } else if (provider === "google") {
                const result = parseGoogleStreamLine(line);
                if (result.content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: result.content })}\n\n`)
                  );
                }
                if (result.usage) usage = result.usage;
              }
            }
          }
        } catch {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: "Stream processing error" })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const status = isAppError(error) ? error.statusCode : 500;
    return NextResponse.json(
      { error: getUserSafeMessage(error) },
      { status }
    );
  }
}

function enforceRateLimit(clientId: string): void {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(clientId);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(clientId, { count: 1, resetAt: now + AI_RATE_LIMIT_WINDOW_MS });
    cleanupExpiredRateLimitBuckets(now);
    return;
  }

  if (bucket.count >= AI_RATE_LIMIT_PER_MINUTE) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new RateLimitError(ERROR_MESSAGES.RATE_LIMITED, retryAfter);
  }

  bucket.count += 1;
}

function cleanupExpiredRateLimitBuckets(now: number): void {
  if (rateLimitBuckets.size < 1_000) return;

  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

function getClientIdentifier(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  return forwardedFor || realIp || "anonymous";
}

async function parseAIRequest(req: NextRequest): Promise<AIRequestPayload> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON", "body");
  }

  if (!isRecord(body)) {
    throw new ValidationError(ERROR_MESSAGES.INVALID_REQUEST, "body");
  }

  const prompt = getRequiredString(body, "prompt");
  const apiKey = getRequiredString(body, "apiKey");
  const providerValue = getRequiredString(body, "provider");
  const model = getRequiredString(body, "model");
  const code = getOptionalString(body, "code") ?? "";
  const imageBase64 = getOptionalString(body, "imageBase64");
  const imageMimeType = getOptionalString(body, "imageMimeType");

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new ValidationError(ERROR_MESSAGES.PROMPT_TOO_LONG, "prompt");
  }

  if (code.length > MAX_CODE_CONTEXT_LENGTH) {
    throw new ValidationError(`Code context exceeds maximum length of ${MAX_CODE_CONTEXT_LENGTH} characters`, "code");
  }

  if (apiKey.length > MAX_API_KEY_LENGTH) {
    throw new ValidationError(ERROR_MESSAGES.INVALID_API_KEY, "apiKey");
  }

  if (!isAIProvider(providerValue)) {
    throw new ValidationError(ERROR_MESSAGES.INVALID_PROVIDER, "provider");
  }

  if (model.length > MAX_MODEL_ID_LENGTH || !/^[a-zA-Z0-9._:/-]+$/.test(model)) {
    throw new ValidationError("Invalid model identifier", "model");
  }

  if (imageBase64) {
    if (imageBase64.length > MAX_IMAGE_BASE64_SIZE) {
      throw new ValidationError(ERROR_MESSAGES.IMAGE_TOO_LARGE, "imageBase64");
    }
    if (!/^[a-zA-Z0-9+/=\s]+$/.test(imageBase64)) {
      throw new ValidationError("Image must be base64 encoded", "imageBase64");
    }
    if (imageMimeType && !isAllowedImageMimeType(imageMimeType)) {
      throw new ValidationError(ERROR_MESSAGES.INVALID_IMAGE_TYPE, "imageMimeType");
    }
  }

  return {
    prompt,
    code,
    apiKey,
    provider: providerValue,
    model,
    imageBase64,
    imageMimeType: imageBase64 ? imageMimeType ?? "image/png" : undefined,
  };
}

function getRequiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`Missing required field: ${field}`, field);
  }
  return value.trim();
}

function getOptionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`Invalid field: ${field}`, field);
  }
  return value;
}

function isAllowedImageMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number]);
}

function getProviderError(provider: AIProvider, model: string, status: number): AIAPIError {
  if (status === 401 || status === 403) {
    return AIAPIError.invalidKey(provider, model);
  }
  if (status === 429) {
    return AIAPIError.rateLimited(provider, model);
  }
  if (status >= 500) {
    return AIAPIError.unavailable(provider, model);
  }
  return new AIAPIError("AI provider request failed", provider, model, 502);
}

function parseOpenAIStreamLine(line: string): { content?: string; usage?: Usage; done?: boolean } {
  if (!line.startsWith("data: ")) return {};

  const data = line.slice(6);
  if (data === "[DONE]") return { done: true };

  const parsed = parseJsonObject(data);
  if (!parsed) return {};

  const choices = getArray(parsed, "choices");
  const firstChoice = choices[0];
  const delta = isRecord(firstChoice) ? getRecord(firstChoice, "delta") : undefined;
  const content = getString(delta, "content");
  const usageRecord = getRecord(parsed, "usage");

  return {
    content,
    usage: usageRecord
      ? {
          prompt_tokens: getNumber(usageRecord, "prompt_tokens") ?? 0,
          completion_tokens: getNumber(usageRecord, "completion_tokens") ?? 0,
        }
      : undefined,
  };
}

function parseAnthropicStreamLine(line: string, currentUsage: Usage): { content?: string; usage?: Usage } {
  if (!line.startsWith("data: ")) return {};

  const parsed = parseJsonObject(line.slice(6));
  if (!parsed) return {};

  const type = getString(parsed, "type");
  const delta = getRecord(parsed, "delta");
  const content = type === "content_block_delta" ? getString(delta, "text") : undefined;
  const usageRecord = getRecord(parsed, "usage");

  return {
    content,
    usage: type === "message_delta" && usageRecord
      ? {
          prompt_tokens: currentUsage.prompt_tokens,
          completion_tokens: getNumber(usageRecord, "output_tokens") ?? 0,
        }
      : undefined,
  };
}

function parseGoogleStreamLine(line: string): { content?: string; usage?: Usage } {
  const parsed = parseJsonObject(line);
  if (!parsed) return {};

  const candidates = getArray(parsed, "candidates");
  const firstCandidate = candidates[0];
  const contentRecord = isRecord(firstCandidate) ? getRecord(firstCandidate, "content") : undefined;
  const parts = contentRecord ? getArray(contentRecord, "parts") : [];
  const firstPart = parts[0];
  const token = isRecord(firstPart) ? getString(firstPart, "text") : undefined;
  const usageMetadata = getRecord(parsed, "usageMetadata");

  return {
    content: token,
    usage: usageMetadata
      ? {
          prompt_tokens: getNumber(usageMetadata, "promptTokenCount") ?? 0,
          completion_tokens: getNumber(usageMetadata, "candidatesTokenCount") ?? 0,
        }
      : undefined,
  };
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(record: Record<string, unknown> | undefined, field: string): Record<string, unknown> | undefined {
  const value = record?.[field];
  return isRecord(value) ? value : undefined;
}

function getArray(record: Record<string, unknown>, field: string): unknown[] {
  const value = record[field];
  return Array.isArray(value) ? value : [];
}

function getString(record: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = record?.[field];
  return typeof value === "string" ? value : undefined;
}

function getNumber(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field];
  return typeof value === "number" ? value : undefined;
}

// ---- Provider-specific API calls ----

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: UserContent
): Promise<Response> {
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: UserContent
): Promise<Response> {
  // Anthropic expects content as array of blocks even for text-only.
  const content: Array<{ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } }> =
    typeof userContent === "string"
      ? [{ type: "text", text: userContent }]
      : userContent.map((block) => {
          if (block.type === "image_url") {
            const dataUrl = block.image_url.url;
            const base64Data = dataUrl.split(",")[1] ?? "";
            const mediaType = dataUrl.split(";")[0]?.split(":")[1] ?? "image/png";
            return {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Data },
            };
          }
          return { type: "text", text: block.text };
        });

  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content }],
      stream: true,
      max_tokens: 4096,
    }),
  });
}

async function callGoogle(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: UserContent
): Promise<Response> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (typeof userContent === "string") {
    parts.push({ text: userContent });
  } else {
    for (const block of userContent) {
      if (block.type === "image_url") {
        const dataUrl = block.image_url.url;
        const base64Data = dataUrl.split(",")[1] ?? "";
        const mimeType = dataUrl.split(";")[0]?.split(":")[1] ?? "image/png";
        parts.push({ inlineData: { mimeType, data: base64Data } });
      } else {
        parts.push({ text: block.text });
      }
    }
  }

  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`);
  url.searchParams.set("alt", "sse");
  url.searchParams.set("key", apiKey);

  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
  });
}
