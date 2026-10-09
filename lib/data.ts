import { env } from "cloudflare:workers";

export type Profile = {
  email: string;
  nickname: string;
  firstCaptureCompleted: boolean;
};
export type Project = { id: string; title: string; why: string; currentState: string; nextStep: string; status: string; accent: string; updatedAt: string };
export type Task = { id: string; title: string; notes: string; tier: string; status: string; dueDate: string; carryCount: number; progressText: string; projectId: string | null; createdAt: string; completedAt: string | null };
export type Capture = { id: string; body: string; category: string; topic: string | null; confidence: number; createdAt: string };
export type ProgressEvent = { id: string; projectId: string; body: string; createdAt: string };
export type Skill = { id: string; name: string; level: string; evidence: string; updatedAt: string };
export type Review = { id: string; periodKind: string; periodLabel: string; reflection: string; createdAt: string };
export type AppState = {
  profile: Profile | null;
  projects: Project[];
  tasks: Task[];
  captures: Capture[];
  progressEvents: ProgressEvent[];
  skills: Skill[];
  reviews: Review[];
  localDate: string;
  syncedAt: string;
};

function db() {
  if (!env.DB) throw new Error("The shared database is temporarily unavailable.");
  return env.DB;
}

function safeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : new Date().toISOString().slice(0, 10);
}

const profile = (row: Record<string, unknown>): Profile => ({
  email: String(row.email),
  nickname: String(row.nickname),
  firstCaptureCompleted: Boolean(row.first_capture_completed),
});
const project = (row: Record<string, unknown>): Project => ({
  id: String(row.id), title: String(row.title), why: String(row.why ?? ""), currentState: String(row.current_state ?? ""), nextStep: String(row.next_step ?? ""), status: String(row.status), accent: String(row.accent), updatedAt: String(row.updated_at),
});
const task = (row: Record<string, unknown>): Task => ({
  id: String(row.id), title: String(row.title), notes: String(row.notes ?? ""), tier: String(row.tier), status: String(row.status), dueDate: String(row.due_date), carryCount: Number(row.carry_count ?? 0), progressText: String(row.progress_text ?? ""), projectId: row.project_id ? String(row.project_id) : null, createdAt: String(row.created_at), completedAt: row.completed_at ? String(row.completed_at) : null,
});
const capture = (row: Record<string, unknown>): Capture => ({
  id: String(row.id), body: String(row.body), category: String(row.category), topic: row.topic ? String(row.topic) : null, confidence: Number(row.confidence ?? 0), createdAt: String(row.created_at),
});
const event = (row: Record<string, unknown>): ProgressEvent => ({ id: String(row.id), projectId: String(row.project_id), body: String(row.body), createdAt: String(row.created_at) });
const skill = (row: Record<string, unknown>): Skill => ({ id: String(row.id), name: String(row.name), level: String(row.level), evidence: String(row.evidence ?? ""), updatedAt: String(row.updated_at) });
const review = (row: Record<string, unknown>): Review => ({ id: String(row.id), periodKind: String(row.period_kind), periodLabel: String(row.period_label), reflection: String(row.reflection ?? ""), createdAt: String(row.created_at) });

export async function adoptLegacyData(userId: string) {
  const database = db();
  await database.batch([
    database.prepare("DELETE FROM progress_events WHERE id IN ('event-1','event-2','event-3')"),
    database.prepare("DELETE FROM tasks WHERE id IN ('task-or','task-cv','task-site','task-photo')"),
    database.prepare("DELETE FROM captures WHERE id IN ('capture-1','capture-2')"),
    database.prepare("DELETE FROM skills WHERE id IN ('skill-1','skill-2','skill-3')"),
    database.prepare("DELETE FROM projects WHERE id IN ('project-site','project-or','project-photo')"),
    database.prepare("UPDATE projects SET user_id = ? WHERE user_id = ''").bind(userId),
    database.prepare("UPDATE tasks SET user_id = ? WHERE user_id = ''").bind(userId),
    database.prepare("UPDATE captures SET user_id = ? WHERE user_id = ''").bind(userId),
    database.prepare("UPDATE progress_events SET user_id = ? WHERE user_id = ''").bind(userId),
    database.prepare("UPDATE skills SET user_id = ? WHERE user_id = ''").bind(userId),
    database.prepare("UPDATE reviews SET user_id = ? WHERE user_id = ''").bind(userId),
  ]);
}

export async function loadState(userId: string, localDate: string): Promise<AppState> {
  const database = db();
  const today = safeDate(localDate);
  await database.prepare("UPDATE tasks SET due_date = ?, carry_count = carry_count + 1 WHERE user_id = ? AND status = 'open' AND due_date < ?").bind(today, userId, today).run();

  const [profileResult, projectsResult, tasksResult, capturesResult, eventsResult, skillsResult, reviewsResult] = await database.batch([
    database.prepare("SELECT email,nickname,first_capture_completed FROM profiles WHERE user_id = ? LIMIT 1").bind(userId),
    database.prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY CASE status WHEN 'focus' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, updated_at DESC").bind(userId),
    database.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY CASE tier WHEN 'must' THEN 0 WHEN 'suggested' THEN 1 ELSE 2 END, created_at ASC").bind(userId),
    database.prepare("SELECT * FROM captures WHERE user_id = ? ORDER BY created_at DESC LIMIT 200").bind(userId),
    database.prepare("SELECT * FROM progress_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 300").bind(userId),
    database.prepare("SELECT * FROM skills WHERE user_id = ? ORDER BY updated_at DESC").bind(userId),
    database.prepare("SELECT * FROM reviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(userId),
  ]);

  const profileRow = (profileResult.results as Record<string, unknown>[])[0];
  return {
    profile: profileRow ? profile(profileRow) : null,
    projects: (projectsResult.results as Record<string, unknown>[]).map(project),
    tasks: (tasksResult.results as Record<string, unknown>[]).map(task),
    captures: (capturesResult.results as Record<string, unknown>[]).map(capture),
    progressEvents: (eventsResult.results as Record<string, unknown>[]).map(event),
    skills: (skillsResult.results as Record<string, unknown>[]).map(skill),
    reviews: (reviewsResult.results as Record<string, unknown>[]).map(review),
    localDate: today,
    syncedAt: new Date().toISOString(),
  };
}

export function database() {
  return db();
}
