import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { classifyCapture, isPrimaryType } from "@/lib/classifier";
import { primaryPreferenceSignal, repeatTopicDecision, type ClassificationCorrection, type PrimaryType } from "@/lib/classifier-core";
import { adoptLegacyData, database, loadState } from "@/lib/data";

export const dynamic = "force-dynamic";

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const clean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const safeDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/u.test(String(value)) ? String(value) : new Date().toISOString().slice(0, 10);
const storedType = (value: unknown): PrimaryType | null => {
  if (value === "Knowledge Candidate") return "Knowledge";
  return isPrimaryType(value) ? value : null;
};

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

async function hasProfile(userId: string) {
  return database().prepare("SELECT user_id,first_capture_completed FROM profiles WHERE user_id = ? LIMIT 1").bind(userId).first<Record<string, unknown>>();
}

export async function POST(request: NextRequest) {
  try {
    const user = await getChatGPTUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

    const input = await request.json() as { action?: string; payload?: Record<string, unknown> };
    const action = clean(input.action, 40);
    const payload = input.payload ?? {};
    const localDate = safeDate(payload.localDate);
    const db = database();
    const now = new Date().toISOString();
    let meta: Record<string, unknown> = {};

    if (action === "registerProfile") {
      const nickname = clean(payload.nickname, 30);
      if (!nickname) return NextResponse.json({ error: "请告诉我怎么称呼你。" }, { status: 400 });
      const existing = await hasProfile(user.userId);
      if (!existing) await adoptLegacyData(user.userId);
      await db.prepare("INSERT INTO profiles (user_id,email,nickname,first_capture_completed,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email,nickname = excluded.nickname,updated_at = excluded.updated_at")
        .bind(user.userId, user.email, nickname, 0, now, now).run();
      meta = { newRegistration: !existing, nickname };
    } else {
      const account = await hasProfile(user.userId);
      if (!account) return NextResponse.json({ error: "请先完成昵称设置。" }, { status: 409 });

      if (action === "capture") {
        const body = clean(payload.body, 1500);
        if (!body) return NextResponse.json({ error: "先写下一句话吧。" }, { status: 400 });
        const correctionResult = await db.prepare("SELECT from_type,to_type,signal_key,topic FROM classification_corrections WHERE user_id = ? ORDER BY created_at DESC LIMIT 200")
          .bind(user.userId).all<Record<string, unknown>>();
        const corrections: ClassificationCorrection[] = (correctionResult.results ?? []).flatMap((row) => {
          const toType = storedType(row.to_type);
          if (!toType) return [];
          return [{
            from_type: storedType(row.from_type),
            to_type: toType,
            signal_key: row.signal_key ? String(row.signal_key) : null,
            topic: row.topic ? String(row.topic) : null,
          }];
        });
        const result = await classifyCapture(body, corrections);
        let priorCount = 0;
        let priorTypes: Array<PrimaryType | null> = [];
        if (result.topic) {
          const row = await db.prepare("SELECT COUNT(*) AS count FROM captures WHERE user_id = ? AND topic = ?").bind(user.userId, result.topic).first<{ count: number }>();
          priorCount = Number(row?.count ?? 0);
          const priorResult = await db.prepare("SELECT category FROM captures WHERE user_id = ? AND topic = ? ORDER BY created_at DESC LIMIT 2")
            .bind(user.userId, result.topic).all<{ category: string }>();
          priorTypes = (priorResult.results ?? []).map((item) => storedType(item.category));
        }
        const repeatDecision = repeatTopicDecision(priorCount, priorTypes, result.primary_type);
        const captureId = id("capture");
        await db.prepare("INSERT INTO captures (id,user_id,body,category,secondary_type,topic,confidence,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(captureId, user.userId, body, result.primary_type ?? "", result.secondary_type ?? null, result.topic, result.confidence, result.reason, now).run();
        if (result.primary_type === "Task") {
          await db.prepare("INSERT INTO tasks (id,user_id,title,notes,tier,status,due_date,carry_count,progress_text,project_id,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(id("task"), user.userId, body, `由记录 ${captureId} 创建`, "suggested", "open", dueDateFrom(body, localDate), 0, "", null, now, null).run();
        }
        const firstCapture = !Boolean(account.first_capture_completed);
        if (firstCapture) await db.prepare("UPDATE profiles SET first_capture_completed = 1,updated_at = ? WHERE user_id = ?").bind(now, user.userId).run();
        meta = { captureId, classification: result, repeated: Boolean(result.topic && repeatDecision.shouldNotify), repeatSuggestion: repeatDecision.suggestion, mentionCount: priorCount + 1, firstCapture };
      } else if (action === "updateCaptureCategory") {
        const captureId = clean(payload.id, 100);
        const category = clean(payload.category, 40);
        if (!isPrimaryType(category)) return NextResponse.json({ error: "这个分类暂不支持。" }, { status: 400 });
        const capture = await db.prepare("SELECT id,body,category,topic,created_at FROM captures WHERE id = ? AND user_id = ? LIMIT 1").bind(captureId, user.userId).first<Record<string, unknown>>();
        if (!capture) return NextResponse.json({ error: "没有找到这条记录。" }, { status: 404 });
        const previousType = storedType(capture.category);
        const taskNote = `由记录 ${captureId} 创建`;
        const generatedTask = await db.prepare("SELECT id,status FROM tasks WHERE user_id = ? AND (notes = ? OR (title = ? AND created_at = ? AND notes = '由快速记录自动识别')) LIMIT 1")
          .bind(user.userId, taskNote, String(capture.body), String(capture.created_at)).first<{ id: string; status: string }>();
        if (category === "Task" && !generatedTask) {
          await db.prepare("INSERT INTO tasks (id,user_id,title,notes,tier,status,due_date,carry_count,progress_text,project_id,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(id("task"), user.userId, String(capture.body), taskNote, "suggested", "open", dueDateFrom(String(capture.body), localDate), 0, "", null, String(capture.created_at), null).run();
        } else if (category !== "Task" && generatedTask?.status === "open") {
          await db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").bind(generatedTask.id, user.userId).run();
        }
        if (previousType !== category) {
          await db.prepare("INSERT INTO classification_corrections (id,user_id,capture_id,body,from_type,to_type,signal_key,topic,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
            .bind(id("correction"), user.userId, captureId, String(capture.body), previousType, category, primaryPreferenceSignal(String(capture.body)), capture.topic ? String(capture.topic) : null, now).run();
        }
        await db.prepare("UPDATE captures SET category = ?,secondary_type = NULL,confidence = 1,reason = ? WHERE id = ? AND user_id = ?")
          .bind(category, `你手动选择了 ${category}，已记入账号偏好`, captureId, user.userId).run();
      } else if (action === "updateTask") {
        const taskId = clean(payload.id, 100);
        const status = payload.status === "done" ? "done" : "open";
        const progressText = clean(payload.progressText, 500);
        const item = await db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").bind(taskId, user.userId).first<Record<string, unknown>>();
        if (!item) return NextResponse.json({ error: "没有找到这项任务。" }, { status: 404 });
        await db.prepare("UPDATE tasks SET status = ?,progress_text = ?,completed_at = ? WHERE id = ? AND user_id = ?")
          .bind(status, progressText, status === "done" ? now : null, taskId, user.userId).run();
        if (status === "done" && item.project_id) {
          await db.batch([
            db.prepare("INSERT INTO progress_events (id,user_id,project_id,body,created_at) VALUES (?,?,?,?,?)").bind(id("event"), user.userId, String(item.project_id), `完成任务：${String(item.title)}`, now),
            db.prepare("UPDATE projects SET updated_at = ? WHERE id = ? AND user_id = ?").bind(now, String(item.project_id), user.userId),
          ]);
        }
      } else if (action === "createTask") {
        const title = clean(payload.title, 300);
        const projectId = clean(payload.projectId, 100);
        const dueDate = safeDate(payload.dueDate || localDate);
        if (!title) return NextResponse.json({ error: "先写清楚这一步要做什么。" }, { status: 400 });
        if (projectId) {
          const owned = await db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ? LIMIT 1").bind(projectId, user.userId).first();
          if (!owned) return NextResponse.json({ error: "没有找到这个项目。" }, { status: 404 });
        }
        const existing = await db.prepare("SELECT id FROM tasks WHERE user_id = ? AND title = ? AND due_date = ? AND status = 'open' AND COALESCE(project_id,'') = ? LIMIT 1")
          .bind(user.userId, title, dueDate, projectId).first<{ id: string }>();
        if (existing) {
          meta = { taskId: existing.id, existed: true };
        } else {
          const taskId = id("task");
          await db.prepare("INSERT INTO tasks (id,user_id,title,notes,tier,status,due_date,carry_count,progress_text,project_id,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(taskId, user.userId, title, "从 Project 的 Plan 创建", "suggested", "open", dueDate, 0, "", projectId || null, now, null).run();
          meta = { taskId, existed: false };
        }
      } else if (action === "addProgress") {
        const projectId = clean(payload.projectId, 100);
        const body = clean(payload.body, 800);
        const nextStep = clean(payload.nextStep, 500);
        if (!projectId || !body) return NextResponse.json({ error: "写下这次推进到了哪里。" }, { status: 400 });
        const owned = await db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").bind(projectId, user.userId).first();
        if (!owned) return NextResponse.json({ error: "没有找到这个项目。" }, { status: 404 });
        await db.batch([
          db.prepare("INSERT INTO progress_events (id,user_id,project_id,body,created_at) VALUES (?,?,?,?,?)").bind(id("event"), user.userId, projectId, body, now),
          db.prepare("UPDATE projects SET current_state = ?,next_step = CASE WHEN ? = '' THEN next_step ELSE ? END,updated_at = ? WHERE id = ? AND user_id = ?").bind(body, nextStep, nextStep, now, projectId, user.userId),
        ]);
      } else if (action === "createProject") {
        const title = clean(payload.title, 120);
        if (!title) return NextResponse.json({ error: "给这个项目起个名字。" }, { status: 400 });
        const projectId = id("project");
        await db.prepare("INSERT INTO projects (id,user_id,title,why,current_state,next_step,status,accent,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(projectId, user.userId, title, clean(payload.why, 600), "刚刚开始", clean(payload.nextStep, 400) || "写下第一个最小行动", "focus", "blue", now).run();
        meta = { projectId };
      } else if (action === "saveReview") {
        const periodKind = ["daily", "weekly", "monthly", "yearly"].includes(clean(payload.periodKind, 20)) ? clean(payload.periodKind, 20) : "daily";
        const periodLabel = clean(payload.periodLabel, 20) || localDate;
        const reflection = clean(payload.reflection, 2000);
        await db.prepare("INSERT INTO reviews (id,user_id,period_kind,period_label,reflection,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,period_kind,period_label) DO UPDATE SET reflection = excluded.reflection,created_at = excluded.created_at")
          .bind(id("review"), user.userId, periodKind, periodLabel, reflection, now).run();
      } else if (action === "saveKnowledge") {
        await db.prepare("UPDATE captures SET category = 'Knowledge',secondary_type = NULL,confidence = 1,reason = '你已确认这是一条 Knowledge' WHERE id = ? AND user_id = ?").bind(clean(payload.id, 100), user.userId).run();
      } else {
        return NextResponse.json({ error: "未知操作。" }, { status: 400 });
      }
    }

    return NextResponse.json({ state: await loadState(user.userId, localDate), meta });
  } catch (error) {
    console.error("action_failed", error);
    return NextResponse.json({ error: "这次没有保存成功，内容会留在本机并稍后重试。" }, { status: 503 });
  }
}
