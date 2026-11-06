import { env } from "cloudflare:workers";
import { TaskError, findTask, importTasks, ownerName, publishMessage } from "./task-service";
import { ACTION_LABELS, TASK_STATES } from "./control-model";
import { messageSummary } from "./message-summary";
import { listMembers } from "./member-service";
const send = (data: unknown, status=200) => Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
function error(status: number, text: string): never { throw new TaskError(status,text); }
function text(value: unknown, label: string, max: number, optional=false): string {
  if (optional && (value===undefined || value===null || value==="")) return "";
  if (typeof value!=="string" || !value.trim() || value.length>max) error(400,label+"格式或长度不正确");
  return value.trim();
}
function integer(value: unknown, label: string, fallback=0) {
  if (value===undefined || value===null) return fallback;
  const n=typeof value==="string" && /^\d+$/.test(value)?Number(value):value;
  if (typeof n!=="number" || !Number.isSafeInteger(n) || n<0) error(400,label+"必须为非负整数");
  return n;
}
function due(value: unknown) {
  if (value===undefined || value===null || value==="") return null;
  const n=integer(value,"截止时间"); if (!n || n>8640000000000000) error(400,"截止时间不正确"); return n;
}
async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) error(415,"请使用application/json");
  const reader=request.body?.getReader(); if(!reader) error(400,"缺少正文");
  let size=0;const parts:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>70000){await reader.cancel();error(413,"正文过大");}parts.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.length;}
  let data:any;try{data=JSON.parse(new TextDecoder().decode(buffer));}catch{error(400,"无效JSON");}
  if(!data||typeof data!=="object"||Array.isArray(data))error(400,"正文必须是对象");return data;
}
async function limit(request: Request, db: D1Database) {
  const ip=request.headers.get("cf-connecting-ip")||"local";
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));
  const key="control:"+Math.floor(Date.now()/60000)+":"+Array.from(new Uint8Array(hash)).slice(0,10).map(n=>n.toString(16).padStart(2,"0")).join("");
  const result=await db.prepare("INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(key,Date.now()+120000).first<any>();
  if(result.count>120)error(429,"操作过于频繁，请稍后再试");
}
const PROJECT_SQL=`SELECT r.id,r.title,r.description,r.created_at,
  COALESCE(NULLIF(s.name,''),r.title) AS name,COALESCE(s.goal,'') AS goal,COALESCE(s.milestone,'') AS milestone,
  COALESCE(s.status,'active') AS project_status,
  CASE WHEN s.room_id IS NOT NULL THEN s.is_test WHEN r.id LIKE 'test-%' OR r.id LIKE 'test!_%' ESCAPE '!' OR r.id='ui-verification' THEN 1 ELSE 0 END AS is_test,
  COALESCE(s.updated_at,r.created_at) AS updated_at,
  (SELECT COUNT(*) FROM tasks t WHERE t.room_id=r.id AND t.status!='cancelled') AS total_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.room_id=r.id AND t.status='done') AS done_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.room_id=r.id AND t.status='review') AS review_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.room_id=r.id AND t.status='blocked') AS blocked_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.room_id=r.id AND t.needs_decision=1 AND t.status NOT IN ('done','cancelled')) AS decision_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.room_id=r.id AND t.status IN ('claimed','in_progress')) AS active_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.room_id=r.id AND t.due_at IS NOT NULL AND t.due_at<? AND t.status NOT IN ('done','cancelled')) AS overdue_tasks,
  (SELECT COUNT(*) FROM tasks t WHERE t.room_id=r.id AND (t.status='review' OR t.needs_decision=1) AND t.status NOT IN ('done','cancelled')) AS owner_tasks,
  (SELECT COUNT(*) FROM messages m WHERE m.room_id=r.id AND m.kind='task' AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=m.id)) AS untracked_tasks,
  MAX(r.created_at,COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.room_id=r.id),0),COALESCE(s.updated_at,0)) AS last_activity,
  (SELECT COALESCE(NULLIF(summary,''),substr(content,1,160)) FROM messages m WHERE m.room_id=r.id ORDER BY id DESC LIMIT 1) AS last_summary,
  (SELECT sender FROM messages m WHERE m.room_id=r.id ORDER BY id DESC LIMIT 1) AS last_sender
  FROM rooms r LEFT JOIN project_settings s ON s.room_id=r.id`;
