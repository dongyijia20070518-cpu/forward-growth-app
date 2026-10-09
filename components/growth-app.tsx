"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, Check, ChevronRight, Clock3, FolderKanban, LogOut, Menu, MoreHorizontal, Plus, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import type { AppState, Capture, Project, Task } from "@/lib/data";

type View = "today" | "capture" | "projects" | "review";
type QueuedAction = { action: string; payload: Record<string, unknown> };
type RepeatNotice = { topic: string; count: number; captureId?: string };
type Account = { userId: string; email: string };

const emptyState: AppState = { profile: null, projects: [], tasks: [], captures: [], progressEvents: [], skills: [], reviews: [], localDate: "", syncedAt: "" };
const nav = [
  { id: "today" as View, label: "Today", icon: CalendarDays },
  { id: "capture" as View, label: "Capture", icon: Plus },
  { id: "projects" as View, label: "Projects", icon: FolderKanban },
  { id: "review" as View, label: "Review", icon: BookOpen },
];
const tierLabels: Record<string, string> = { must: "必须做", suggested: "建议做", optional: "有空可以做" };
const categoryColors: Record<string, string> = { Task: "yellow", Idea: "pink", Explore: "blue", Moment: "pink", "Knowledge Candidate": "blue", Knowledge: "blue", 暂未分类: "neutral" };
const editableCategories = ["Task", "Idea", "Explore", "Moment", "Knowledge Candidate", "暂未分类"];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function dateLabel(date: Date | null) {
  if (!date) return "正在读取本地日期…";
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 星期${weekdays[date.getDay()]}`;
}
function shortDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value)); }
function shortTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)); }
function sameLocalDay(value: string, key: string) { return localDateKey(new Date(value)) === key; }
function periodLabel(kind: string, date: Date) {
  if (kind === "daily") return localDateKey(date);
  if (kind === "monthly") return localDateKey(date).slice(0, 7);
  if (kind === "yearly") return String(date.getFullYear());
  const monday = new Date(date); const offset = (monday.getDay() + 6) % 7; monday.setDate(monday.getDate() - offset);
  return localDateKey(monday);
}
function inPeriod(value: string | null, kind: string, now: Date) {
  if (!value) return false;
  const date = new Date(value);
  if (kind === "daily") return localDateKey(date) === localDateKey(now);
  if (kind === "monthly") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (kind === "yearly") return date.getFullYear() === now.getFullYear();
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return date >= start && date < end;
}

async function postAction(item: QueuedAction) {
  const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) });
  const data = await response.json() as { state?: AppState; meta?: Record<string, unknown>; error?: string };
  if (!response.ok) throw new Error(data.error || "保存失败");
  return data;
}

export function GrowthApp({ account, signOutPath }: { account: Account; signOutPath: string }) {
  const [view, setView] = useState<View>("today");
  const [state, setState] = useState<AppState>(emptyState);
  const [ready, setReady] = useState(false);
  const [clock, setClock] = useState<Date | null>(null);
  const [localDate, setLocalDate] = useState("");
  const [captureText, setCaptureText] = useState("");
  const [syncing, setSyncing] = useState(true);
  const [offline, setOffline] = useState(false);
  const [repeatNotice, setRepeatNotice] = useState<RepeatNotice | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [taskSheet, setTaskSheet] = useState<Task | null>(null);
  const [taskProgress, setTaskProgress] = useState("");
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProject, setNewProject] = useState({ title: "", why: "", nextStep: "" });
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const queueKey = `forward-queue-${account.userId}`;

  const refresh = useCallback(async (dateKey: string) => {
    setSyncing(true);
    try {
      const response = await fetch(`/api/state?date=${encodeURIComponent(dateKey)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("读取失败");
      const next = await response.json() as AppState;
      setState(next);
      setSelectedProjectId((current) => current || next.projects[0]?.id || "");
      setOffline(false);
    } catch { setOffline(true); }
    finally { setSyncing(false); setReady(true); }
  }, []);

  const queueOffline = useCallback((item: QueuedAction) => {
    const queue = JSON.parse(localStorage.getItem(queueKey) || "[]") as QueuedAction[];
    queue.push(item); localStorage.setItem(queueKey, JSON.stringify(queue)); setOffline(true);
  }, [queueKey]);

  const runAction = useCallback(async (item: QueuedAction, optimistic?: () => void) => {
    const prepared = { ...item, payload: { ...item.payload, localDate: localDate || localDateKey() } };
    optimistic?.(); setSyncing(true);
    try {
      const data = await postAction(prepared);
      if (data.state) setState(data.state);
      setOffline(false);
      return data.meta ?? {};
    } catch (error) {
      queueOffline(prepared);
      toast.warning(error instanceof Error ? error.message : "已保存在离线队列");
      return {};
    } finally { setSyncing(false); }
  }, [localDate, queueOffline]);

  useEffect(() => {
    const initial = new Date(); const initialKey = localDateKey(initial);
    setClock(initial); setLocalDate(initialKey); void refresh(initialKey);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    const flush = async () => {
      const queue = JSON.parse(localStorage.getItem(queueKey) || "[]") as QueuedAction[];
      if (!queue.length) return;
      for (const item of queue) { try { const data = await postAction(item); if (data.state) setState(data.state); } catch { return; } }
      localStorage.removeItem(queueKey); setOffline(false); toast.success("离线记录已同步");
    };
    const checkDate = () => {
      const next = new Date(); const nextKey = localDateKey(next); setClock(next);
      setLocalDate((current) => { if (current && current !== nextKey) void refresh(nextKey); return nextKey; });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") { checkDate(); void flush(); } };
    const timer = window.setInterval(checkDate, 60_000);
    window.addEventListener("online", flush); document.addEventListener("visibilitychange", onVisibility); void flush();
    return () => { window.clearInterval(timer); window.removeEventListener("online", flush); document.removeEventListener("visibilitychange", onVisibility); };
  }, [queueKey, refresh]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool || !state.profile) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "capture_thought", title: "记录一条想法", description: "把一句新的任务、想法、探索、时刻或知识记录到向前。", inputSchema: { type: "object", properties: { body: { type: "string" } }, required: ["body"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const body = String((input as { body?: unknown }).body ?? "").trim(); if (!body) throw new Error("body is required"); const data = await postAction({ action: "capture", payload: { body, localDate: localDate || localDateKey() } }); if (data.state) setState(data.state); return { saved: true, classification: data.meta?.classification }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [localDate, state.profile]);

  const todayTasks = state.tasks.filter((task) => task.dueDate === localDate);
  const todayCaptures = state.captures.filter((item) => sameLocalDay(item.createdAt, localDate));
  const completed = todayTasks.filter((task) => task.status === "done").length;
  const selectedProject = state.projects.find((project) => project.id === selectedProjectId) ?? state.projects[0];
  const selectedEvents = state.progressEvents.filter((event) => event.projectId === selectedProject?.id);
  const projectTasks = state.tasks.filter((task) => task.projectId === selectedProject?.id);

  const submitCapture = async () => {
    const body = captureText.trim(); if (!body) return; setCaptureText("");
    const optimistic: Capture = { id: `local-${Date.now()}`, body, category: "正在判断", topic: null, confidence: 0, createdAt: new Date().toISOString() };
    const meta = await runAction({ action: "capture", payload: { body } }, () => setState((current) => ({ ...current, captures: [optimistic, ...current.captures] })));
    const classification = meta.classification as { category?: string; topic?: string } | undefined;
    if (meta.repeated && classification?.topic) setRepeatNotice({ topic: classification.topic, count: Number(meta.mentionCount ?? 3), captureId: String(meta.captureId ?? "") });
    if (meta.firstCapture) toast.success("以后你只需要写，整理交给我。");
    else if (classification?.category) toast.success(`已记录 · ${classification.category}`);
  };
  const toggleTask = (task: Task, checked: boolean) => runAction({ action: "updateTask", payload: { id: task.id, status: checked ? "done" : "open", progressText: task.progressText } }, () => setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: checked ? "done" : "open" } : item) })));
  const openTask = (task: Task) => { setTaskSheet(task); setTaskProgress(task.progressText); };
  const saveTaskProgress = async () => { if (!taskSheet) return; await runAction({ action: "updateTask", payload: { id: taskSheet.id, status: taskSheet.status, progressText: taskProgress } }); setTaskSheet(null); toast.success("进度已更新"); };
  const updateCategory = (capture: Capture, category: string) => runAction({ action: "updateCaptureCategory", payload: { id: capture.id, category } }, () => setState((current) => ({ ...current, captures: current.captures.map((item) => item.id === capture.id ? { ...item, category, confidence: 100 } : item) })));
  const saveProgress = async () => { if (!selectedProject || !progressText.trim()) return; await runAction({ action: "addProgress", payload: { projectId: selectedProject.id, body: progressText, nextStep } }); setProgressText(""); setNextStep(""); setProgressOpen(false); toast.success("这一步已经进入项目时间线"); };
  const createProject = async () => { if (!newProject.title.trim()) return; const meta = await runAction({ action: "createProject", payload: newProject }); if (meta.projectId) setSelectedProjectId(String(meta.projectId)); setNewProject({ title: "", why: "", nextStep: "" }); setNewProjectOpen(false); setRepeatNotice(null); setView("projects"); toast.success("项目已建立"); };
  const startProjectFromTopic = (topic: string) => { setNewProject({ title: `${topic}探索`, why: `这是我反复提到的主题：${topic}`, nextStep: "写下第一个最小行动" }); setNewProjectOpen(true); };
  const register = async (nickname: string) => {
    setSyncing(true);
    try {
      const data = await postAction({ action: "registerProfile", payload: { nickname, localDate: localDate || localDateKey() } });
      if (data.state) setState(data.state);
      setWelcomeName(nickname); window.setTimeout(() => setWelcomeName(null), 1350);
    } catch (error) { toast.error(error instanceof Error ? error.message : "注册失败"); }
    finally { setSyncing(false); }
  };

  if (!ready) return <div className="app-loading"><div className="brand-mark">向</div><p>正在打开你的空间…</p></div>;
  if (!state.profile) return <><Onboarding email={account.email} busy={syncing} onSubmit={register}/><Toaster position="top-center" richColors/></>;

  return <SidebarProvider style={{ "--sidebar-width": "15.5rem" } as React.CSSProperties}>
    {welcomeName && <WelcomeOverlay nickname={welcomeName}/>}
    <Sidebar collapsible="offcanvas" className="growth-sidebar">
      <SidebarHeader className="brand-wrap"><div className="brand-mark">向</div><div><strong>向前</strong><span>把成长留在日常里</span></div></SidebarHeader>
      <SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{nav.map((item) => <SidebarMenuItem key={item.id}><SidebarMenuButton asChild isActive={view === item.id} className="growth-nav"><button onClick={() => setView(item.id)}><item.icon/><span>{item.label}</span></button></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="account-foot"><div className="account-copy"><strong>{state.profile.nickname}</strong><span>{account.email}</span></div><a href={signOutPath} target="_top" aria-label="退出登录"><LogOut/></a><div className="sync-status"><div className={`sync-dot ${offline ? "offline" : ""}`}/><span>{offline ? "离线 · 稍后自动同步" : syncing ? "正在同步" : "所有设备已同步"}</span></div></SidebarFooter>
    </Sidebar>
    <SidebarInset className="growth-shell">
      <header className="mobile-header"><SidebarTrigger><Menu/></SidebarTrigger><span>向前</span><div className={`sync-dot ${offline ? "offline" : ""}`}/></header>
      <main className="workspace">
        {view === "today" && <TodayView state={state} clock={clock} localDate={localDate} tasks={todayTasks} captures={todayCaptures} completed={completed} captureText={captureText} setCaptureText={setCaptureText} submitCapture={submitCapture} toggleTask={toggleTask} openTask={openTask} setView={setView} repeatNotice={repeatNotice} dismissRepeat={() => setRepeatNotice(null)} createProject={startProjectFromTopic}/>}
        {view === "capture" && <CaptureView state={state} captureText={captureText} setCaptureText={setCaptureText} submitCapture={submitCapture} updateCategory={updateCategory}/>}
        {view === "projects" && <ProjectsView projects={state.projects} selectedProject={selectedProject} events={selectedEvents} tasks={projectTasks} select={setSelectedProjectId} openProgress={() => setProgressOpen(true)} openNew={() => setNewProjectOpen(true)}/>}
        {view === "review" && <ReviewView state={state} clock={clock ?? new Date()} save={(kind, label, reflection) => runAction({ action: "saveReview", payload: { periodKind: kind, periodLabel: label, reflection } })}/>}
      </main>
      <nav className="bottom-nav" aria-label="主导航">{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><item.icon/><span>{item.label}</span></button>)}</nav>
    </SidebarInset>
    <Sheet open={Boolean(taskSheet)} onOpenChange={(open) => !open && setTaskSheet(null)}><SheetContent className="task-sheet"><SheetHeader><SheetTitle>{taskSheet?.title}</SheetTitle><SheetDescription>写一句当前做到哪里；它会留在任务与项目轨迹里。</SheetDescription></SheetHeader><div className="sheet-body"><label>当前进度</label><Textarea value={taskProgress} onChange={(event) => setTaskProgress(event.target.value)} placeholder="例如：资料已经找完，正文写到第二部分"/><Button onClick={saveTaskProgress}>保存进度</Button></div></SheetContent></Sheet>
    <Dialog open={progressOpen} onOpenChange={setProgressOpen}><DialogContent className="soft-dialog"><DialogHeader><DialogTitle>更新「{selectedProject?.title}」</DialogTitle><DialogDescription>用一句真实的话记录这次推进，不需要估算百分比。</DialogDescription></DialogHeader><label>现在做到哪里</label><Textarea value={progressText} onChange={(event) => setProgressText(event.target.value)} placeholder="例如：三个作品已经整理完两个"/><label>下一步（可选）</label><Textarea value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder={selectedProject?.nextStep}/><DialogFooter><Button onClick={saveProgress}>加入进度时间线</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}><DialogContent className="soft-dialog"><DialogHeader><DialogTitle>开始一个新项目</DialogTitle><DialogDescription>Project 意味着你决定行动；还不确定的方向可以先留在 Explore。</DialogDescription></DialogHeader><label>项目名称</label><input value={newProject.title} onChange={(event) => setNewProject({ ...newProject, title: event.target.value })} placeholder="例如：摄影基础练习"/><label>为什么想做</label><Textarea value={newProject.why} onChange={(event) => setNewProject({ ...newProject, why: event.target.value })}/><label>第一个最小行动</label><input value={newProject.nextStep} onChange={(event) => setNewProject({ ...newProject, nextStep: event.target.value })}/><DialogFooter><Button onClick={createProject}>创建项目</Button></DialogFooter></DialogContent></Dialog>
    <Toaster position="top-center" richColors/>
  </SidebarProvider>;
}

