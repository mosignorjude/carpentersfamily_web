import "server-only";

import type { AiReportType } from "@/lib/ai/facts";
import {
  type AiNarrativeContent,
  validateNarrativeContent,
} from "@/lib/ai/grounding";
import { buildNarrativePrompt } from "@/lib/ai/prompts";
import { generateNarrativeJson } from "@/lib/ai/provider.server";

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
  let lastReasons: string[] = [];

  for (const strictRetry of [false, true]) {
    const prompt = buildNarrativePrompt(reportType, strictRetry);
    const result = await generateNarrativeJson({
      system: prompt.system,
      facts,
      schema: prompt.schema,
    });
    const validated = validateNarrativeContent(result.data, facts);
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
