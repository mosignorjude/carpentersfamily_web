export const TOTAL_AI_BUDGET_MS = 24_000;
const MIN_ATTEMPT_BUDGET_MS = 500;
const PRIMARY_ATTEMPT_CAP_MS = 12_000;

export interface NarrativeRequest {
  system: string;
  facts: unknown;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  deadlineAt?: number;
  attemptTimeoutMs?: number;
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
  totalBudgetMs = TOTAL_AI_BUDGET_MS,
): Promise<ProviderGenerationResult> {
  if (providers.length === 0) {
    throw new AiUnavailableError("No AI provider API keys are configured.");
  }

  const deadlineAt = req.deadlineAt ?? Date.now() + totalBudgetMs;
  let lastError: unknown = null;

  for (let i = 0; i < providers.length; i += 1) {
    const provider = providers[i];
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs < MIN_ATTEMPT_BUDGET_MS) {
      throw new AiUnavailableError(
        "AI generation budget elapsed before request could finish.",
      );
    }

    const providersLeft = providers.length - i;
    const attemptTimeoutMs =
      providersLeft > 1
        ? Math.min(
            PRIMARY_ATTEMPT_CAP_MS,
            Math.max(
              MIN_ATTEMPT_BUDGET_MS,
              Math.floor(remainingMs / providersLeft),
            ),
          )
        : remainingMs;

    try {
      const data = await provider.generateJson(
        { ...req, deadlineAt, attemptTimeoutMs },
        AbortSignal.timeout(attemptTimeoutMs),
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