function Onboarding({ email, busy, onSubmit }: { email: string; busy: boolean; onSubmit: (nickname: string) => void }) {
  const [nickname, setNickname] = useState("");
  return <main className="onboarding"><section className="auth-card"><div className="brand-mark">向</div><span className="eyebrow">WELCOME TO 向前</span><h1>先认识一下你。</h1><p>你的邮箱负责登录与多端同步，昵称只用来让这里更像属于你的空间。</p><label>登录邮箱</label><input value={email} readOnly aria-label="登录邮箱"/><label>希望怎么称呼你</label><input value={nickname} onChange={(event) => setNickname(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && nickname.trim()) onSubmit(nickname.trim()); }} autoFocus placeholder="你的昵称" maxLength={30}/><Button disabled={busy || !nickname.trim()} onClick={() => onSubmit(nickname.trim())}>{busy ? "正在创建…" : "进入我的空间"}</Button><small>不同账号的数据会完全分开保存。</small></section></main>;
}
function WelcomeOverlay({ nickname }: { nickname: string }) { return <div className="welcome-overlay"><div><span className="welcome-wave">👋</span><h1>你好，{nickname}</h1><p>从今天开始，把属于你的成长留在这里。</p></div></div>; }

function CaptureComposer({ value, setValue, submit }: { value: string; setValue: (value: string) => void; submit: () => void }) {
  return <div className="capture-composer"><Textarea aria-label="快速记录" enterKeyHint="send" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} placeholder="写下任务、想法、计划、记录……"/><span className="composer-hint">Enter 记录 · Shift + Enter 换行</span></div>;
}

