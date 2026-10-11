import { classifyByRules, isPrimaryType, repeatTopicDecision } from "@/lib/classifier-core";
import type { AppState, Capture, Review, Task } from "@/lib/data";

export type LocalAction = { action: string; payload: Record<string, unknown> };
export type LocalResult = { state: AppState; meta: Record<string, unknown> };

export const STORAGE_KEY = "forward-growth-state-v2";

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const clean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const safeDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/u.test(String(value)) ? String(value) : new Date().toISOString().slice(0, 10);

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dueDateFrom(body: string, today: string) {
  if (body.includes("后天")) return addDays(today, 2);
  if (body.includes("明天")) return addDays(today, 1);
  const weekday = body.match(/(?:周|星期)([一二三四五六日天])/u)?.[1];
  if (!weekday) return today;
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
  const current = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  const distance = (map[weekday] - current + 7) % 7 || 7;
  return addDays(today, distance);
}

export function emptyAppState(localDate: string): AppState {
  return { profile: null, projects: [], tasks: [], captures: [], progressEvents: [], skills: [], reviews: [], localDate, syncedAt: new Date().toISOString() };
}

export function loadLocalState(localDate: string): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAppState(localDate);
    return rollForward(JSON.parse(raw) as AppState, localDate);
  } catch {
    return emptyAppState(localDate);
  }
}

export function saveLocalState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function rollForward(state: AppState, localDate: string): AppState {
  const tasks = state.tasks.map((task) => task.status === "open" && task.dueDate < localDate
    ? { ...task, dueDate: localDate, carryCount: task.carryCount + 1 }
    : task);
  return { ...state, tasks, localDate, syncedAt: new Date().toISOString() };
}

