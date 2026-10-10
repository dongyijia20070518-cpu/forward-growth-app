export const PRIMARY_TYPES = ["Task", "Idea", "Explore", "Moment", "Knowledge"] as const;
export type PrimaryType = (typeof PRIMARY_TYPES)[number];
export type ConfidenceBand = "high" | "medium" | "low";

export type Classification = {
  primary_type: PrimaryType | null;
  confidence: number;
  reason: string;
  secondary_type?: PrimaryType;
  topic: string | null;
  source: "rule" | "fallback" | "ai" | "preference" | "none";
  signals: string[];
};

export type ClassificationCorrection = {
  from_type: PrimaryType | null;
  to_type: PrimaryType;
  signal_key: string | null;
  topic: string | null;
};

const PRIORITY: PrimaryType[] = ["Task", "Knowledge", "Explore", "Moment", "Idea"];

const topicRules = [
  { name: "摄影", pattern: /摄影|构图|照片|相机/iu },
  { name: "个人网站", pattern: /个人网站|作品集|主页|portfolio/iu },
  { name: "MCP", pattern: /\bMCP\b/iu },
  { name: "RAG", pattern: /\bRAG\b/iu },
  { name: "API", pattern: /\bAPI\b/iu },
  { name: "AI", pattern: /\bAI\b|Agent|智能体|大模型|提示词/iu },
  { name: "运筹学", pattern: /运筹学|两阶段法|单纯形/iu },
  { name: "英语", pattern: /英语|雅思|IELTS|托福|TOEFL/iu },
  { name: "写作", pattern: /写作|文章|公众号|博客/iu },
  { name: "健身", pattern: /健身|跑步|力量训练|瑜伽/iu },
  { name: "阅读", pattern: /阅读|读书|书单/iu },
  { name: "编程", pattern: /编程|代码|开发|TypeScript|JavaScript|Python/iu },
];

const contextlessPattern = /^(?:这个(?:以后)?再说|以后再说|挺有意思(?:的)?|好像有点意思|先记一下|记一下|这个不错|不错|嗯+[……。.!！?？]*|哦+[……。.!！?？]*|随便记记)$/iu;
const ideaPattern = /是不是可以|有没有可能|也许|或许|以后可以|可以考虑|可以做(?:一个|个)?|突然想到|我(?:有|想到)(?:一个|个)?(?:想法|点子)|感觉可以|不如|要不要(?:做成|加入|增加|改成)|可以(?:把|做成|加入|增加|改成|结合)/iu;
const explorePattern = /想(?:进一步|系统地?|深入)?(?:研究|了解|学习|弄懂|搞懂|看看|查(?:一)?下|探索)|研究一下|了解一下|想看看|好奇|想知道|深入看看|系统学|不懂.{0,12}想/iu;
const knowledgePattern = /我学会了|学会了|我终于(?:懂|理解|明白|搞懂|弄懂)(?:了)?|终于(?:懂|理解|明白|搞懂|弄懂)(?:了)?|我发现.{0,50}(?:如果|往往|其实)|原来|搞懂了|弄懂了|理解了|明白了|总结(?:下来|出)|规律(?:是|在于)|关键(?:是|在于)|本质(?:是|上是)|作用(?:是|在于)|意味着|之所以.{0,30}是因为/iu;
const momentPattern = /(?:今天|刚刚|最近|此刻|现在|下午|上午).{0,22}(?:感觉|觉得|状态|心情|发生|经历|开心|难过|焦虑|兴奋|集中|专注|自然|顺利|轻松|特别困|很累|拖延)|我(?:感觉|觉得|感到)|心情|焦虑|失落|开心|难过|兴奋|状态很好|状态很差/iu;
const taskActionPattern = /交(?:作业|报告|材料)?|提交|完成|修改|整理|发送|发(?:消息|邮件)|报名|复习|准备|购买|买|写|做|看|读|更新|补完|开始|预约|联系|回复|处理|打印|练习/iu;
const taskTimePattern = /今天|明天|后天|今晚|晚上|上午|下午|下周|周[一二三四五六日天]|星期[一二三四五六日天]|月底|截止|之前|\d{1,2}[点时]/iu;
const taskCommitPattern = /记得|必须|需要|我要|计划|安排|待办|务必|别忘了/iu;
const taskShapePattern = /^(?:把|先|去|请|马上|尽快|继续)?\s*(?:提交|完成|修改|整理|发送|报名|复习|准备|买|购买|写|做|看|读|更新|补完|开始|预约|联系|回复|处理|打印|练习)/iu;
const taskObjectPattern = /^把[^，。！？,.!?；;：:\n]{1,40}(?:提交|完成|修改|整理|发送|报名|复习|准备|买|购买|写|做|看|读|更新|补完|预约|联系|回复|处理|打印|练习)(?:一下|完)?[。！!]?$/iu;
const boundedActionPattern = /(?:做|看|读|写|完成|练习)(?:完)?(?:一|两|二|三|四|五|六|七|八|九|十|\d+)(?:道|套|节|篇|页|次|个|章|组)/iu;

