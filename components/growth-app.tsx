"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {ArrowUp,BookOpen,CalendarDays,Check,ChevronRight,Clock3,FolderKanban,Lightbulb,Menu,MoreHorizontal,Plus,Sparkles,Target,WifiOff} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/checkbox";
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle} from "@/components/ui/sheet";
import {Sidebar,SidebarContent,SidebarFooter,SidebarGroup,SidebarGroupContent,SidebarHeader,SidebarInset,SidebarMenu,SidebarMenuButton,SidebarMenuItem,SidebarProvider,SidebarTrigger} from "@/components/ui/sidebar";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {Textarea} from "@/components/ui/textarea";
import {Toaster} from "@/components/ui/sonner";
import type {AppState,Capture,Project,Task} from "@/lib/data";

type View="today"|"capture"|"projects"|"review";
type QueuedAction={action:string;payload:Record<string,unknown>};

const now="2026-10-08T08:00:00.000Z";
const fallback:AppState={
  projects:[
    {id:"project-site",title:"个人网站",why:"把自己的项目、技能与个人特色完整地展示出来。",currentState:"主页结构已完成，正在整理作品区",nextStep:"整理 3 个最值得展示的作品",status:"focus",accent:"pink",updatedAt:now},
    {id:"project-or",title:"运筹学",why:"真正理解方法，而不只是完成作业。",currentState:"两阶段法已经理解，第三题还需要推导",nextStep:"完成第三题并写下解题思路",status:"focus",accent:"yellow",updatedAt:now},
    {id:"project-photo",title:"摄影学习",why:"提高审美，让内容与作品更有表达力。",currentState:"从 Explore 转为项目，正在了解构图",nextStep:"做一次三分法构图练习",status:"active",accent:"blue",updatedAt:now},
  ],
  tasks:[
    {id:"task-or",title:"完成运筹学作业",notes:"第三题需要使用两阶段法",tier:"must",status:"open",dueDate:now.slice(0,10),carryCount:1,progressText:"前两题完成，第三题正在推导",projectId:"project-or",createdAt:now,completedAt:null},
    {id:"task-cv",title:"修改英文简历",notes:"补充最近的项目经历",tier:"must",status:"open",dueDate:now.slice(0,10),carryCount:0,progressText:"",projectId:null,createdAt:now,completedAt:null},
    {id:"task-site",title:"整理个人网站作品区",notes:"先选 3 个代表作品",tier:"suggested",status:"open",dueDate:now.slice(0,10),carryCount:0,progressText:"已选出 2 个作品",projectId:"project-site",createdAt:now,completedAt:null},
    {id:"task-photo",title:"练习摄影构图 20 分钟",notes:"低压力推进",tier:"optional",status:"open",dueDate:now.slice(0,10),carryCount:0,progressText:"",projectId:"project-photo",createdAt:now,completedAt:null},
  ],
  captures:[
    {id:"capture-1",body:"终于理解人工变量只是为了建立初始基。",category:"Knowledge",topic:"两阶段法",confidence:92,createdAt:now},
    {id:"capture-2",body:"想系统学习摄影构图，提高一下审美。",category:"Explore",topic:"摄影",confidence:89,createdAt:now},
  ],
  progressEvents:[{id:"event-1",projectId:"project-site",body:"完成教育背景模块",createdAt:now},{id:"event-2",projectId:"project-site",body:"确定网站整体结构",createdAt:new Date(Date.now()-5*86400000).toISOString()},{id:"event-3",projectId:"project-photo",body:"把摄影学习从 Explore 转为 Project",createdAt:now}],
  skills:[{id:"skill-1",name:"响应式设计",level:"能应用",evidence:"已用于个人网站三端布局",updatedAt:now},{id:"skill-2",name:"摄影构图",level:"了解过",evidence:"完成三分法基础阅读",updatedAt:now},{id:"skill-3",name:"两阶段法",level:"基本理解",evidence:"能解释人工变量与第一阶段目的",updatedAt:now}],
  syncedAt:now,
};

const nav=[{id:"today" as View,label:"Today",icon:CalendarDays},{id:"capture" as View,label:"Capture",icon:Plus},{id:"projects" as View,label:"Projects",icon:FolderKanban},{id:"review" as View,label:"Review",icon:BookOpen}];
const tierLabels:Record<string,string>={must:"必须做",suggested:"建议做",optional:"有空可以做"};
const categoryColors:Record<string,string>={Task:"yellow",Idea:"pink",Explore:"blue",Moment:"pink",Knowledge:"blue"};