async function projects(db: D1Database) {
  const now=Date.now();
  const rows=(await db.prepare(PROJECT_SQL).bind(now).all<any>()).results;
  const agents=(await db.prepare("SELECT * FROM agents ORDER BY updated_at DESC").all<any>()).results;
  const groups=new Map<string,any[]>();for(const agent of agents){agent.stale=now-agent.updated_at>180000;const group=groups.get(agent.room_id)||[];group.push(agent);groups.set(agent.room_id,group);}
  const members=await listMembers(db),memberGroups=new Map<string,any[]>();for(const member of members){const group=memberGroups.get(member.room_id)||[];group.push(member);memberGroups.set(member.room_id,group);}
  for(const p of rows){p.members=memberGroups.get(p.id)||[];p.agents=(groups.get(p.id)||[]).filter(a=>!p.members.some((m:any)=>m.sender===a.sender&&!m.active));p.last_summary=p.last_summary?messageSummary(p.last_summary):null;}
  return rows;
}
async function taskList(db:D1Database,query:URLSearchParams,room:string|null) {
  const clauses=["1=1"],values:any[]=[];
  if(room){clauses.push("t.room_id=?");values.push(room);}
  if(!room&&query.get("include_test")!=="1")clauses.push("(s.room_id IS NOT NULL AND s.is_test=0 OR s.room_id IS NULL AND r.id NOT LIKE 'test-%' AND r.id NOT LIKE 'test!_%' ESCAPE '!' AND r.id!='ui-verification')");
  if(!room)clauses.push("COALESCE(s.status,'active')!='archived'");
  const filter=query.get("filter")||"all";
  const assignee=query.get("assignee");
  if(assignee){clauses.push("(t.assignee=? OR t.assignee IS NULL AND t.assigned_to=?)");values.push(text(assignee,"负责人",80),assignee);}
  if(filter==="attention")clauses.push("(t.status='review' OR t.needs_decision=1) AND t.status NOT IN ('done','cancelled')");
  else if(filter==="deliveries")clauses.push("t.evidence!=''");
  else if(filter==="open")clauses.push("t.status NOT IN ('done','cancelled')");
  else if(filter==="overdue"){clauses.push("t.due_at<? AND t.status NOT IN ('done','cancelled')");values.push(Date.now());}
  else if(filter!=="all"){if(!Object.hasOwn(TASK_STATES,filter))error(400,"筛选状态不支持");clauses.push("t.status=?");values.push(filter);}
  const q=(query.get("q")||"").trim().slice(0,120);
  if(q){const pattern="%"+q.replace(/[!%_]/g,"!$&")+"%";clauses.push("(t.title LIKE ? ESCAPE '!' OR t.assignee LIKE ? ESCAPE '!' OR t.assigned_to LIKE ? ESCAPE '!' OR CAST(t.id AS TEXT)=?)");values.push(pattern,pattern,pattern,q.replace(/^#/,""));}
  const pageSize=Math.min(100,Math.max(1,integer(query.get("limit"),"limit",50))),offset=integer(query.get("offset"),"offset",0);
  const from=" FROM tasks t JOIN rooms r ON r.id=t.room_id LEFT JOIN project_settings s ON s.room_id=t.room_id WHERE "+clauses.join(" AND ");
  const [rows,count]=await Promise.all([
    db.prepare("SELECT t.*,COALESCE(NULLIF(s.name,''),r.title) AS project_name"+from+" ORDER BY CASE WHEN t.status='review' OR t.needs_decision=1 THEN 0 WHEN t.status='blocked' THEN 1 ELSE 2 END,t.updated_at DESC,t.id DESC LIMIT ? OFFSET ?").bind(...values,pageSize+1,offset).all<any>(),
    db.prepare("SELECT COUNT(*) AS count"+from).bind(...values).first<any>(),
  ]);
  return {tasks:rows.results.slice(0,pageSize),total:count.count,has_more:rows.results.length>pageSize,next_offset:offset+pageSize,server_time:Date.now()};
}
async function route(request:Request) {
  const db=env.DB;if(!db)error(503,"数据库暂不可用");
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/v1/,"").replace(/\/$/,""),method=request.method;
  if(method!=="GET")await limit(request,db);
  if(path==="/projects"&&method==="GET"){
    let all=await projects(db);
    if(url.searchParams.get("include_test")!=="1")all=all.filter(p=>!p.is_test);
    const filter=url.searchParams.get("filter")||"all";
    all=all.filter(p=>filter==="archived"?p.project_status==="archived":p.project_status!=="archived");
    const summary={projects:all.length,review:0,decisions:0,blocked:0,attention:0};
    for(const p of all){summary.review+=p.review_tasks;summary.decisions+=p.decision_tasks;summary.blocked+=p.blocked_tasks>0||p.agents.some((a:any)=>a.state==="blocked"&&!a.stale)?1:0;summary.attention+=p.owner_tasks;}
    const q=(url.searchParams.get("q")||"").toLowerCase().slice(0,120);
    let filtered=all.filter(p=>!q||[p.name,p.id,p.goal,p.milestone].join(" ").toLowerCase().includes(q));
    if(filter==="attention")filtered=filtered.filter(p=>p.owner_tasks>0);
    else if(filter==="blocked")filtered=filtered.filter(p=>p.blocked_tasks>0||p.agents.some((a:any)=>a.state==="blocked"&&!a.stale));
    else if(filter==="active")filtered=filtered.filter(p=>p.project_status==="active"&&(p.active_tasks>0||p.agents.some((a:any)=>["working","brainstorming"].includes(a.state)&&!a.stale)));
    else if(!["all","archived"].includes(filter))error(400,"项目筛选不支持");
    filtered.sort((a,b)=>(b.owner_tasks>0?1:0)-(a.owner_tasks>0?1:0)||b.blocked_tasks-a.blocked_tasks||b.last_activity-a.last_activity||a.id.localeCompare(b.id));
    const limit=Math.min(100,Math.max(1,integer(url.searchParams.get("limit"),"limit",50))),offset=integer(url.searchParams.get("offset"),"offset",0);
    return send({projects:filtered.slice(offset,offset+limit),total:filtered.length,has_more:filtered.length>offset+limit,next_offset:offset+limit,summary,server_time:Date.now()});
  }
  if(path==="/projects"&&method==="POST"){
    const data=await body(request),id=text(data.id,"项目ID",80);
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id))error(400,"项目ID仅支持字母、数字、下划线和连字符");
    const name=text(data.name,"项目名称",100),description=text(data.description,"说明",2000,true),goal=text(data.goal,"目标",1000,true),milestone=text(data.milestone,"里程碑",200,true);
    if(await db.prepare("SELECT id FROM rooms WHERE id=?").bind(id).first())error(409,"项目ID已存在，可以直接打开该项目");
    try{await db.batch([db.prepare("INSERT INTO rooms(id,title,description,created_at) VALUES(?,?,?,?)").bind(id,name,description,Date.now()),
      db.prepare("INSERT INTO project_settings(room_id,name,goal,milestone,status,is_test,updated_at) VALUES(?,?,?,?,'active',?,?)").bind(id,name,goal,milestone,data.is_test===true?1:0,Date.now())]);}
    catch(e){if(await db.prepare("SELECT id FROM rooms WHERE id=?").bind(id).first())error(409,"项目ID已存在");throw e;}
    return send({project:(await projects(db)).find(p=>p.id===id)},201);
  }
  if(path==="/tasks"&&method==="GET")return send(await taskList(db,url.searchParams,null));
  const match=path.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})(?:\/(tasks|sync|members)(?:\/(\d+)(?:\/(actions))?)?)?$/);
  if(!match)error(404,"接口不存在");
  const room=match[1],resource=match[2],taskId=match[3]?integer(match[3],"任务ID"):null;
  const project=(await projects(db)).find(p=>p.id===room);if(!project)error(404,"项目不存在");
  if(!resource&&method==="GET")return send({project,server_time:Date.now()});
  if(!resource&&method==="PATCH"){
    const d=await body(request),name=text(d.name??project.name,"项目名称",100),goal=text(d.goal??project.goal,"目标",1000,true),milestone=text(d.milestone??project.milestone,"里程碑",200,true);
    const status=d.status??project.project_status;if(!["active","paused","archived"].includes(status))error(400,"项目阶段不支持");
    if(d.is_test!==undefined&&typeof d.is_test!=="boolean")error(400,"is_test必须是布尔值");
    const isTest=d.is_test===undefined?project.is_test:d.is_test?1:0;
    if(name===project.name&&goal===project.goal&&milestone===project.milestone&&status===project.project_status&&isTest===project.is_test)return send({project});
    const actor=text(d.actor??ownerName(room),"设置操作者",80),key=d.client_id?text(d.client_id,"client_id",128):crypto.randomUUID(),now=Date.now();
    const note="## 项目设置更新\n- 项目："+name+"\n- 阶段："+({active:"推进中",paused:"暂停",archived:"归档"} as Record<string,string>)[status]+"\n\n## 当前目标\n"+(goal||"尚未填写")+"\n\n## 里程碑\n"+(milestone||"尚未填写");
    const existing=await db.prepare("SELECT content FROM messages WHERE room_id=? AND sender=? AND client_id=?").bind(room,actor,key).first<any>();
    if(existing&&existing.content!==note)error(409,"client_id已用于其他项目设置");
    await db.batch([db.prepare("INSERT INTO project_settings(room_id,name,goal,milestone,status,is_test,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET name=excluded.name,goal=excluded.goal,milestone=excluded.milestone,status=excluded.status,is_test=excluded.is_test,updated_at=excluded.updated_at")
      .bind(room,name,goal,milestone,status,isTest,now),db.prepare("UPDATE rooms SET title=? WHERE id=?").bind(name,room),
      db.prepare("INSERT INTO messages(room_id,sender,content,summary,kind,recipient,reply_to,client_id,created_at) VALUES(?,?,?,?,'decision',NULL,NULL,?,?) ON CONFLICT(room_id,sender,client_id) DO NOTHING")
      .bind(room,actor,note,name+"：目标、里程碑或项目阶段已更新",key,now)]);
    return send({project:(await projects(db)).find(p=>p.id===room)});
  }
  if(resource==="sync"&&!taskId&&method==="POST")return send(await importTasks(db,room));
  if(resource==="members"&&!taskId&&method==="GET")return send({members:await listMembers(db,room),server_time:Date.now()});
  if(resource==="members"&&!taskId&&method==="POST"){
    const d=await body(request),sender=text(d.sender,"发言名",80),display=text(d.display_name??sender,"显示名",80),role=text(d.role??"成员","角色",40),responsibility=text(d.responsibility,"负责范围",2000,true);
    if(/[\r\n]/.test(sender+display+role))error(400,"姓名和角色请使用单行文字");
    if(d.active!==undefined&&typeof d.active!=="boolean")error(400,"active必须是布尔值");
    const active=d.active===false?0:1,now=Date.now(),actor=text(d.actor??ownerName(room),"设置操作者",80),key=d.client_id?text(d.client_id,"client_id",128):crypto.randomUUID();
    const old=await db.prepare("SELECT * FROM project_members WHERE room_id=? AND sender=?").bind(room,sender).first<any>();
    if(old&&old.display_name===display&&old.role===role&&old.responsibility===responsibility&&old.active===active)return send({members:await listMembers(db,room)});
    const note="## 成员配置\n- 显示名："+display+"\n- 发言名："+sender+"\n- 角色："+role+"\n- 状态："+(active?"启用":"停用")+"\n\n## 负责范围\n"+(responsibility||"尚未填写")+"\n\n配置成员不代表 Codex 已连接或定时任务已启动。";
    const previous=await db.prepare("SELECT content FROM messages WHERE room_id=? AND sender=? AND client_id=?").bind(room,actor,key).first<any>();
    if(previous&&previous.content!==note)error(409,"client_id已用于其他成员配置");
    await db.batch([db.prepare("INSERT INTO project_members(key,room_id,sender,display_name,role,responsibility,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,responsibility=excluded.responsibility,active=excluded.active,updated_at=excluded.updated_at")
      .bind(room+":"+sender,room,sender,display,role,responsibility,active,now,now),
      db.prepare("INSERT INTO messages(room_id,sender,content,summary,kind,client_id,created_at) VALUES(?,?,?,?,'decision',?,?) ON CONFLICT(room_id,sender,client_id) DO NOTHING")
      .bind(room,actor,note,(active?"成员配置：":"成员停用：")+display+"（"+role+"）",key,now)]);
    return send({members:await listMembers(db,room)});
  }
  if(resource!=="tasks")error(405,"不支持的请求方法");
  if(!taskId&&method==="GET")return send(await taskList(db,url.searchParams,room));
  if(!taskId&&method==="POST"){
    if(project.project_status==="archived")error(409,"项目已归档，请先恢复再派活");
    const d=await body(request),actor=text(d.actor,"派发人",80),title=text(d.title,"任务标题",160),description=text(d.description,"任务说明",12000,true),criteria=text(d.criteria,"验收条件",2500,true),recipient=text(d.assigned_to,"指定负责人",80,true)||null;
    const priority=d.priority??"normal";if(!["high","normal","low"].includes(priority))error(400,"优先级不支持");
    const deadline=due(d.due_at),clientId=text(d.client_id,"client_id",128);
    const markdown="## 任务目标\n"+(description||title)+"\n\n## 交付与验收\n"+(criteria||"请补充明确验收条件")+"\n\n## 安排\n- 负责人："+(recipient||"待认领")+"\n- 优先级："+priority+(deadline?"\n- 截止："+new Date(deadline).toISOString():"")+(d.needs_decision===true?"\n- 需要主人决策：是":"");
    const result=await publishMessage(db,{room,sender:actor,content:markdown,summary:title,summaryProvided:true,kind:"task",recipient,replyTo:null,clientId,fields:{title,description:description||title,criteria,priority,dueAt:deadline,needsDecision:d.needs_decision===true?1:0}});
    return send(result,result.deduplicated?200:201);
  }
  if(taskId&&method==="GET"&&!match[4]){
    const task=await findTask(db,room,taskId);if(!task)error(404,"任务不存在");
    const [events,related]=await Promise.all([db.prepare("SELECT e.*,m.summary AS summary FROM task_events e JOIN messages m ON m.id=e.message_id WHERE e.room_id=? AND e.task_id=? ORDER BY e.id DESC LIMIT 200").bind(room,taskId).all(),
      db.prepare("SELECT * FROM messages WHERE room_id=? AND (id=? OR reply_to=?) ORDER BY id DESC LIMIT 100").bind(room,taskId,taskId).all()]);
    return send({task,events:events.results,messages:related.results,server_time:Date.now()});
  }
  if(taskId&&method==="POST"&&match[4]==="actions"){
    const d=await body(request),actor=text(d.actor,"操作者",80),action=text(d.action,"操作",40),note=text(d.note,"操作说明",14000,true),clientId=text(d.client_id,"client_id",128);
    if(!ACTION_LABELS[action]||["created","comment","imported"].includes(action))error(400,"任务操作不支持");
    if(["block","submit","reject","request_decision","resolve_decision"].includes(action)&&!note)error(400,"此操作需要写清说明或交付证据");
    const assignedTo=text(d.assigned_to,"新负责人",80,true)||null,waitingFor=text(d.waiting_for,"等待对象",80,true)||null;
    const expected=d.expected_version===undefined?undefined:integer(d.expected_version,"任务版本");
    if(d.needs_decision!==undefined&&typeof d.needs_decision!=="boolean")error(400,"needs_decision必须是布尔值");
    const kind=action==="claim"?"claim":action==="submit"?"result":action==="block"?"blocker":action==="start"?"status":"decision";
    const summary="#"+taskId+" · "+ACTION_LABELS[action]+" · "+actor;
    const content="## "+ACTION_LABELS[action]+"\n"+(note||ACTION_LABELS[action])+(action==="reassign"?"\n\n新负责人："+(assignedTo||"待认领"):"")+(waitingFor?"\n\n等待："+waitingFor:"");
    return send(await publishMessage(db,{room,sender:actor,summary,summaryProvided:true,content,kind,recipient:action==="reassign"?assignedTo:waitingFor,replyTo:taskId,clientId},
      {action,expectedVersion:expected,assignedTo,waitingFor,needsDecision:d.needs_decision,evidence:action==="submit"?note:undefined}));
  }
  error(405,"不支持的请求方法");
}
export async function handleProjects(request:Request){
  try{return await route(request);}catch(e){if(e instanceof TaskError)return send({error:{message:e.message}},e.status);console.error("Project API failure",e instanceof Error?e.message:"unknown");return send({error:{message:"项目服务暂不可用，请重试"}},503);}
}