function clampConfidence(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.55) return "medium";
  return "low";
}

export function isPrimaryType(value: unknown): value is PrimaryType {
  return PRIMARY_TYPES.includes(value as PrimaryType);
}

function cleanTopic(value: string): string | null {
  const cleaned = value
    .replace(/[，。！？,.!?；;：:\n]/gu, " ")
    .replace(/^(?:我|这个|那个|一下|一下子|系统地|系统|关于|有关|进一步|深入)+/u, "")
    .replace(/(?:一下|一下子|了|吧|呢|啊|呀|哦|的知识|这个方向|怎么工作|是什么)$/u, "")
    .trim()
    .replace(/\s+/gu, " ");
  if (cleaned.length < 2 || cleaned.length > 24) return null;
  return cleaned;
}

export function inferTopic(body: string, primaryType: PrimaryType | null): string | null {
  const known = topicRules.find((rule) => rule.pattern.test(body));
  if (known) return known.name;
  if (!primaryType || primaryType === "Moment") return null;

  const learningObject = body.match(/(?:了解|研究|学习|弄懂|搞懂|探索|看看|查(?:一)?下)(?:一下|系统地|系统)?([^，。！？,.!?；;：:\n]{2,24})/u)?.[1];
  const createdObject = body.match(/(?:做成|改成|加入|增加)([^，。！？,.!?；;：:\n]{2,24})/u)?.[1];
  const candidate = learningObject ?? createdObject ?? body
    .replace(/今天|明天|后天|今晚|晚上|上午|下午|下周|周[一二三四五六日天]|星期[一二三四五六日天]/gu, "")
    .replace(/截止|提交|完成|记得|待办|必须|要做|交作业|安排一下|需要|想法|点子|灵感|突然想到|我想到|是不是可以|有没有可能/gu, "");
  return cleanTopic(candidate);
}

type DetectedIntent = { type: PrimaryType; confidence: number; reason: string; signal: string };

function detectIntents(body: string): DetectedIntent[] {
  const intents: DetectedIntent[] = [];
  const hasIdea = ideaPattern.test(body);
  const hasMoment = momentPattern.test(body);
  const hasAction = taskActionPattern.test(body);
  const hasStrongTaskShape = taskCommitPattern.test(body) || taskShapePattern.test(body) || taskObjectPattern.test(body) || boundedActionPattern.test(body);
  const hasTask = hasAction && (taskTimePattern.test(body) || hasStrongTaskShape) && (!hasIdea || taskCommitPattern.test(body)) && (!hasMoment || hasStrongTaskShape);

  if (hasTask) intents.push({ type: "Task", confidence: 0.97, reason: "包含可以完成并勾选的明确行动", signal: "concrete_action" });
  if (knowledgePattern.test(body)) intents.push({ type: "Knowledge", confidence: 0.95, reason: "表达了已经形成的理解、结论或规律", signal: "formed_knowledge" });
  if (explorePattern.test(body)) intents.push({ type: "Explore", confidence: 0.93, reason: "表达了继续研究、了解、学习或弄懂的意图", signal: "learning_intent" });
  if (hasMoment) intents.push({ type: "Moment", confidence: 0.91, reason: "主要在记录当下经历、感受或状态", signal: "lived_experience" });
  if (hasIdea) intents.push({ type: "Idea", confidence: 0.92, reason: "表达了尚未承诺执行的点子、设想或可能性", signal: "open_possibility" });
  return intents;
}

export function preferenceSignals(body: string): string[] {
  const signals = detectIntents(body).map((intent) => intent.signal);
  if (!signals.length && /[？?]|怎么|什么|为什么|如何/iu.test(body)) signals.push("open_question");
  if (!signals.length && taskActionPattern.test(body)) signals.push("possible_action");
  if (!signals.length) signals.push("general_note");
  return [...new Set(signals)];
}

