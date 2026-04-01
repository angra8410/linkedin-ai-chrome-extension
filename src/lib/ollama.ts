import type { OllamaModel, OllamaStatus, OllamaStreamChunk } from "../types";

const DEFAULT_BASE_URL = "http://localhost:11434";

export interface OllamaGenerationOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repeat_penalty?: number;
  seed?: number;
  num_predict?: number;
}

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
}

function buildErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Request timed out before Ollama responded.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchNoTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(input, init);
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkOllamaStatus(
  baseUrl = DEFAULT_BASE_URL
): Promise<OllamaStatus> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  try {
    const res = await fetchWithTimeout(
      `${normalizedBaseUrl}/api/tags`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      5000
    );

    if (!res.ok) return "error";

    const data = await res.json();
    return Array.isArray(data?.models) ? "online" : "error";
  } catch (error) {
    console.error("checkOllamaStatus failed:", error);
    return "offline";
  }
}

// ─── List Available Models ────────────────────────────────────────────────────

export async function listModels(
  baseUrl = DEFAULT_BASE_URL
): Promise<OllamaModel[]> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  const res = await fetchWithTimeout(
    `${normalizedBaseUrl}/api/tags`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
    8000
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to fetch models from Ollama: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data?.models) ? data.models : [];
}

// ─── Generate (Non-Streaming) ─────────────────────────────────────────────────

export async function generate(
  prompt: string,
  systemMessage: string,
  model: string,
  baseUrl = DEFAULT_BASE_URL,
  generationOptions?: OllamaGenerationOptions
): Promise<string> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  let res: Response;
  try {
    res = await fetchNoTimeout(`${normalizedBaseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        system: systemMessage,
        prompt,
        stream: false,
        options: generationOptions,
      }),
    });
  } catch (error) {
    throw new Error(`Ollama generate request failed: ${buildErrorMessage(error)}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Ollama generate failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return String(data?.response ?? "");
}

// ─── Generate (Streaming) ─────────────────────────────────────────────────────

export async function generateStream(
  prompt: string,
  systemMessage: string,
  model: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  baseUrl = DEFAULT_BASE_URL,
  generationOptions?: OllamaGenerationOptions
): Promise<void> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  let res: Response;
  try {
    res = await fetchNoTimeout(`${normalizedBaseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        system: systemMessage,
        prompt,
        stream: true,
        options: generationOptions,
      }),
    });
  } catch (error) {
    throw new Error(`Ollama streaming request failed: ${buildErrorMessage(error)}`);
  }

  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "");
    throw new Error(`Ollama streaming failed: ${res.status} ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const chunk: OllamaStreamChunk = JSON.parse(trimmed);
          if (chunk.response) onChunk(chunk.response);
          if (chunk.done) {
            onDone();
            return;
          }
        } catch {
          // ignore malformed chunk fragments
        }
      }
    }

    if (buffer.trim()) {
      try {
        const chunk: OllamaStreamChunk = JSON.parse(buffer.trim());
        if (chunk.response) onChunk(chunk.response);
      } catch {
        // ignore trailing malformed chunk
      }
    }

    onDone();
  } catch (error) {
    throw new Error(`Ollama stream read failed: ${buildErrorMessage(error)}`);
  }
}

// ─── Chat API (for multi-turn) ────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  model: string,
  baseUrl = DEFAULT_BASE_URL
): Promise<string> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  let res: Response;
  try {
    res = await fetchNoTimeout(`${normalizedBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    });
  } catch (error) {
    throw new Error(`Ollama chat request failed: ${buildErrorMessage(error)}`);
  }

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Ollama chat failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return String(data?.message?.content ?? "");
}
