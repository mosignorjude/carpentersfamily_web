export interface NarrativeRequest {
  system: string;
  facts: unknown;
  schema: Record<string, unknown>;
}

export interface AiProviderAdapter {
  name: string;
  model: string;
  generateJson(req: NarrativeRequest, signal: AbortSignal): Promise<unknown>;
}

export interface ProviderGenerationResult {
  provider: string;
  model: string;
  data: unknown;
}

export class AiUnavailableError extends Error {
  constructor(message = "AI report service is currently unavailable.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export function isAiReportsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.AI_REPORTS_ENABLED?.trim().toLowerCase() === "false") {
    return false;
  }
  const hasGemini = Boolean(env.GEMINI_API_KEY?.trim());
  const hasGroq = Boolean(env.GROQ_API_KEY?.trim());
  return hasGemini || hasGroq;
}

export function getAiDailyLimitPerOfficer(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.AI_DAILY_LIMIT_PER_OFFICER?.trim();
  if (!raw || !/^\d{1,3}$/.test(raw)) return 20;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) return 20;
  return parsed;
}

export function parseJsonResponse(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Empty AI response text.");
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}

export async function runProvidersWithFallback(
  providers: readonly AiProviderAdapter[],
  req: NarrativeRequest,
  timeoutMs = 20_000,
): Promise<ProviderGenerationResult> {
  if (providers.length === 0) {
    throw new AiUnavailableError("No AI provider API keys are configured.");
  }

  let lastError: unknown = null;
  for (const provider of providers) {
    try {
      const data = await provider.generateJson(
        req,
        AbortSignal.timeout(timeoutMs),
      );
      return {
        provider: provider.name,
        model: provider.model,
        data,
      };
    } catch (error) {
      lastError = error;
    }
  }

  const reason =
    lastError instanceof Error ? lastError.message : "All AI providers failed.";
  throw new AiUnavailableError(reason);
}
