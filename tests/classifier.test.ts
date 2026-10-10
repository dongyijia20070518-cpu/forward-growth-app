import assert from "node:assert/strict";
import test from "node:test";
import {
  applyUserPreferences,
  classifyByRules,
  confidenceBand,
  repeatTopicDecision,
  type PrimaryType,
} from "../lib/classifier-core";

const confirmedExamples: Array<{ body: string; primary: PrimaryType; secondary?: PrimaryType }> = [
  { body: "周五交运筹学作业", primary: "Task" },
  { body: "是不是可以把这个产品做成浏览器插件", primary: "Idea" },
  { body: "想研究一下 MCP", primary: "Explore" },
  { body: "今天下午状态很好", primary: "Moment" },
  { body: "原来 API 本质上是不同系统之间的接口", primary: "Knowledge" },
  { body: "今天终于懂了两阶段法，晚上再做两道题", primary: "Task", secondary: "Knowledge" },
];

test("confirmed product examples follow main-intent priority", () => {
  for (const example of confirmedExamples) {
    const result = classifyByRules(example.body);
    assert.equal(result.primary_type, example.primary, example.body);
    assert.equal(result.secondary_type, example.secondary, example.body);
    assert.ok(result.confidence >= 0.8, example.body);
    assert.ok(result.reason.length > 0, example.body);
  }
});

test("the sample set covers all five types instead of collapsing to one fallback", () => {
  const types = new Set(confirmedExamples.map((example) => classifyByRules(example.body).primary_type));
  assert.deepEqual([...types].sort(), ["Explore", "Idea", "Knowledge", "Moment", "Task"].sort());
  assert.equal([...types].includes(null), false);
});

test("only genuinely contextless text enters the low-confidence choice state", () => {
  const emptyContext = classifyByRules("嗯……");
  assert.equal(emptyContext.primary_type, null);
  assert.equal(confidenceBand(emptyContext.confidence), "low");

  const meaningfulTopic = classifyByRules("供应链韧性");
  assert.equal(meaningfulTopic.primary_type, "Explore");
  assert.equal(confidenceBand(meaningfulTopic.confidence), "medium");
});

test("common boundary phrases remain stable", () => {
  const cases: Array<[string, PrimaryType]> = [
    ["把简历更新一下", "Task"],
    ["以后可以做一个个人网站", "Idea"],
    ["今天做事特别集中", "Moment"],
    ["今天和同学聊天比以前自然", "Moment"],
    ["我发现如果把任务拆成下一步，我会更容易开始", "Knowledge"],
    ["最近总感觉自己不太懂供应链韧性", "Moment"],
  ];
  for (const [body, primary] of cases) assert.equal(classifyByRules(body).primary_type, primary, body);
});

test("account corrections adjust only matching user preferences", () => {
  const base = classifyByRules("以后想系统学摄影");
  assert.equal(base.primary_type, "Explore");

  const personalized = applyUserPreferences(base, [{
    from_type: "Explore",
    to_type: "Task",
    signal_key: "learning_intent",
    topic: "摄影",
  }]);
  assert.equal(personalized.primary_type, "Task");
  assert.equal(personalized.secondary_type, "Explore");
  assert.equal(personalized.source, "preference");
  assert.equal(classifyByRules("以后想系统学摄影").primary_type, "Explore");
});

test("the repeat-topic reminder fires exactly on the third mention", () => {
  assert.deepEqual(repeatTopicDecision(1, ["Idea"], "Explore"), { shouldNotify: false, suggestion: "Explore" });
  assert.deepEqual(repeatTopicDecision(2, ["Idea", "Explore"], "Explore"), { shouldNotify: true, suggestion: "Explore" });
  assert.deepEqual(repeatTopicDecision(2, ["Task", "Explore"], "Moment"), { shouldNotify: true, suggestion: "Project" });
  assert.deepEqual(repeatTopicDecision(3, ["Idea", "Explore"], "Explore"), { shouldNotify: false, suggestion: "Explore" });
});

test("confidence thresholds match the product contract", () => {
  assert.equal(confidenceBand(0.8), "high");
  assert.equal(confidenceBand(0.79), "medium");
  assert.equal(confidenceBand(0.55), "medium");
  assert.equal(confidenceBand(0.54), "low");
});
