import { env } from "cloudflare:workers";
import {
  PRIMARY_TYPES,
  applyUserPreferences,
  classifyByRules,
  confidenceBand,
  inferTopic,
  isPrimaryType,
  preferenceSignals,
  type Classification,
  type ClassificationCorrection,
} from "@/lib/classifier-core";

export { PRIMARY_TYPES as CATEGORIES, confidenceBand, isPrimaryType } from "@/lib/classifier-core";
export type { Classification, ClassificationCorrection, PrimaryType } from "@/lib/classifier-core";

function responseText(data: Record<string, unknown>): string | null {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

async function classifyWithAI(body: string): Promise<Classification | null> {
  const runtime = env as typeof env & { OPENAI_API_KEY?: string; OPENAI_CLASSIFIER_MODEL?: string };
  if (!runtime.OPENAI_API_KEY) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${runtime.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: runtime.OPENAI_CLASSIFIER_MODEL || "gpt-4o-mini",
        store: false,
        instructions: [
          "Classify one personal-growth capture by its main intent into exactly one of Task, Idea, Explore, Moment, or Knowledge.",
          "Task: a concrete completable action. Knowledge: an already-formed understanding or conclusion. Explore: intent to research, learn, or understand. Moment: a current experience, feeling, observation, or state. Idea: an uncommitted possibility or concept.",
          "When multiple intents appear, always use this priority: Task > Knowledge > Explore > Moment > Idea. Put the strongest remaining intent in secondary_type, otherwise null.",
          "Return confidence from 0 to 1 and a short Chinese reason. Never use Idea as an error fallback. Project and Plan are hierarchy levels, never capture types.",
        ].join(" "),
        input: body,
        text: {
          format: {
            type: "json_schema",
            name: "capture_classification",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                primary_type: { type: "string", enum: [...PRIMARY_TYPES] },
                secondary_type: { anyOf: [{ type: "string", enum: [...PRIMARY_TYPES] }, { type: "null" }] },
                topic: { anyOf: [{ type: "string" }, { type: "null" }] },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" },
              },
              required: ["primary_type", "secondary_type", "topic", "confidence", "reason"],
            },
          },
        },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as Record<string, unknown>;
    const text = responseText(data);
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!isPrimaryType(parsed.primary_type)) return null;
    const primaryType = parsed.primary_type;
    const secondaryType = isPrimaryType(parsed.secondary_type) && parsed.secondary_type !== primaryType ? parsed.secondary_type : undefined;
    const confidence = Math.round(Math.max(0, Math.min(1, Number(parsed.confidence) || 0)) * 100) / 100;
    return {
      primary_type: primaryType,
      ...(secondaryType ? { secondary_type: secondaryType } : {}),
      topic: typeof parsed.topic === "string" ? inferTopic(parsed.topic, primaryType) ?? parsed.topic.trim().slice(0, 24) : inferTopic(body, primaryType),
      confidence,
      reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim().slice(0, 240) : "根据完整语义判断主意图",
      source: "ai",
      signals: preferenceSignals(body),
    };
  } catch (error) {
    console.error("semantic_classification_failed", error);
    return null;
  }
}

export async function classifyCapture(body: string, corrections: ClassificationCorrection[] = []): Promise<Classification> {
  const rule = classifyByRules(body);
  if (!rule.primary_type || confidenceBand(rule.confidence) === "high") return applyUserPreferences(rule, corrections);

  const semantic = await classifyWithAI(body);
  const chosen = semantic && semantic.confidence >= rule.confidence ? semantic : rule;
  return applyUserPreferences(chosen, corrections);
}