function TodayView({ state, clock, localDate, tasks, captures, completed, captureText, setCaptureText, submitCapture, toggleTask, openTask, setView, repeatNotice, dismissRepeat, createProject }: { state: AppState; clock: Date | null; localDate: string; tasks: Task[]; captures: Capture[]; completed: number; captureText: string; setCaptureText: (value: string) => void; submitCapture: () => void; toggleTask: (task: Task, checked: boolean) => void; openTask: (task: Task) => void; setView: (view: View) => void; repeatNotice: RepeatNotice | null; dismissRepeat: () => void; createProject: (topic: string) => void }) {
  const needsRethink = tasks.filter((task) => task.status === "open" && task.carryCount >= 3);
  return <div className="today-layout"><section className="today-main"><div className="eyebrow">{dateLabel(clock)}</div><h1>想要记点什么？</h1><CaptureComposer value={captureText} setValue={setCaptureText} submit={submitCapture}/>
    {!state.captures.length && <div className="first-memory"><span>✦</span><p>请记下第一个属于你的记忆吧。</p></div>}
    {repeatNotice && <div className="repeat-notice"><Sparkles/><div><strong>这是你第 {repeatNotice.count} 次提到「{repeatNotice.topic}」</strong><p>它可能已经不只是一个想法。可以继续作为 Explore，也可以正式开始一个 Project。</p><div><button onClick={() => { setView("capture"); dismissRepeat(); }}>保留为 Explore</button><button onClick={() => createProject(repeatNotice.topic)}>创建 Project</button><button className="quiet" onClick={dismissRepeat}>稍后再说</button></div></div></div>}
    {needsRethink.length > 0 && <div className="rethink-alert"><Clock3/><div><strong>{needsRethink.length} 项任务已顺延至少 3 次</strong><p>不一定要继续背着它们。点开任务，重新判断：缩小、延期，或放下。</p></div></div>}
    <div className="section-heading"><div><span>TODAY</span><h2>今天，把重要的事往前推一点</h2></div><span className="completion-pill">{completed}/{tasks.length} 完成</span></div>
    {!tasks.length && <div className="empty-card"><strong>今天还没有计划</strong><p>写下第一件想做的事，按 Enter 就会保存。</p></div>}
    {(["must", "suggested", "optional"] as const).map((tier) => <TaskGroup key={tier} tier={tier} tasks={tasks.filter((task) => task.tier === tier)} toggle={toggleTask} open={openTask}/>) }
  </section><aside className="today-aside"><div className="aside-card focus-card"><div className="mini-label">正在推进</div>{state.projects.filter((project) => project.status === "focus").slice(0, 3).map((project) => <button key={project.id} onClick={() => setView("projects")}><div className={`accent-dot ${project.accent}`}/><div><strong>{project.title}</strong><span>{project.nextStep}</span></div><ChevronRight/></button>)}{!state.projects.length && <p className="aside-empty">当一件事值得持续推进时，它会出现在这里。</p>}</div>
    <div className="aside-card"><div className="mini-label">今天的记录</div>{captures.slice(0, 4).map((item) => <div className="mini-capture" key={item.id}><span>{shortTime(item.createdAt)}</span><p>{item.body}</p></div>)}{!captures.length && <p className="aside-empty">今天的原话会安静地留在这里。</p>}</div>
    <button className="review-invite" onClick={() => setView("review")}><div><span>DAILY REVIEW · {localDate}</span><strong>今晚只需要一分钟</strong><p>复盘会随真实日期单独保存。</p></div><ChevronRight/></button>
  </aside></div>;
}