export function primaryPreferenceSignal(body: string): string {
  return preferenceSignals(body)[0] ?? "general_note";
}

function fallbackClassification(body: string): Classification {
  const signals = preferenceSignals(body);
  if (/[？?]|怎么|什么|为什么|如何/iu.test(body)) {
    return { primary_type: "Explore", confidence: 0.68, reason: "这是一条希望继续弄清楚的问题，已先归为 Explore", topic: inferTopic(body, "Explore"), source: "fallback", signals };
  }
  if (/因为|所以|意味着|是指|等于|区别在于|作用是|本质是/iu.test(body)) {
    return { primary_type: "Knowledge", confidence: 0.65, reason: "这句话更像一条已经形成的认知，可随时修改", topic: inferTopic(body, "Knowledge"), source: "fallback", signals };
  }
  if (taskActionPattern.test(body)) {
    return { primary_type: "Task", confidence: 0.66, reason: "检测到行动表达，但完成边界不够明确，可随时修改", topic: inferTopic(body, "Task"), source: "fallback", signals };
  }
  if (/我|最近|今天|现在|感觉|状态/iu.test(body)) {
    return { primary_type: "Moment", confidence: 0.58, reason: "这句话更像一条个人观察或当下记录，可随时修改", topic: null, source: "fallback", signals };
  }
  return { primary_type: "Explore", confidence: 0.56, reason: "这更像一个值得继续了解的主题，已先归为 Explore", topic: inferTopic(body, "Explore"), source: "fallback", signals };
}

export function classifyByRules(rawBody: string): Classification {
  const body = rawBody.trim().replace(/\s+/gu, " ");
  if (body.length < 2 || contextlessPattern.test(body)) {
    return { primary_type: null, confidence: 0.25, reason: "内容缺少可判断的行动、认知、探索、经历或设想", topic: null, source: "none", signals: [] };
  }

  const detected = detectIntents(body);
  if (!detected.length) return fallbackClassification(body);
  const ordered = [...detected].sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));
  const primary = ordered[0];
  const secondary = ordered.find((item) => item.type !== primary.type);
  return {
    primary_type: primary.type,
    confidence: primary.confidence,
    reason: secondary ? `${primary.reason}；同时也包含${secondary.type}意图` : primary.reason,
    ...(secondary ? { secondary_type: secondary.type } : {}),
    topic: inferTopic(body, primary.type),
    source: "rule",
    signals: ordered.map((item) => item.signal),
  };
}

export function applyUserPreferences(base: Classification, corrections: ClassificationCorrection[]): Classification {
  if (!base.primary_type || !corrections.length) return base;
  const currentSignals = new Set(base.signals.length ? base.signals : ["general_note"]);
  const scores = new Map<PrimaryType, number>();
  let matchedSignal = false;
  let matchedTopic = false;

  for (const correction of corrections) {
    const signalMatch = Boolean(correction.signal_key && currentSignals.has(correction.signal_key));
    const topicMatch = Boolean(base.topic && correction.topic && base.topic === correction.topic);
    if (!signalMatch && !topicMatch) continue;
    matchedSignal ||= signalMatch;
    matchedTopic ||= topicMatch;
    scores.set(correction.to_type, (scores.get(correction.to_type) ?? 0) + (signalMatch ? 1 : 0) + (topicMatch ? 2 : 0));
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [preferred, score] = ranked[0] ?? [];
  const runnerUp = ranked[1]?.[1] ?? 0;
  if (!preferred || !score || score < 2 || score <= runnerUp) return base;

  if (preferred === base.primary_type) {
    return { ...base, confidence: clampConfidence(base.confidence + 0.03), reason: `${base.reason}；与你此前的账号偏好一致` };
  }

  const strongGlobalSignal = base.confidence >= 0.96 && !(matchedSignal && matchedTopic);
  if (strongGlobalSignal) return base;
  return {
    ...base,
    primary_type: preferred,
    secondary_type: base.primary_type,
    confidence: clampConfidence(0.58 + Math.min(0.28, score * 0.06)),
    reason: `结合你此前对相似内容的手动分类，账号偏好更倾向 ${preferred}`,
    source: "preference",
  };
}

export function repeatTopicDecision(priorCount: number, priorTypes: Array<PrimaryType | null>, currentType: PrimaryType | null) {
  const shouldNotify = priorCount === 2;
  const suggestion: "Explore" | "Project" = [...priorTypes, currentType].includes("Task") ? "Project" : "Explore";
  return { shouldNotify, suggestion };
}
