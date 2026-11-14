import "server-only";

import type { AiReportType } from "@/lib/ai/facts";
import {
  type AiNarrativeContent,
  validateNarrativeContent,
} from "@/lib/ai/grounding";
import { buildNarrativePrompt } from "@/lib/ai/prompts";
import {
  generateNarrativeJson,
  TOTAL_AI_BUDGET_MS,
} from "@/lib/ai/provider.server";
import { sanitizeCustomFactsForAi } from "@/lib/reports/spec-executor-core";

export class AiGroundingError extends Error {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super(`AI output failed grounding verification: ${reasons.join("; ")}`);
    this.name = "AiGroundingError";
    this.reasons = reasons;
  }
}

export async function generateGroundedNarrative(
  reportType: AiReportType,
  facts: unknown,
): Promise<{
  provider: string;
  model: string;
  content: AiNarrativeContent;
}> {
  const safeFacts =
    reportType === "custom" && typeof facts === "object" && facts !== null
      ? sanitizeCustomFactsForAi(facts as Record<string, unknown>)
      : facts;
  const deadlineAt = Date.now() + TOTAL_AI_BUDGET_MS;
  let lastReasons: string[] = [];

  for (const strictRetry of [false, true]) {
    if (strictRetry && deadlineAt - Date.now() < 3_500) {
      break;
    }
    const prompt = buildNarrativePrompt(reportType, strictRetry);
    const result = await generateNarrativeJson({
      system: prompt.system,
      facts: safeFacts,
      schema: prompt.schema,
      deadlineAt,
    });
    const validated = validateNarrativeContent(result.data, safeFacts);
    if (validated.ok) {
      return {
        provider: result.provider,
        model: result.model,
        content: validated.content,
      };
    }
    console.warn(
      `[AI Grounding] Rejected ${reportType} draft (strictRetry=${strictRetry}):`,
      validated.reasons,
    );
    lastReasons = validated.reasons;
  }

  throw new AiGroundingError(lastReasons);
}