function TaskGroup({ tier, tasks, toggle, open }: { tier: string; tasks: Task[]; toggle: (task: Task, checked: boolean) => void; open: (task: Task) => void }) {
  if (!tasks.length) return null;
  return <section className={`task-group ${tier}`}><div className="task-group-title"><span>{tierLabels[tier]}</span>{tier === "must" && <em>优先保留精力</em>}</div>{tasks.map((task) => <div className={`task-row ${task.status === "done" ? "done" : ""} ${task.carryCount >= 3 ? "needs-rethink" : ""}`} key={task.id}><Checkbox checked={task.status === "done"} onCheckedChange={(value) => toggle(task, Boolean(value))} aria-label={`完成 ${task.title}`}/><button className="task-copy" onClick={() => open(task)}><strong>{task.title}</strong>{task.progressText && <span>{task.progressText}</span>}{task.carryCount > 0 && <small><Clock3/> 已顺延 {task.carryCount} 次{task.carryCount >= 3 ? " · 请重新判断" : ""}</small>}</button><button className="more" onClick={() => open(task)} aria-label="更新任务进度"><MoreHorizontal/></button></div>)}</section>;
}

function CaptureView({ state, captureText, setCaptureText, submitCapture, updateCategory }: { state: AppState; captureText: string; setCaptureText: (value: string) => void; submitCapture: () => void; updateCategory: (capture: Capture, category: string) => void }) {
  return <section className="single-page"><div className="page-intro"><span className="eyebrow">CAPTURE</span><h1>先记下来，再慢慢想。</h1><p>你的原话会一直保留。分类只是系统建议，判断不准时不会偷偷塞进 Idea。</p></div><CaptureComposer value={captureText} setValue={setCaptureText} submit={submitCapture}/>{!state.captures.length && <div className="empty-card capture-empty"><strong>请记下第一个属于你的记忆吧。</strong><p>任务、想法、探索、经历或学到的东西，都可以直接写。</p></div>}<div className="capture-grid">{state.captures.map((item) => <article className="capture-card" key={item.id}><div className="capture-meta"><select className={`category ${categoryColors[item.category] || "neutral"}`} value={item.category === "正在判断" ? "暂未分类" : item.category} onChange={(event) => updateCategory(item, event.target.value)} aria-label="修改分类">{editableCategories.map((category) => <option key={category}>{category}</option>)}</select>{item.topic && <span>#{item.topic}</span>}<span>{item.confidence ? `${item.confidence}% 判断` : item.category === "正在判断" ? "等待同步" : "需要你判断"}</span></div><p>{item.body}</p><time>{shortDate(item.createdAt)} · {shortTime(item.createdAt)}</time></article>)}</div></section>;
}

function ProjectsView({ projects, selectedProject, events, tasks, select, openProgress, openNew }: { projects: Project[]; selectedProject?: Project; events: AppState["progressEvents"]; tasks: Task[]; select: (id: string) => void; openProgress: () => void; openNew: () => void }) {
  return <section className="projects-page"><header className="projects-header"><div><span className="eyebrow">PROJECTS</span><h1>我正在推进什么</h1></div><Button onClick={openNew}><Plus/>New Project</Button></header>{!selectedProject ? <div className="empty-card large-empty"><strong>还没有 Project</strong><p>当一个主题值得持续行动时，在这里给它一个清楚的“现在”和“下一步”。</p><Button onClick={openNew}>开始第一个项目</Button></div> : <div className="project-workspace"><aside className="project-list"><div className="mini-label">FOCUS · 建议不超过 5 个</div>{projects.map((project) => <button key={project.id} onClick={() => select(project.id)} className={selectedProject.id === project.id ? "active" : ""}><div className={`project-swatch ${project.accent}`}/><div><strong>{project.title}</strong><span>{project.status === "focus" ? "Focus" : "Active"}</span></div><ChevronRight/></button>)}</aside><ProjectDetail project={selectedProject} events={events} tasks={tasks} openProgress={openProgress}/></div>}</section>;
}
function ProjectDetail({ project, events, tasks, openProgress }: { project: Project; events: AppState["progressEvents"]; tasks: Task[]; openProgress: () => void }) {
  return <article className="project-detail"><div className={`project-hero ${project.accent}`}><div><span>{project.status === "focus" ? "FOCUS PROJECT" : "ACTIVE PROJECT"}</span><h2>{project.title}</h2><p>{project.why || "给这个项目写下一句为什么，它会在困难的时候提醒你。"}</p></div><Button onClick={openProgress}>更新进度</Button></div><div className="status-grid"><div><span>当前状态</span><strong>{project.currentState}</strong><small>更新于 {shortDate(project.updatedAt)}</small></div><div><span>下一步</span><strong>{project.nextStep}</strong><small>只做一个清楚的行动</small></div></div><section className="detail-section"><div className="detail-title"><h3>Progress</h3><span>从最开始到现在</span></div><div className="timeline">{events.map((item, index) => <div className="timeline-item" key={item.id}><span className={index === 0 ? "active" : ""}/><time>{shortDate(item.createdAt)}</time><p>{item.body}</p></div>)}{!events.length && <p className="aside-empty">第一次推进后，时间线会从这里开始。</p>}</div></section><section className="detail-section"><div className="detail-title"><h3>相关任务</h3><span>{tasks.filter((task) => task.status === "done").length}/{tasks.length}</span></div>{tasks.map((task) => <div className="linked-task" key={task.id}><span className={task.status === "done" ? "checked" : ""}>{task.status === "done" && <Check/>}</span><p>{task.title}</p></div>)}{!tasks.length && <p className="aside-empty">还没有关联任务。</p>}</section></article>;
}

function ReviewView({ state, clock, save }: { state: AppState; clock: Date; save: (kind: string, label: string, reflection: string) => Promise<Record<string, unknown>> }) {
  const [kind, setKind] = useState("daily");
  return <section className="single-page review-page"><div className="page-intro"><span className="eyebrow">REVIEW</span><h1>看看你是怎么走到这里的</h1><p>不是为了给生活打分，而是看见真实发生的变化。每个周期都只统计属于它的记录。</p></div><Tabs value={kind} onValueChange={setKind}><TabsList className="review-tabs"><TabsTrigger value="daily">Daily</TabsTrigger><TabsTrigger value="weekly">Weekly</TabsTrigger><TabsTrigger value="monthly">Monthly</TabsTrigger><TabsTrigger value="yearly">Yearly</TabsTrigger></TabsList>{["daily", "weekly", "monthly", "yearly"].map((value) => <TabsContent key={value} value={value}><ReviewPeriod kind={value} state={state} clock={clock} save={save}/></TabsContent>)}</Tabs></section>;
}
function ReviewPeriod({ kind, state, clock, save }: { kind: string; state: AppState; clock: Date; save: (kind: string, label: string, reflection: string) => Promise<Record<string, unknown>> }) {
  const label = periodLabel(kind, clock);
  const saved = state.reviews.find((item) => item.periodKind === kind && item.periodLabel === label)?.reflection ?? "";
  const [reflection, setReflection] = useState(saved);
  useEffect(() => setReflection(saved), [saved, kind, label]);
  const tasks = state.tasks.filter((task) => inPeriod(task.completedAt, kind, clock));
  const captures = state.captures.filter((item) => inPeriod(item.createdAt, kind, clock));
  const events = state.progressEvents.filter((item) => inPeriod(item.createdAt, kind, clock));
  const knowledge = captures.filter((item) => item.category === "Knowledge" || item.category === "Knowledge Candidate");
  const advanced = new Set(events.map((item) => item.projectId));
  const names: Record<string, string> = { daily: "今天", weekly: "这一周", monthly: "这个月", yearly: "这一年" };
  const repeated = useMemo(() => { const counts = new Map<string, number>(); captures.forEach((item) => item.topic && counts.set(item.topic, (counts.get(item.topic) || 0) + 1)); return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]; }, [captures]);
  const summary = captures.length || tasks.length || events.length ? `${names[kind]}完成 ${tasks.length} 项任务，留下 ${captures.length} 条记录，${advanced.size} 个项目有真实推进。` : `${names[kind]}还没有留下内容。等你开始记录，这里会自然长出来。`;
  const handleSave = async () => { await save(kind, label, reflection); toast.success("复盘已保存"); };
  return <div className="review-surface"><header><span>基于你的真实记录 · {label}</span><h2>{names[kind]}</h2><p>{summary}</p></header><div className="review-metrics"><div className="metric pink"><span>完成任务</span><strong>{tasks.length}</strong><small>只统计这个周期</small></div><div className="metric yellow"><span>推进项目</span><strong>{advanced.size}</strong><small>来自真实进度时间线</small></div><div className="metric blue"><span>知识候选</span><strong>{knowledge.length}</strong><small>来自正常学习过程</small></div></div><div className="review-columns"><section><div className="detail-title"><h3>真正发生的变化</h3></div>{events.slice(0, 6).map((item) => <div className="review-line" key={item.id}><Target/><div><strong>{state.projects.find((project) => project.id === item.projectId)?.title ?? "项目"}</strong><p>{item.body}</p></div></div>)}{!events.length && <p className="aside-empty">还没有项目推进记录。</p>}</section><section><div className="detail-title"><h3>属于你的复盘</h3></div><Textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="还有什么想留给这段时间？"/><Button onClick={handleSave}>保存复盘</Button></section></div>{repeated && repeated[1] >= 3 && <div className="ai-note"><Sparkles/><div><strong>值得留意</strong><p>「{repeated[0]}」已经出现 {repeated[1]} 次。反复出现的方向，可能正在变成真正重要的事。</p></div></div>}</div>;
}