function dateLabel(date=new Date()){return new Intl.DateTimeFormat("zh-CN",{month:"long",day:"numeric",weekday:"long",timeZone:"Asia/Shanghai"}).format(date);}
function shortDate(value:string){return new Intl.DateTimeFormat("zh-CN",{month:"short",day:"numeric",timeZone:"Asia/Shanghai"}).format(new Date(value));}
function shortTime(value:string){return new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Shanghai"}).format(new Date(value));}

async function postAction(item:QueuedAction){
  const response=await fetch("/api/actions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(item)});
  const data=await response.json() as {state?:AppState;meta?:Record<string,unknown>;error?:string};
  if(!response.ok)throw new Error(data.error||"保存失败"); return data;
}

export function GrowthApp(){
  const [view,setView]=useState<View>("today");
  const [state,setState]=useState<AppState>(fallback);
  const [captureText,setCaptureText]=useState("");
  const [syncing,setSyncing]=useState(true);
  const [offline,setOffline]=useState(false);
  const [repeatNotice,setRepeatNotice]=useState<{topic:string;count:number}|null>(null);
  const [selectedProjectId,setSelectedProjectId]=useState(fallback.projects[0].id);
  const [taskSheet,setTaskSheet]=useState<Task|null>(null);
  const [taskProgress,setTaskProgress]=useState("");
  const [progressOpen,setProgressOpen]=useState(false);
  const [progressText,setProgressText]=useState("");
  const [nextStep,setNextStep]=useState("");
  const [newProjectOpen,setNewProjectOpen]=useState(false);
  const [newProject,setNewProject]=useState({title:"",why:"",nextStep:""});

  const queueOffline=useCallback((item:QueuedAction)=>{const queue=JSON.parse(localStorage.getItem("forward-queue")||"[]") as QueuedAction[];queue.push(item);localStorage.setItem("forward-queue",JSON.stringify(queue));setOffline(true);},[]);
  const runAction=useCallback(async(item:QueuedAction,optimistic?:()=>void)=>{
    optimistic?.(); setSyncing(true);
    try{const data=await postAction(item);if(data.state)setState(data.state);setOffline(false);return data.meta??{};}
    catch(error){queueOffline(item);toast.warning(error instanceof Error?error.message:"已保存在离线队列");return{};}
    finally{setSyncing(false);}
  },[queueOffline]);

  useEffect(()=>{
    fetch("/api/state").then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<AppState>;}).then(setState).catch(()=>setOffline(true)).finally(()=>setSyncing(false));
    if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>undefined);
    const flush=async()=>{const queue=JSON.parse(localStorage.getItem("forward-queue")||"[]") as QueuedAction[];if(!queue.length)return;for(const item of queue){try{const data=await postAction(item);if(data.state)setState(data.state);}catch{return;}}localStorage.removeItem("forward-queue");setOffline(false);toast.success("离线记录已同步");};
    window.addEventListener("online",flush);void flush();return()=>window.removeEventListener("online",flush);
  },[]);

  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options?:{signal?:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;const lifecycle=new AbortController();
    void Promise.resolve(context.registerTool({name:"capture_thought",title:"记录一条想法",description:"把一句新的任务、想法、探索、时刻或知识记录到向前。",inputSchema:{type:"object",properties:{body:{type:"string"}},required:["body"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input:unknown)=>{const body=String((input as {body?:unknown}).body??"").trim();if(!body)throw new Error("body is required");const data=await postAction({action:"capture",payload:{body}});if(data.state)setState(data.state);return{saved:true,classification:data.meta?.classification};}},{signal:lifecycle.signal})).catch(()=>undefined);
    return()=>lifecycle.abort();
  },[]);

  const todayTasks=state.tasks.filter(task=>task.dueDate<=new Date().toISOString().slice(0,10));
  const completed=todayTasks.filter(task=>task.status==="done").length;
  const selectedProject=state.projects.find(project=>project.id===selectedProjectId)??state.projects[0];
  const selectedEvents=state.progressEvents.filter(event=>event.projectId===selectedProject?.id);
  const projectTasks=state.tasks.filter(task=>task.projectId===selectedProject?.id);
  const knowledge=state.captures.filter(item=>item.category==="Knowledge");

  const submitCapture=async()=>{
    const body=captureText.trim();if(!body)return;setCaptureText("");
    const optimistic:Capture={id:`local-${Date.now()}`,body,category:"正在判断",topic:null,confidence:0,createdAt:new Date().toISOString()};
    const meta=await runAction({action:"capture",payload:{body}},()=>setState(current=>({...current,captures:[optimistic,...current.captures]})));
    const classification=meta.classification as {category?:string;topic?:string}|undefined;
    if(meta.repeated&&classification?.topic)setRepeatNotice({topic:classification.topic,count:Number(meta.mentionCount??3)});
    toast.success(classification?.category?`已记录 · ${classification.category}`:"已记录");
  };

  const toggleTask=(task:Task,checked:boolean)=>runAction({action:"updateTask",payload:{id:task.id,status:checked?"done":"open",progressText:task.progressText}},()=>setState(current=>({...current,tasks:current.tasks.map(item=>item.id===task.id?{...item,status:checked?"done":"open"}:item)})));
  const openTask=(task:Task)=>{setTaskSheet(task);setTaskProgress(task.progressText);};
  const saveTaskProgress=async()=>{if(!taskSheet)return;await runAction({action:"updateTask",payload:{id:taskSheet.id,status:taskSheet.status,progressText:taskProgress}});setTaskSheet(null);toast.success("进度已更新");};
  const saveProgress=async()=>{if(!selectedProject||!progressText.trim())return;await runAction({action:"addProgress",payload:{projectId:selectedProject.id,body:progressText,nextStep}});setProgressText("");setNextStep("");setProgressOpen(false);toast.success("这一步已经进入项目时间线");};
  const createProject=async()=>{if(!newProject.title.trim())return;const meta=await runAction({action:"createProject",payload:newProject});if(meta.projectId)setSelectedProjectId(String(meta.projectId));setNewProject({title:"",why:"",nextStep:""});setNewProjectOpen(false);setView("projects");toast.success("项目已建立");};

  return <SidebarProvider style={{"--sidebar-width":"15.5rem"} as React.CSSProperties}>
    <Sidebar collapsible="offcanvas" className="growth-sidebar">
      <SidebarHeader className="brand-wrap"><div className="brand-mark">向</div><div><strong>向前</strong><span>把成长留在日常里</span></div></SidebarHeader>
      <SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{nav.map(item=><SidebarMenuItem key={item.id}><SidebarMenuButton asChild isActive={view===item.id} className="growth-nav"><button onClick={()=>setView(item.id)}><item.icon/><span>{item.label}</span></button></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="sidebar-foot"><div className={`sync-dot ${offline?"offline":""}`}/><span>{offline?"离线 · 稍后自动同步":syncing?"正在同步":"所有设备已同步"}</span></SidebarFooter>
    </Sidebar>
    <SidebarInset className="growth-shell">
      <header className="mobile-header"><SidebarTrigger><Menu/></SidebarTrigger><span>向前</span><div className={`sync-dot ${offline?"offline":""}`}/></header>
      <main className="workspace">
        {view==="today"&&<TodayView state={state} tasks={todayTasks} completed={completed} captureText={captureText} setCaptureText={setCaptureText} submitCapture={submitCapture} toggleTask={toggleTask} openTask={openTask} setView={setView} repeatNotice={repeatNotice} setRepeatNotice={setRepeatNotice}/>} 
        {view==="capture"&&<CaptureView state={state} captureText={captureText} setCaptureText={setCaptureText} submitCapture={submitCapture}/>} 
        {view==="projects"&&<ProjectsView projects={state.projects} selectedProject={selectedProject} events={selectedEvents} tasks={projectTasks} select={setSelectedProjectId} openProgress={()=>setProgressOpen(true)} openNew={()=>setNewProjectOpen(true)}/>} 
        {view==="review"&&<ReviewView state={state} completed={completed} knowledge={knowledge}/>} 
      </main>
      <nav className="bottom-nav" aria-label="主导航">{nav.map(item=><button key={item.id} className={view===item.id?"active":""} onClick={()=>setView(item.id)}><item.icon/><span>{item.label}</span></button>)}</nav>
    </SidebarInset>
    <Sheet open={Boolean(taskSheet)} onOpenChange={open=>!open&&setTaskSheet(null)}><SheetContent className="task-sheet"><SheetHeader><SheetTitle>{taskSheet?.title}</SheetTitle><SheetDescription>写一句当前做到哪里；它会留在任务与项目轨迹里。</SheetDescription></SheetHeader><div className="sheet-body"><label>当前进度</label><Textarea value={taskProgress} onChange={event=>setTaskProgress(event.target.value)} placeholder="例如：资料已经找完，正文写到第二部分"/><Button onClick={saveTaskProgress}>保存进度</Button></div></SheetContent></Sheet>
    <Dialog open={progressOpen} onOpenChange={setProgressOpen}><DialogContent className="soft-dialog"><DialogHeader><DialogTitle>更新「{selectedProject?.title}」</DialogTitle><DialogDescription>用一句真实的话记录这次推进，不需要估算百分比。</DialogDescription></DialogHeader><label>现在做到哪里</label><Textarea value={progressText} onChange={event=>setProgressText(event.target.value)} placeholder="例如：三个作品已经整理完两个"/><label>下一步（可选）</label><Textarea value={nextStep} onChange={event=>setNextStep(event.target.value)} placeholder={selectedProject?.nextStep}/><DialogFooter><Button onClick={saveProgress}>加入进度时间线</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}><DialogContent className="soft-dialog"><DialogHeader><DialogTitle>开始一个新项目</DialogTitle><DialogDescription>Project 意味着你决定行动；还不确定的方向可以先留在 Explore。</DialogDescription></DialogHeader><label>项目名称</label><input value={newProject.title} onChange={event=>setNewProject({...newProject,title:event.target.value})} placeholder="例如：摄影基础练习"/><label>为什么想做</label><Textarea value={newProject.why} onChange={event=>setNewProject({...newProject,why:event.target.value})}/><label>第一个最小行动</label><input value={newProject.nextStep} onChange={event=>setNewProject({...newProject,nextStep:event.target.value})}/><DialogFooter><Button onClick={createProject}>创建项目</Button></DialogFooter></DialogContent></Dialog>
    <Toaster position="top-center" richColors/>
  </SidebarProvider>;
}

