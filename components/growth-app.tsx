"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, Check, ChevronRight, Clock3, FolderKanban, Menu, MoreHorizontal, Plus, Sparkles, Target } from "lucide-react";
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
import { applyLocalAction, loadLocalState, saveLocalState, type LocalAction } from "@/lib/local-store";

type View = "today" | "capture" | "projects" | "review";
type RepeatNotice = { topic: string; count: number; captureId?: string; suggestion: "Explore" | "Project" };

const emptyState: AppState = { profile: null, projects: [], tasks: [], captures: [], progressEvents: [], skills: [], reviews: [], localDate: "", syncedAt: "" };
const nav = [
  { id: "today" as View, label: "今日待办", icon: CalendarDays },
  { id: "capture" as View, label: "记录", icon: Plus },
  { id: "projects" as View, label: "项目", icon: FolderKanban },
  { id: "review" as View, label: "复盘", icon: BookOpen },
];
const tierLabels: Record<string, string> = { must: "必须做", suggested: "建议做", optional: "有空可以做" };
const categoryColors: Record<string, string> = { Task: "yellow", Idea: "pink", Explore: "blue", Moment: "pink", Knowledge: "blue" };
const categoryOptions = [
  { value: "Task", label: "Task · 具体任务", description: "有清楚的完成动作，可以勾选" },
  { value: "Idea", label: "Idea · 一个想法", description: "觉得可能不错，但还没决定要做" },
  { value: "Explore", label: "Explore · 想继续了解", description: "想研究、学习或弄懂一个问题" },
  { value: "Moment", label: "Moment · 经历或感受", description: "今天发生的事，或当下的感受" },
  { value: "Knowledge", label: "Knowledge · 已形成认知", description: "已经理解、学会或总结出的结论" },
];
const categoryName = (value: string) => categoryOptions.find((item) => item.value === value)?.label ?? value;
const confidenceHint = (capture: Capture) => {
  if (!capture.category || capture.confidence < 0.55) return "不太确定，请选择类型";
  if (capture.confidence < 0.8) return `已识别为 ${capture.category}，可修改`;
  return capture.secondaryType ? `主类型 ${capture.category} · 次类型 ${capture.secondaryType}` : "已自动分类 · 可随时修改";
};

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

