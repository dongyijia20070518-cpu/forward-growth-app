import { env } from "cloudflare:workers";

export type Project={id:string;title:string;why:string;currentState:string;nextStep:string;status:string;accent:string;updatedAt:string};
export type Task={id:string;title:string;notes:string;tier:string;status:string;dueDate:string;carryCount:number;progressText:string;projectId:string|null;createdAt:string;completedAt:string|null};
export type Capture={id:string;body:string;category:string;topic:string|null;confidence:number;createdAt:string};
export type ProgressEvent={id:string;projectId:string;body:string;createdAt:string};
export type Skill={id:string;name:string;level:string;evidence:string;updatedAt:string};
export type AppState={projects:Project[];tasks:Task[];captures:Capture[];progressEvents:ProgressEvent[];skills:Skill[];syncedAt:string};

function db(){if(!env.DB)throw new Error("The shared database is temporarily unavailable.");return env.DB;}
const project=(r:Record<string,unknown>):Project=>({id:String(r.id),title:String(r.title),why:String(r.why??""),currentState:String(r.current_state??""),nextStep:String(r.next_step??""),status:String(r.status),accent:String(r.accent),updatedAt:String(r.updated_at)});
const task=(r:Record<string,unknown>):Task=>({id:String(r.id),title:String(r.title),notes:String(r.notes??""),tier:String(r.tier),status:String(r.status),dueDate:String(r.due_date),carryCount:Number(r.carry_count??0),progressText:String(r.progress_text??""),projectId:r.project_id?String(r.project_id):null,createdAt:String(r.created_at),completedAt:r.completed_at?String(r.completed_at):null});
const capture=(r:Record<string,unknown>):Capture=>({id:String(r.id),body:String(r.body),category:String(r.category),topic:r.topic?String(r.topic):null,confidence:Number(r.confidence??78),createdAt:String(r.created_at)});
const event=(r:Record<string,unknown>):ProgressEvent=>({id:String(r.id),projectId:String(r.project_id),body:String(r.body),createdAt:String(r.created_at)});
const skill=(r:Record<string,unknown>):Skill=>({id:String(r.id),name:String(r.name),level:String(r.level),evidence:String(r.evidence??""),updatedAt:String(r.updated_at)});

export async function ensureSeed(){
  const database=db(),today=new Date().toISOString().slice(0,10),now=new Date().toISOString();
  const count=await database.prepare("SELECT COUNT(*) AS count FROM projects").first<{count:number}>(); if(Number(count?.count??0)>0)return;
  await database.batch([
    database.prepare("INSERT INTO projects (id,title,why,current_state,next_step,status,accent,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind("project-site","个人网站","把自己的项目、技能与个人特色完整地展示出来。","主页结构已完成，正在整理作品区","整理 3 个最值得展示的作品","focus","pink",now),
    database.prepare("INSERT INTO projects (id,title,why,current_state,next_step,status,accent,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind("project-or","运筹学","真正理解方法，而不只是完成作业。","两阶段法已经理解，第三题还需要推导","完成第三题并写下解题思路","focus","yellow",now),
    database.prepare("INSERT INTO projects (id,title,why,current_state,next_step,status,accent,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind("project-photo","摄影学习","提高审美，让内容与作品更有表达力。","从 Explore 转为项目，正在了解构图","做一次三分法构图练习","active","blue",now),
    database.prepare("INSERT INTO tasks (id,title,notes,tier,status,due_date,carry_count,progress_text,project_id,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind("task-or","完成运筹学作业","第三题需要使用两阶段法","must","open",today,1,"前两题完成，第三题正在推导","project-or",now,null),
    database.prepare("INSERT INTO tasks (id,title,notes,tier,status,due_date,carry_count,progress_text,project_id,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind("task-cv","修改英文简历","补充最近的项目经历","must","open",today,0,"",null,now,null),
    database.prepare("INSERT INTO tasks (id,title,notes,tier,status,due_date,carry_count,progress_text,project_id,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind("task-site","整理个人网站作品区","先选 3 个代表作品","suggested","open",today,0,"已选出 2 个作品","project-site",now,null),
    database.prepare("INSERT INTO tasks (id,title,notes,tier,status,due_date,carry_count,progress_text,project_id,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind("task-photo","练习摄影构图 20 分钟","低压力推进","optional","open",today,0,"","project-photo",now,null),
    database.prepare("INSERT INTO captures (id,body,category,topic,confidence,created_at) VALUES (?,?,?,?,?,?)").bind("capture-1","终于理解人工变量只是为了建立初始基。","Knowledge","两阶段法",92,now),
    database.prepare("INSERT INTO captures (id,body,category,topic,confidence,created_at) VALUES (?,?,?,?,?,?)").bind("capture-2","想系统学习摄影构图，提高一下审美。","Explore","摄影",89,now),
    database.prepare("INSERT INTO progress_events (id,project_id,body,created_at) VALUES (?,?,?,?)").bind("event-1","project-site","完成教育背景模块",new Date(Date.now()-86400000).toISOString()),
    database.prepare("INSERT INTO progress_events (id,project_id,body,created_at) VALUES (?,?,?,?)").bind("event-2","project-site","确定网站整体结构",new Date(Date.now()-5*86400000).toISOString()),
    database.prepare("INSERT INTO progress_events (id,project_id,body,created_at) VALUES (?,?,?,?)").bind("event-3","project-photo","把摄影学习从 Explore 转为 Project",now),
    database.prepare("INSERT INTO skills (id,name,level,evidence,updated_at) VALUES (?,?,?,?,?)").bind("skill-1","响应式设计","能应用","已用于个人网站三端布局",now),
    database.prepare("INSERT INTO skills (id,name,level,evidence,updated_at) VALUES (?,?,?,?,?)").bind("skill-2","摄影构图","了解过","完成三分法基础阅读",now),
    database.prepare("INSERT INTO skills (id,name,level,evidence,updated_at) VALUES (?,?,?,?,?)").bind("skill-3","两阶段法","基本理解","能解释人工变量与第一阶段目的",now),
  ]);
}

export async function loadState():Promise<AppState>{
  await ensureSeed(); const database=db(),today=new Date().toISOString().slice(0,10);
  await database.prepare("UPDATE tasks SET due_date = ?, carry_count = carry_count + 1 WHERE status = 'open' AND due_date < ?").bind(today,today).run();
  const [p,t,c,e,s]=await database.batch([database.prepare("SELECT * FROM projects ORDER BY CASE status WHEN 'focus' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, updated_at DESC"),database.prepare("SELECT * FROM tasks ORDER BY CASE tier WHEN 'must' THEN 0 WHEN 'suggested' THEN 1 ELSE 2 END, created_at ASC"),database.prepare("SELECT * FROM captures ORDER BY created_at DESC LIMIT 50"),database.prepare("SELECT * FROM progress_events ORDER BY created_at DESC LIMIT 100"),database.prepare("SELECT * FROM skills ORDER BY updated_at DESC")]);
  return{projects:(p.results as Record<string,unknown>[]).map(project),tasks:(t.results as Record<string,unknown>[]).map(task),captures:(c.results as Record<string,unknown>[]).map(capture),progressEvents:(e.results as Record<string,unknown>[]).map(event),skills:(s.results as Record<string,unknown>[]).map(skill),syncedAt:new Date().toISOString()};
}
export function database(){return db();}