export function applyLocalAction(current: AppState, item: LocalAction): LocalResult {
  const action = item.action;
  const payload = item.payload ?? {};
  const localDate = safeDate(payload.localDate);
  const now = new Date().toISOString();
  let state = rollForward(current, localDate);
  let meta: Record<string, unknown> = {};

  if (action === "registerProfile") {
    const nickname = clean(payload.nickname, 30);
    if (!nickname) throw new Error("请告诉我怎么称呼你。");
    state = { ...state, profile: { email: "", nickname, firstCaptureCompleted: false } };
    return { state, meta: { nickname } };
  }
  if (!state.profile) throw new Error("请先完成昵称设置。");

  if (action === "capture") {
    const body = clean(payload.body, 1500);
    if (!body) throw new Error("先写下一句话吧。");
    const result = classifyByRules(body);
    const prior = result.topic ? state.captures.filter((capture) => capture.topic === result.topic) : [];
    const priorTypes = prior.slice(0, 2).map((capture) => isPrimaryType(capture.category) ? capture.category : null);
    const decision = repeatTopicDecision(prior.length, priorTypes, result.primary_type);
    const captureId = id("capture");
    const capture: Capture = { id: captureId, body, category: result.primary_type ?? "", secondaryType: result.secondary_type ?? null, topic: result.topic, confidence: result.confidence, reason: result.reason, createdAt: now };
    const tasks = [...state.tasks];
    if (result.primary_type === "Task") tasks.push(makeTask(body, dueDateFrom(body, localDate), now, null, `由记录 ${captureId} 创建`));
    const firstCapture = !state.profile.firstCaptureCompleted;
    state = { ...state, captures: [capture, ...state.captures], tasks, profile: { ...state.profile, firstCaptureCompleted: true } };
    meta = { captureId, classification: result, repeated: Boolean(result.topic && decision.shouldNotify), repeatSuggestion: decision.suggestion, mentionCount: prior.length + 1, firstCapture };
  } else if (action === "updateCaptureCategory") {
    const captureId = clean(payload.id, 100);
    const category = clean(payload.category, 40);
    if (!isPrimaryType(category)) throw new Error("这个分类暂不支持。");
    const capture = state.captures.find((item) => item.id === captureId);
    if (!capture) throw new Error("没有找到这条记录。");
    const note = `由记录 ${captureId} 创建`;
    const generated = state.tasks.find((task) => task.notes === note);
    let tasks = state.tasks;
    if (category === "Task" && !generated) tasks = [...tasks, makeTask(capture.body, dueDateFrom(capture.body, localDate), capture.createdAt, null, note)];
    if (category !== "Task" && generated?.status === "open") tasks = tasks.filter((task) => task.id !== generated.id);
    state = { ...state, tasks, captures: state.captures.map((item) => item.id === captureId ? { ...item, category, secondaryType: null, confidence: 1, reason: `你手动选择了 ${category}` } : item) };
  } else if (action === "updateTask") {
    const taskId = clean(payload.id, 100);
    const existing = state.tasks.find((task) => task.id === taskId);
    if (!existing) throw new Error("没有找到这项任务。");
    const status = payload.status === "done" ? "done" : "open";
    const progressText = clean(payload.progressText, 500);
    const tasks = state.tasks.map((task) => task.id === taskId ? { ...task, status, progressText, completedAt: status === "done" ? now : null } : task);
    let progressEvents = state.progressEvents;
    let projects = state.projects;
    if (status === "done" && existing.status !== "done" && existing.projectId) {
      progressEvents = [{ id: id("event"), projectId: existing.projectId, body: `完成任务：${existing.title}`, createdAt: now }, ...progressEvents];
      projects = projects.map((project) => project.id === existing.projectId ? { ...project, updatedAt: now } : project);
    }
    state = { ...state, tasks, progressEvents, projects };
  } else if (action === "createTask") {
    const title = clean(payload.title, 300);
    const projectId = clean(payload.projectId, 100) || null;
    const dueDate = safeDate(payload.dueDate || localDate);
    if (!title) throw new Error("先写清楚这一步要做什么。");
    const existing = state.tasks.find((task) => task.title === title && task.dueDate === dueDate && task.status === "open" && task.projectId === projectId);
    if (existing) meta = { taskId: existing.id, existed: true };
    else {
      const task = makeTask(title, dueDate, now, projectId, "从 Project 的 Plan 创建");
      state = { ...state, tasks: [...state.tasks, task] };
      meta = { taskId: task.id, existed: false };
    }
  } else if (action === "addProgress") {
    const projectId = clean(payload.projectId, 100);
    const body = clean(payload.body, 800);
    const nextStep = clean(payload.nextStep, 500);
    if (!projectId || !body) throw new Error("写下这次推进到了哪里。");
    state = { ...state, progressEvents: [{ id: id("event"), projectId, body, createdAt: now }, ...state.progressEvents], projects: state.projects.map((project) => project.id === projectId ? { ...project, currentState: body, nextStep: nextStep || project.nextStep, updatedAt: now } : project) };
  } else if (action === "createProject") {
    const title = clean(payload.title, 120);
    if (!title) throw new Error("给这个项目起个名字。");
    const projectId = id("project");
    state = { ...state, projects: [{ id: projectId, title, why: clean(payload.why, 600), currentState: "刚刚开始", nextStep: clean(payload.nextStep, 400) || "写下第一个最小行动", status: "focus", accent: "blue", updatedAt: now }, ...state.projects] };
    meta = { projectId };
  } else if (action === "saveReview") {
    const periodKind = ["daily", "weekly", "monthly", "yearly"].includes(clean(payload.periodKind, 20)) ? clean(payload.periodKind, 20) : "daily";
    const periodLabel = clean(payload.periodLabel, 20) || localDate;
    const review: Review = { id: id("review"), periodKind, periodLabel, reflection: clean(payload.reflection, 2000), createdAt: now };
    state = { ...state, reviews: [review, ...state.reviews.filter((item) => item.periodKind !== periodKind || item.periodLabel !== periodLabel)] };
  } else {
    throw new Error("未知操作。");
  }

  return { state: { ...state, syncedAt: now }, meta };
}

function makeTask(title: string, dueDate: string, createdAt: string, projectId: string | null, notes: string): Task {
  return { id: id("task"), title, notes, tier: "suggested", status: "open", dueDate, carryCount: 0, progressText: "", projectId, createdAt, completedAt: null };
}