function CaptureComposer({value,setValue,submit,compact=false}:{value:string;setValue:(value:string)=>void;submit:()=>void;compact?:boolean}){
  return <div className={`capture-composer ${compact?"compact":""}`}><Textarea aria-label="快速记录" value={value} onChange={event=>setValue(event.target.value)} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==="Enter"){event.preventDefault();submit();}}} placeholder="写下一句话，剩下的交给系统整理…"/><button aria-label="保存记录" onClick={submit} disabled={!value.trim()}><ArrowUp/></button><span className="composer-hint">⌘ Enter 记录</span></div>;
}

function TodayView({state,tasks,completed,captureText,setCaptureText,submitCapture,toggleTask,openTask,setView,repeatNotice,setRepeatNotice}:{state:AppState;tasks:Task[];completed:number;captureText:string;setCaptureText:(value:string)=>void;submitCapture:()=>void;toggleTask:(task:Task,checked:boolean)=>void;openTask:(task:Task)=>void;setView:(view:View)=>void;repeatNotice:{topic:string;count:number}|null;setRepeatNotice:(value:null)=>void}){
  return <div className="today-layout"><section className="today-main"><div className="eyebrow">{dateLabel()}</div><h1>想要记点什么？</h1><CaptureComposer value={captureText} setValue={setCaptureText} submit={submitCapture}/>
    {repeatNotice&&<div className="repeat-notice"><Sparkles/><div><strong>这是你第 {repeatNotice.count} 次提到「{repeatNotice.topic}」</strong><p>它可能已经不只是一个想法。要不要把它变成正式探索或项目？</p><div><button onClick={()=>{setView("projects");setRepeatNotice(null);}}>创建 Project</button><button className="quiet" onClick={()=>setRepeatNotice(null)}>先保留想法</button></div></div></div>}
    <div className="section-heading"><div><span>TODAY</span><h2>今天，把重要的事往前推一点</h2></div><span className="completion-pill">{completed}/{tasks.length} 完成</span></div>
    {(["must","suggested","optional"] as const).map(tier=><TaskGroup key={tier} tier={tier} tasks={tasks.filter(task=>task.tier===tier)} toggle={toggleTask} open={openTask}/>)}
  </section><aside className="today-aside"><div className="aside-card focus-card"><div className="mini-label">正在推进</div>{state.projects.filter(project=>project.status==="focus").slice(0,2).map(project=><button key={project.id} onClick={()=>setView("projects")}><div className={`accent-dot ${project.accent}`}/><div><strong>{project.title}</strong><span>{project.nextStep}</span></div><ChevronRight/></button>)}</div>
    <div className="aside-card"><div className="mini-label">今天的记录</div>{state.captures.slice(0,3).map(item=><div className="mini-capture" key={item.id}><span>{shortTime(item.createdAt)}</span><p>{item.body}</p></div>)}</div>
    <button className="review-invite" onClick={()=>setView("review")}><div><span>DAILY REVIEW</span><strong>今晚只需要一分钟</strong><p>系统会先替你整理今天。</p></div><ChevronRight/></button>
  </aside></div>;
}