export function GrowthApp() {
  const [view, setView] = useState<View>("today");
  const [state, setState] = useState<AppState>(emptyState);
  const [ready, setReady] = useState(false);
  const [clock, setClock] = useState<Date | null>(null);
  const [localDate, setLocalDate] = useState("");
  const [captureText, setCaptureText] = useState("");
  const [syncing, setSyncing] = useState(true);
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

  const runAction = useCallback(async (item: LocalAction) => {
    const prepared = { ...item, payload: { ...item.payload, localDate: localDate || localDateKey() } };
    setSyncing(true);
    try {
      const data = applyLocalAction(state, prepared);
      saveLocalState(data.state);
      setState(data.state);
      return data.meta;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
      return {};
    } finally { setSyncing(false); }
  }, [localDate, state]);

  useEffect(() => {
    const initial = new Date(); const initialKey = localDateKey(initial);
    const next = loadLocalState(initialKey);
    saveLocalState(next);
    setClock(initial); setLocalDate(initialKey); setState(next);
    setSelectedProjectId(next.projects[0]?.id || "");
    setSyncing(false); setReady(true);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const checkDate = () => {
      const next = new Date(); const nextKey = localDateKey(next); setClock(next);
      setLocalDate((current) => {
        if (current && current !== nextKey) {
          const refreshed = loadLocalState(nextKey);
          saveLocalState(refreshed);
          setState(refreshed);
        }
        return nextKey;
      });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") checkDate(); };
    const timer = window.setInterval(checkDate, 60_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const todayTasks = state.tasks.filter((task) => task.dueDate === localDate);
  const todayCaptures = state.captures.filter((item) => sameLocalDay(item.createdAt, localDate));
  const completed = todayTasks.filter((task) => task.status === "done").length;
  const selectedProject = state.projects.find((project) => project.id === selectedProjectId) ?? state.projects[0];
  const selectedEvents = state.progressEvents.filter((event) => event.projectId === selectedProject?.id);
  const projectTasks = state.tasks.filter((task) => task.projectId === selectedProject?.id);

  const submitCapture = async () => {
    const body = captureText.trim(); if (!body) return; setCaptureText("");
    const meta = await runAction({ action: "capture", payload: { body } });
    const classification = meta.classification as { primary_type?: string | null; secondary_type?: string; topic?: string; confidence?: number; reason?: string } | undefined;
    if (meta.repeated && classification?.topic) setRepeatNotice({ topic: classification.topic, count: Number(meta.mentionCount ?? 3), captureId: String(meta.captureId ?? ""), suggestion: meta.repeatSuggestion === "Project" ? "Project" : "Explore" });
    if (meta.firstCapture) toast.success("以后你只需要写，整理交给我。");
    if (!classification?.primary_type || Number(classification.confidence ?? 0) < 0.55) toast.info("我不太确定这条记录的类型，请选择一下。");
    else if (Number(classification.confidence ?? 0) < 0.8) toast.info(`已识别为 ${categoryName(classification.primary_type)}，可修改`);
    else toast.success(`已记录 · ${categoryName(classification.primary_type)}`);
  };
  const toggleTask = (task: Task, checked: boolean) => runAction({ action: "updateTask", payload: { id: task.id, status: checked ? "done" : "open", progressText: task.progressText } });
  const openTask = (task: Task) => { setTaskSheet(task); setTaskProgress(task.progressText); };
  const saveTaskProgress = async () => { if (!taskSheet) return; await runAction({ action: "updateTask", payload: { id: taskSheet.id, status: taskSheet.status, progressText: taskProgress } }); setTaskSheet(null); toast.success("进度已更新"); };
  const updateCategory = async (capture: Capture, category: string) => {
    await runAction({ action: "updateCaptureCategory", payload: { id: capture.id, category } });
    toast.success(`已设为 ${categoryName(category)}`);
  };
  const classifyRepeatedTopic = async (category: "Idea" | "Explore") => {
    const capture = state.captures.find((item) => item.id === repeatNotice?.captureId);
    if (capture) await updateCategory(capture, category);
    setRepeatNotice(null);
    setView("capture");
  };
  const saveProgress = async () => { if (!selectedProject || !progressText.trim()) return; await runAction({ action: "addProgress", payload: { projectId: selectedProject.id, body: progressText, nextStep } }); setProgressText(""); setNextStep(""); setProgressOpen(false); toast.success("这一步已经进入项目时间线"); };
  const createProject = async () => { if (!newProject.title.trim()) return; const meta = await runAction({ action: "createProject", payload: newProject }); if (meta.projectId) setSelectedProjectId(String(meta.projectId)); setNewProject({ title: "", why: "", nextStep: "" }); setNewProjectOpen(false); setRepeatNotice(null); setView("projects"); toast.success("项目已建立"); };
  const addProjectStepToToday = async () => {
    if (!selectedProject?.nextStep.trim()) return;
    const meta = await runAction({ action: "createTask", payload: { title: selectedProject.nextStep, projectId: selectedProject.id, dueDate: localDate } });
    toast.success(meta.existed ? "这项 Task 已经在 Today 里" : "已把这一步加入 Today");
  };
  const startProjectFromTopic = (topic: string) => { setNewProject({ title: `完成「${topic}」的第一个成果`, why: `这是我反复提到的主题：${topic}`, nextStep: "写下第一个最小行动" }); setNewProjectOpen(true); };
  const register = async (nickname: string) => {
    await runAction({ action: "registerProfile", payload: { nickname } });
    setWelcomeName(nickname); window.setTimeout(() => setWelcomeName(null), 1350);
  };

  if (!ready) return <div className="app-loading"><div className="brand-mark">向</div><p>正在打开你的空间…</p></div>;
  if (!state.profile) return <><Onboarding busy={syncing} onSubmit={register}/><Toaster position="top-center" richColors/></>;

  return <SidebarProvider style={{ "--sidebar-width": "15.5rem" } as React.CSSProperties}>
    {welcomeName && <WelcomeOverlay nickname={welcomeName}/>}
    <Sidebar collapsible="offcanvas" className="growth-sidebar">
      <SidebarHeader className="brand-wrap"><div className="brand-mark">向</div><div><strong>向前</strong><span>把成长留在日常里</span></div></SidebarHeader>
      <SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{nav.map((item) => <SidebarMenuItem key={item.id}><SidebarMenuButton asChild isActive={view === item.id} className="growth-nav"><button onClick={() => setView(item.id)}><item.icon/><span>{item.label}</span></button></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="account-foot"><div className="account-copy"><strong>{state.profile.nickname}</strong><span>个人成长空间</span></div><div className="sync-status"><div className="sync-dot"/><span>{syncing ? "正在保存" : "已自动保存在本机"}</span></div></SidebarFooter>
    </Sidebar>
    <SidebarInset className="growth-shell">
      <header className="mobile-header"><SidebarTrigger><Menu/></SidebarTrigger><span>向前</span><div className="sync-dot"/></header>
      <main className="workspace">
        {view === "today" && <TodayView state={state} clock={clock} localDate={localDate} tasks={todayTasks} captures={todayCaptures} completed={completed} captureText={captureText} setCaptureText={setCaptureText} submitCapture={submitCapture} toggleTask={toggleTask} openTask={openTask} setView={setView} repeatNotice={repeatNotice} dismissRepeat={() => setRepeatNotice(null)} classifyRepeatedTopic={classifyRepeatedTopic} createProject={startProjectFromTopic}/>}
        {view === "capture" && <CaptureView state={state} captureText={captureText} setCaptureText={setCaptureText} submitCapture={submitCapture} updateCategory={updateCategory}/>}
        {view === "projects" && <ProjectsView projects={state.projects} selectedProject={selectedProject} events={selectedEvents} tasks={projectTasks} select={setSelectedProjectId} openProgress={() => setProgressOpen(true)} openNew={() => setNewProjectOpen(true)} addStepToToday={addProjectStepToToday}/>}
        {view === "review" && <ReviewView state={state} clock={clock ?? new Date()} save={(kind, label, reflection) => runAction({ action: "saveReview", payload: { periodKind: kind, periodLabel: label, reflection } })}/>}
      </main>
      <nav className="bottom-nav" aria-label="主导航">{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><item.icon/><span>{item.label}</span></button>)}</nav>
    </SidebarInset>
    <Sheet open={Boolean(taskSheet)} onOpenChange={(open) => !open && setTaskSheet(null)}><SheetContent className="task-sheet"><SheetHeader><SheetTitle>{taskSheet?.title}</SheetTitle><SheetDescription>写一句当前做到哪里；它会留在任务与项目轨迹里。</SheetDescription></SheetHeader><div className="sheet-body"><label>当前进度</label><Textarea value={taskProgress} onChange={(event) => setTaskProgress(event.target.value)} placeholder="例如：资料已经找完，正文写到第二部分"/><Button onClick={saveTaskProgress}>保存进度</Button></div></SheetContent></Sheet>
    <Dialog open={progressOpen} onOpenChange={setProgressOpen}><DialogContent className="soft-dialog"><DialogHeader><DialogTitle>更新「{selectedProject?.title}」</DialogTitle><DialogDescription>用一句真实的话记录这次推进，不需要估算百分比。</DialogDescription></DialogHeader><label>现在做到哪里</label><Textarea value={progressText} onChange={(event) => setProgressText(event.target.value)} placeholder="例如：三个作品已经整理完两个"/><label>下一步（可选）</label><Textarea value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder={selectedProject?.nextStep}/><DialogFooter><Button onClick={saveProgress}>加入进度时间线</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}><DialogContent className="soft-dialog"><DialogHeader><DialogTitle>开始一个 Project</DialogTitle><DialogDescription>只有当你已经决定做出一个结果，而且需要多天、多步完成时，它才是 Project。还没决定的先留在 Idea 或 Explore。</DialogDescription></DialogHeader><label>想做成什么结果</label><input value={newProject.title} onChange={(event) => setNewProject({ ...newProject, title: event.target.value })} placeholder="例如：完成一套摄影基础作品"/><label>为什么想做</label><Textarea value={newProject.why} onChange={(event) => setNewProject({ ...newProject, why: event.target.value })}/><label>Plan · 最先做哪一步</label><input value={newProject.nextStep} onChange={(event) => setNewProject({ ...newProject, nextStep: event.target.value })} placeholder="例如：先列出三个拍摄主题"/><DialogFooter><Button onClick={createProject}>创建 Project</Button></DialogFooter></DialogContent></Dialog>
    <Toaster position="top-center" richColors/>
  </SidebarProvider>;
}

function Onboarding({ busy, onSubmit }: { busy: boolean; onSubmit: (nickname: string) => void }) {
  const [nickname, setNickname] = useState("");
  return <main className="onboarding"><section className="auth-card"><div className="brand-mark">向</div><span className="eyebrow">WELCOME TO 向前</span><h1>先认识一下你。</h1><p>设置一个昵称，开始记录任务、想法、项目和成长轨迹。</p><label>希望怎么称呼你</label><input value={nickname} onChange={(event) => setNickname(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && nickname.trim()) onSubmit(nickname.trim()); }} autoFocus placeholder="你的昵称" maxLength={30}/><Button disabled={busy || !nickname.trim()} onClick={() => onSubmit(nickname.trim())}>{busy ? "正在创建…" : "进入我的空间"}</Button><small>数据仅保存在当前浏览器，不会上传到服务器。</small></section></main>;
}
function WelcomeOverlay({ nickname }: { nickname: string }) { return <div className="welcome-overlay"><div><span className="welcome-wave">👋</span><h1>你好，{nickname}</h1><p>从今天开始，把属于你的成长留在这里。</p></div></div>; }

function CaptureComposer({ value, setValue, submit }: { value: string; setValue: (value: string) => void; submit: () => void }) {
  return <div className="capture-composer"><Textarea aria-label="快速记录" enterKeyHint="send" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} placeholder="写下一个任务、想法、想了解的事，或今天的感受……"/><span className="composer-hint">Enter 记录 · Shift + Enter 换行</span></div>;
}

function TodayView({ state, clock, localDate, tasks, captures, completed, captureText, setCaptureText, submitCapture, toggleTask, openTask, setView, repeatNotice, dismissRepeat, classifyRepeatedTopic, createProject }: { state: AppState; clock: Date | null; localDate: string; tasks: Task[]; captures: Capture[]; completed: number; captureText: string; setCaptureText: (value: string) => void; submitCapture: () => void; toggleTask: (task: Task, checked: boolean) => void; openTask: (task: Task) => void; setView: (view: View) => void; repeatNotice: RepeatNotice | null; dismissRepeat: () => void; classifyRepeatedTopic: (category: "Idea" | "Explore") => void; createProject: (topic: string) => void }) {
  const needsRethink = tasks.filter((task) => task.status === "open" && task.carryCount >= 3);
  return <div className="today-layout"><section className="today-main"><div className="eyebrow">{dateLabel(clock)}</div><h1>想要记点什么？</h1><CaptureComposer value={captureText} setValue={setCaptureText} submit={submitCapture}/>
    {!state.captures.length && <div className="first-memory"><span>✦</span><p>请记下第一个属于你的记忆吧。</p></div>}
    {repeatNotice && <div className="repeat-notice"><Sparkles/><div><strong>这是你第 {repeatNotice.count} 次提到「{repeatNotice.topic}」</strong><p>{repeatNotice.suggestion === "Project" ? "这个主题里已经出现过明确行动，建议把它整理成长期 Project。" : "这个主题反复出现了，建议先转为 Explore；如果已经决定做出成果，也可以建立 Project。"}</p><div><button onClick={() => classifyRepeatedTopic("Idea")}>继续作为 Idea</button><button onClick={() => classifyRepeatedTopic("Explore")}>转为 Explore</button><button onClick={() => createProject(repeatNotice.topic)}>创建 Project</button><button className="quiet" onClick={dismissRepeat}>稍后再说</button></div></div></div>}
    {needsRethink.length > 0 && <div className="rethink-alert"><Clock3/><div><strong>{needsRethink.length} 项任务已顺延至少 3 次</strong><p>不一定要继续背着它们。点开任务，重新判断：缩小、延期，或放下。</p></div></div>}
    <div className="section-heading"><div><span>TODAY · 每日 TODO LIST</span><h2>今天要执行的 Task</h2><p>Today 不是一种分类，它只是把安排在今天的 Task 放在一起。</p></div><span className="completion-pill">{completed}/{tasks.length} 完成</span></div>
    {!tasks.length && <div className="empty-card"><strong>今天还没有 Task</strong><p>写下一个有明确完成动作的待办，按 Enter 保存后就会出现在这里。</p></div>}
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
  return <section className="single-page"><div className="page-intro"><span className="eyebrow">CAPTURE · 原话收集箱</span><h1>先记下来，再判断它是什么。</h1><p>这里判断的是一条记录现在的性质，不是在选择它属于哪个 Project。系统只会给建议，你可以随时修改。</p></div><CaptureComposer value={captureText} setValue={setCaptureText} submit={submitCapture}/><ClassificationGuide/>{!state.captures.length && <div className="empty-card capture-empty"><strong>请记下第一个属于你的记忆吧。</strong><p>任务、想法、探索、经历或学到的东西，都可以直接写。</p></div>}<div className="capture-grid">{state.captures.map((item) => <article className="capture-card" key={item.id}><div className="capture-meta"><select className={`category ${categoryColors[item.category] || "neutral"}`} value={item.category} onChange={(event) => updateCategory(item, event.target.value)} aria-label="修改分类"><option value="" disabled>选择类型</option>{categoryOptions.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select>{item.topic && <span>#{item.topic}</span>}<span>{confidenceHint(item)}</span></div><p>{item.body}</p>{item.reason && <small className="classification-reason">{item.reason}</small>}<time>{shortDate(item.createdAt)} · {shortTime(item.createdAt)}</time></article>)}</div></section>;
}

function ClassificationGuide() {
  return <section className="classification-guide"><header><div><span className="mini-label">快速记录只分这五类</span><h2>先看它现在是什么</h2></div><small>Project 和 Plan 不在这里分类</small></header><div className="classification-grid">{categoryOptions.slice(0, 5).map((item) => <div key={item.value}><strong>{item.label}</strong><p>{item.description}</p></div>)}</div><div className="hierarchy-note"><strong>Project / Plan 去哪里？</strong><p><b>Project</b> 是你已经决定做成、需要多步完成的结果；<b>Plan</b> 是 Project 里面的行动路线；真正放进每日 Todo List 的，仍然是具体的 <b>Task</b>。</p></div></section>;
}

function ProjectsView({ projects, selectedProject, events, tasks, select, openProgress, openNew, addStepToToday }: { projects: Project[]; selectedProject?: Project; events: AppState["progressEvents"]; tasks: Task[]; select: (id: string) => void; openProgress: () => void; openNew: () => void; addStepToToday: () => void }) {
  return <section className="projects-page"><header className="projects-header"><div><span className="eyebrow">PROJECTS · 需要持续推进的成果</span><h1>我决定做成什么</h1><p>Project 不是记录分类。只有当你愿意投入多天、多步，去完成一个明确结果时，才在这里建立它。</p></div><Button onClick={openNew}><Plus/>新建 Project</Button></header><div className="project-flow" aria-label="项目层级"><span><b>Project</b> 想做成的结果</span><i>→</i><span><b>Plan</b> 完成它的路线</span><i>→</i><span><b>Task</b> 可以勾选的行动</span><i>→</i><span><b>Today</b> 今天要做的 Task</span></div>{!selectedProject ? <div className="empty-card large-empty"><strong>还没有 Project</strong><p>还没决定做的先留在 Idea；想了解的先放进 Explore。确定要做成一个结果时，再建立 Project。</p><Button onClick={openNew}>开始第一个 Project</Button></div> : <div className="project-workspace"><aside className="project-list"><div className="mini-label">FOCUS · 建议不超过 5 个</div>{projects.map((project) => <button key={project.id} onClick={() => select(project.id)} className={selectedProject.id === project.id ? "active" : ""}><div className={`project-swatch ${project.accent}`}/><div><strong>{project.title}</strong><span>{project.status === "focus" ? "Focus" : "Active"}</span></div><ChevronRight/></button>)}</aside><ProjectDetail project={selectedProject} events={events} tasks={tasks} openProgress={openProgress} addStepToToday={addStepToToday}/></div>}</section>;
}
function ProjectDetail({ project, events, tasks, openProgress, addStepToToday }: { project: Project; events: AppState["progressEvents"]; tasks: Task[]; openProgress: () => void; addStepToToday: () => void }) {
  return <article className="project-detail"><div className={`project-hero ${project.accent}`}><div><span>{project.status === "focus" ? "FOCUS PROJECT" : "ACTIVE PROJECT"}</span><h2>{project.title}</h2><p>{project.why || "给这个项目写下一句为什么，它会在困难的时候提醒你。"}</p></div><Button onClick={openProgress}>更新进度</Button></div><div className="status-grid"><div><span>项目现状</span><strong>{project.currentState}</strong><small>更新于 {shortDate(project.updatedAt)}</small></div><div><span>PLAN · 当前下一步</span><strong>{project.nextStep}</strong><small>计划负责指路，执行时再拆成 Task</small><button className="plan-to-task" onClick={addStepToToday}>把这一步加入 Today</button></div></div><section className="detail-section"><div className="detail-title"><h3>Progress · 推进记录</h3><span>从最开始到现在</span></div><div className="timeline">{events.map((item, index) => <div className="timeline-item" key={item.id}><span className={index === 0 ? "active" : ""}/><time>{shortDate(item.createdAt)}</time><p>{item.body}</p></div>)}{!events.length && <p className="aside-empty">第一次推进后，时间线会从这里开始。</p>}</div></section><section className="detail-section"><div className="detail-title"><h3>Task · 具体行动</h3><span>{tasks.filter((task) => task.status === "done").length}/{tasks.length}</span></div>{tasks.map((task) => <div className="linked-task" key={task.id}><span className={task.status === "done" ? "checked" : ""}>{task.status === "done" && <Check/>}</span><p>{task.title}</p></div>)}{!tasks.length && <p className="aside-empty">还没有关联 Task。把计划拆成可以勾选的具体行动后，它们会出现在这里。</p>}</section></article>;
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
  const knowledge = captures.filter((item) => item.category === "Knowledge");
  const advanced = new Set(events.map((item) => item.projectId));
  const names: Record<string, string> = { daily: "今天", weekly: "这一周", monthly: "这个月", yearly: "这一年" };
  const repeated = useMemo(() => { const counts = new Map<string, number>(); captures.forEach((item) => item.topic && counts.set(item.topic, (counts.get(item.topic) || 0) + 1)); return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]; }, [captures]);
  const summary = captures.length || tasks.length || events.length ? `${names[kind]}完成 ${tasks.length} 项任务，留下 ${captures.length} 条记录，${advanced.size} 个项目有真实推进。` : `${names[kind]}还没有留下内容。等你开始记录，这里会自然长出来。`;
  const handleSave = async () => { await save(kind, label, reflection); toast.success("复盘已保存"); };
  return <div className="review-surface"><header><span>基于你的真实记录 · {label}</span><h2>{names[kind]}</h2><p>{summary}</p></header><div className="review-metrics"><div className="metric pink"><span>完成任务</span><strong>{tasks.length}</strong><small>只统计这个周期</small></div><div className="metric yellow"><span>推进项目</span><strong>{advanced.size}</strong><small>来自真实进度时间线</small></div><div className="metric blue"><span>知识候选</span><strong>{knowledge.length}</strong><small>来自正常学习过程</small></div></div><div className="review-columns"><section><div className="detail-title"><h3>真正发生的变化</h3></div>{events.slice(0, 6).map((item) => <div className="review-line" key={item.id}><Target/><div><strong>{state.projects.find((project) => project.id === item.projectId)?.title ?? "项目"}</strong><p>{item.body}</p></div></div>)}{!events.length && <p className="aside-empty">还没有项目推进记录。</p>}</section><section><div className="detail-title"><h3>属于你的复盘</h3></div><Textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="还有什么想留给这段时间？"/><Button onClick={handleSave}>保存复盘</Button></section></div>{repeated && repeated[1] >= 3 && <div className="ai-note"><Sparkles/><div><strong>值得留意</strong><p>「{repeated[0]}」已经出现 {repeated[1]} 次。反复出现的方向，可能正在变成真正重要的事。</p></div></div>}</div>;
}
