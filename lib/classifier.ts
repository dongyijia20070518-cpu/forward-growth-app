import { env } from "cloudflare:workers";

export const CATEGORIES = ["Task", "Idea", "Explore", "Moment", "Knowledge Candidate", "暂未分类"] as const;
export type CaptureCategory = (typeof CATEGORIES)[number];
export type Classification = {
  category: CaptureCategory;
  topic: string | null;
  confidence: number;
  source: "rule" | "ai" | "none";
};

const topicRules = [
  { name: "摄影", pattern: /摄影|构图|照片|相机/iu },
  { name: "个人网站", pattern: /个人网站|作品集|主页|portfolio/iu },
  { name: "AI", pattern: /\bAI\b|Agent|智能体|大模型|提示词/iu },
  { name: "运筹学", pattern: /运筹学|两阶段法|单纯形/iu },
  { name: "英语", pattern: /英语|雅思|IELTS|托福|TOEFL/iu },
  { name: "写作", pattern: /写作|文章|公众号|博客/iu },
  { name: "健身", pattern: /健身|跑步|力量训练|瑜伽/iu },
  { name: "阅读", pattern: /阅读|读书|书单/iu },
  { name: "编程", pattern: /编程|代码|开发|TypeScript|JavaScript|Python/iu },
];

const ruleSets: Array<{ category: Exclude<CaptureCategory, "暂未分类">; pattern: RegExp; confidence: number }> = [
  {
    category: "Knowledge Candidate",
    pattern: /我学会了|学会了|我终于(?:理解|明白|搞懂)|终于(?:理解|明白|搞懂)|原来.{0,30}(?:是|因为|可以)|搞懂了|弄懂了|理解了|明白了|总结出/iu,
    confidence: 96,
  },
  {
    category: "Task",
    pattern: /截止|明天|后天|下周|周[一二三四五六日天]|星期[一二三四五六日天]|提交|完成|记得|待办|必须|要做|交作业|安排一下|需要.{0,8}(?:做|交|完成)/iu,
    confidence: 95,
  },
  {
    category: "Moment",
    pattern: /今天.{0,12}(?:感觉|觉得|发生)|今天感觉|今天发生|刚刚发生|发生了|我觉得|我感到|心情|开心|难过|焦虑|失落|兴奋/iu,
    confidence: 93,
  },
  {
    category: "Explore",
    pattern: /想(?:系统)?(?:了解|研究|学习|弄懂|搞懂|看看)|研究一下|了解一下|想看看|探索|好奇|不懂.*想/iu,
    confidence: 94,
  },
  {
    category: "Idea",
    pattern: /想法|点子|灵感|\bidea\b|可以做成|要不|或许可以|也许可以|突然想到|我想到/iu,
    confidence: 91,
  },
];

function cleanTopic(value: string): string | null {
  const cleaned = value
    .replace(/[，。！？,.!?；;：:\n]/gu, " ")
    .replace(/^(一下|一下子|系统地|系统|关于|有关)/u, "")
    .replace(/(一下|一下子|了|吧|呢|啊|呀|哦|的知识|这个方向)$/u, "")
    .trim()
    .replace(/\s+/gu, " ");
  if (cleaned.length < 2 || cleaned.length > 20) return null;
  return cleaned;
}

export function inferTopic(body: string, category: CaptureCategory): string | null {
  const known = topicRules.find((rule) => rule.pattern.test(body));
  if (known) return known.name;
  if (category === "Moment" || category === "暂未分类") return null;

  const afterLearningVerb = body.match(/(?:了解|研究|学习|弄懂|搞懂|探索|看看)(?:一下|系统地|系统)?([^，。！？,.!?；;：:\n]{2,20})/u)?.[1];
  const candidate = afterLearningVerb ?? body
    .replace(/今天|明天|后天|下周|周[一二三四五六日天]|星期[一二三四五六日天]/gu, "")
    .replace(/截止|提交|完成|记得|待办|必须|要做|交作业|安排一下|需要|想法|点子|灵感|突然想到|我想到/gu, "");
  return cleanTopic(candidate);
}

export function classifyByRules(body: string): Classification | null {
  const match = ruleSets.find((rule) => rule.pattern.test(body));
  if (!match) return null;
  return {
    category: match.category,
    topic: inferTopic(body, match.category),
    confidence: match.confidence,
    source: "rule",
  };
}

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
        instructions: "Classify one personal growth note by what it is right now. Use Task only for one concrete, completable action; Idea for a possible concept or an uncommitted multi-step outcome; Explore for a learning or research question without a committed deliverable; Moment for an experience or feeling; Knowledge Candidate for something already learned, understood, or summarized. Project and Plan are hierarchy levels, never capture categories, so never return them. Return only the requested structured result.",
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
                category: { type: "string", enum: ["Task", "Idea", "Explore", "Moment", "Knowledge Candidate"] },
                topic: { anyOf: [{ type: "string" }, { type: "null" }] },
                confidence: { type: "integer", minimum: 0, maximum: 100 },
              },
              required: ["category", "topic", "confidence"],
            },
          },
        },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as Record<string, unknown>;
    const text = responseText(data);
    if (!text) return null;
    const parsed = JSON.parse(text) as { category?: unknown; topic?: unknown; confidence?: unknown };
    if (!CATEGORIES.slice(0, 5).includes(parsed.category as never)) return null;
    return {
      category: parsed.category as CaptureCategory,
      topic: typeof parsed.topic === "string" ? cleanTopic(parsed.topic) : inferTopic(body, parsed.category as CaptureCategory),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      source: "ai",
    };
  } catch (error) {
    console.error("semantic_classification_failed", error);
    return null;
  }
}

export async function classifyCapture(body: string): Promise<Classification> {
  const rule = classifyByRules(body);
  if (rule) return rule;
  const semantic = await classifyWithAI(body);
  if (semantic) return semantic;
  return { category: "暂未分类", topic: null, confidence: 0, source: "none" };
}
