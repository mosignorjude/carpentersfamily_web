import "server-only";

import { GoogleGenAI } from "@google/genai";
import {
  type AiProviderAdapter,
  isAiReportsEnabled,
  type NarrativeRequest,
  type ProviderGenerationResult,
  parseJsonResponse,
  runProvidersWithFallback,
} from "./provider-core";

export {
  AiUnavailableError,
  getAiDailyLimitPerOfficer,
  isAiReportsEnabled,
  type NarrativeRequest,
  type ProviderGenerationResult,
} from "./provider-core";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const PROVIDER_TIMEOUT_MS = 20_000;

function createGeminiProvider(
  apiKey: string,
  model: string,
): AiProviderAdapter {
  return {
    name: "gemini",
    model,
    async generateJson(req: NarrativeRequest, signal: AbortSignal) {
      const client = new GoogleGenAI({ apiKey });
      const interaction = await client.interactions.create(
        {
          model,
          input: JSON.stringify({ FACTS: req.facts }),
          system_instruction: req.system,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: req.schema,
          },
          generation_config: {
            max_output_tokens: req.maxOutputTokens ?? 900,
          },
          store: false,
        },
        {
          timeout_ms: PROVIDER_TIMEOUT_MS,
          retries: { strategy: "none" },
          signal,
        },
      );

      const text = interaction.output_text;
      if (!text) {
        throw new Error("Gemini returned no output text.");
      }
      return parseJsonResponse(text);
    },
  };
}

function createGroqProvider(apiKey: string, model: string): AiProviderAdapter {
  return {
    name: "groq",
    model,
    async generateJson(req: NarrativeRequest, signal: AbortSignal) {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: Math.max(1500, req.maxOutputTokens ?? 1500),
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `${req.system}\nJSON Schema: ${JSON.stringify(req.schema)}`,
              },
              {
                role: "user",
                content: JSON.stringify({ FACTS: req.facts }),
              },
            ],
          }),
          signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Groq request failed with HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const text = payload.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error("Groq returned empty completion content.");
      }
      return parseJsonResponse(text);
    },
  };
}

function configuredProviders(): AiProviderAdapter[] {
  const providers: AiProviderAdapter[] = [];
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const geminiModel =
      process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    providers.push(createGeminiProvider(geminiKey, geminiModel));
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    const groqModel = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
    providers.push(createGroqProvider(groqKey, groqModel));
  }

  return providers;
}

export async function generateNarrativeJson(
  req: NarrativeRequest,
): Promise<ProviderGenerationResult> {
  if (!isAiReportsEnabled()) {
    return runProvidersWithFallback([], req, PROVIDER_TIMEOUT_MS);
  }
  return runProvidersWithFallback(
    configuredProviders(),
    req,
    PROVIDER_TIMEOUT_MS,
  );
}