function TaskGroup({tier,tasks,toggle,open}:{tier:string;tasks:Task[];toggle:(task:Task,checked:boolean)=>void;open:(task:Task)=>void}){
  if(!tasks.length)return null;return <section className={`task-group ${tier}`}><div className="task-group-title"><span>{tierLabels[tier]}</span>{tier==="must"&&<em>优先保留精力</em>}</div>{tasks.map(task=><div className={`task-row ${task.status==="done"?"done":""}`} key={task.id}><Checkbox checked={task.status==="done"} onCheckedChange={value=>toggle(task,Boolean(value))} aria-label={`完成 ${task.title}`}/><button className="task-copy" onClick={()=>open(task)}><strong>{task.title}</strong>{task.progressText&&<span>{task.progressText}</span>}{task.carryCount>0&&<small><Clock3/> 已顺延 {task.carryCount} 次</small>}</button><button className="more" onClick={()=>open(task)} aria-label="更新任务进度"><MoreHorizontal/></button></div>)}</section>;
}

function CaptureView({state,captureText,setCaptureText,submitCapture}:{state:AppState;captureText:string;setCaptureText:(value:string)=>void;submitCapture:()=>void}){
  return <section className="single-page"><div className="page-intro"><span className="eyebrow">CAPTURE</span><h1>先记下来，再慢慢想。</h1><p>你的原话会一直保留。分类只是系统给出的建议。</p></div><CaptureComposer value={captureText} setValue={setCaptureText} submit={submitCapture}/><div className="capture-grid">{state.captures.map(item=><article className="capture-card" key={item.id}><div className="capture-meta"><span className={`category ${categoryColors[item.category]||"neutral"}`}>{item.category}</span>{item.topic&&<span>#{item.topic}</span>}<span>{item.confidence?`${item.confidence}% 判断`:"等待同步"}</span></div><p>{item.body}</p><time>{shortDate(item.createdAt)}</time></article>)}</div></section>;
}

function ProjectsView({projects,selectedProject,events,tasks,select,openProgress,openNew}:{projects:Project[];selectedProject:Project;events:AppState["progressEvents"];tasks:Task[];select:(id:string)=>void;openProgress:()=>void;openNew:()=>void}){
  return <section className="projects-page"><header className="projects-header"><div><span className="eyebrow">PROJECTS</span><h1>我正在推进什么</h1></div><Button onClick={openNew}><Plus/>New Project</Button></header><div className="project-workspace"><aside className="project-list"><div className="mini-label">FOCUS · 建议不超过 5 个</div>{projects.map(project=><button key={project.id} onClick={()=>select(project.id)} className={selectedProject.id===project.id?"active":""}><div className={`project-swatch ${project.accent}`}/><div><strong>{project.title}</strong><span>{project.status==="focus"?"Focus":"Active"}</span></div><ChevronRight/></button>)}</aside><ProjectDetail project={selectedProject} events={events} tasks={tasks} openProgress={openProgress}/></div></section>;
}

function ProjectDetail({project,events,tasks,openProgress}:{project:Project;events:AppState["progressEvents"];tasks:Task[];openProgress:()=>void}){
  return <article className="project-detail"><div className={`project-hero ${project.accent}`}><div><span>{project.status==="focus"?"FOCUS PROJECT":"ACTIVE PROJECT"}</span><h2>{project.title}</h2><p>{project.why}</p></div><Button onClick={openProgress}>更新进度</Button></div><div className="status-grid"><div><span>当前状态</span><strong>{project.currentState}</strong><small>更新于 {shortDate(project.updatedAt)}</small></div><div><span>下一步</span><strong>{project.nextStep}</strong><small>只做一个清楚的行动</small></div></div><section className="detail-section"><div className="detail-title"><h3>Progress</h3><span>从最开始到现在</span></div><div className="timeline">{events.map((event,index)=><div className="timeline-item" key={event.id}><span className={index===0?"active":""}/><time>{shortDate(event.createdAt)}</time><p>{event.body}</p></div>)}</div></section><section className="detail-section"><div className="detail-title"><h3>相关任务</h3><span>{tasks.filter(task=>task.status==="done").length}/{tasks.length}</span></div>{tasks.map(task=><div className="linked-task" key={task.id}><span className={task.status==="done"?"checked":""}>{task.status==="done"&&<Check/>}</span><p>{task.title}</p></div>)}</section></article>;
}

function ReviewView({state,completed,knowledge}:{state:AppState;completed:number;knowledge:Capture[]}){
  const repeated=useMemo(()=>{const counts=new Map<string,number>();state.captures.forEach(item=>item.topic&&counts.set(item.topic,(counts.get(item.topic)||0)+1));return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0];},[state.captures]);
  return <section className="single-page review-page"><div className="page-intro"><span className="eyebrow">REVIEW</span><h1>看看你是怎么走到这里的</h1><p>不是为了给生活打分，而是看见真实发生的变化。</p></div><Tabs defaultValue="daily"><TabsList className="review-tabs"><TabsTrigger value="daily">Daily</TabsTrigger><TabsTrigger value="weekly">Weekly</TabsTrigger><TabsTrigger value="monthly">Monthly</TabsTrigger><TabsTrigger value="yearly">Yearly</TabsTrigger></TabsList><TabsContent value="daily"><ReviewPeriod title="今天" summary={`今天完成 ${completed} 项任务，${state.projects.filter(p=>state.progressEvents.some(e=>e.projectId===p.id)).length} 个项目留下了推进记录。`} state={state} knowledge={knowledge}/></TabsContent><TabsContent value="weekly"><ReviewPeriod title="这一周" summary={`个人网站与运筹学是这周最清楚的两条主线。${state.tasks.some(t=>t.carryCount>0)?"有任务连续顺延，适合再缩小一步。":"任务节奏稳定。"}`} state={state} knowledge={knowledge} repeated={repeated}/></TabsContent><TabsContent value="monthly"><ReviewPeriod title="我的这个月" summary={`你把注意力放在 ${state.projects.slice(0,3).map(p=>p.title).join("、")}。真正明显的进步来自持续留下具体的下一步。`} state={state} knowledge={knowledge} repeated={repeated}/></TabsContent><TabsContent value="yearly"><ReviewPeriod title="这一年正在形成什么" summary="项目成果、技能证据和重要 Moment 会在这里慢慢汇成一条属于你的年度轨迹。" state={state} knowledge={knowledge} repeated={repeated}/></TabsContent></Tabs></section>;
}

function ReviewPeriod({title,summary,state,knowledge,repeated}:{title:string;summary:string;state:AppState;knowledge:Capture[];repeated?:[string,number]}){
  const done=state.tasks.filter(task=>task.status==="done").length;return <div className="review-surface"><header><span>AI 已基于你的真实记录整理</span><h2>{title}</h2><p>{summary}</p></header><div className="review-metrics"><div className="metric pink"><span>完成任务</span><strong>{done}</strong><small>完成会自动进入项目轨迹</small></div><div className="metric yellow"><span>推进项目</span><strong>{state.projects.length}</strong><small>用“现在 + 下一步”表达进度</small></div><div className="metric blue"><span>沉淀知识</span><strong>{knowledge.length}</strong><small>来自正常学习过程</small></div></div><div className="review-columns"><section><div className="detail-title"><h3>真正发生的变化</h3></div>{state.progressEvents.slice(0,4).map(event=><div className="review-line" key={event.id}><Target/><div><strong>{state.projects.find(project=>project.id===event.projectId)?.title}</strong><p>{event.body}</p></div></div>)}</section><section><div className="detail-title"><h3>关键技能</h3></div>{state.skills.map(skill=><div className="skill-line" key={skill.id}><div><strong>{skill.name}</strong><span>{skill.level}</span></div><p>{skill.evidence}</p></div>)}</section></div>{repeated&&<div className="ai-note"><Sparkles/><div><strong>值得留意</strong><p>「{repeated[0]}」已经出现 {repeated[1]} 次。反复出现的方向，可能正在变成真正重要的事。</p></div></div>}</div>;
}
