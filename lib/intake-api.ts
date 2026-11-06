import {env} from "cloudflare:workers";
import {overviewAuthorized} from "./overview-auth";
import {listMembers} from "./member-service";
import {TaskError,ownerName} from "./task-service";
import {validateProposal,type IntakeProposal} from "./intake-model";
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
function fail(status:number,message:string):never{throw new TaskError(status,message);}
function string(value:unknown,max:number,label:string){if(typeof value!=="string"||!value.trim()||value.length>max)fail(400,label+"格式或长度不正确");return value.trim();}
async function body(request:Request){if(!request.headers.get("content-type")?.includes("application/json"))fail(415,"请使用JSON正文");const reader=request.body?.getReader();if(!reader)fail(400,"缺少正文");let size=0;const parts:Uint8Array[]=[];for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>24000){await reader.cancel();fail(413,"本轮描述太长，请保留最重要的目标和约束");}parts.push(r.value);}const bytes=new Uint8Array(size);let i=0;for(const p of parts){bytes.set(p,i);i+=p.length;}try{const result=JSON.parse(new TextDecoder().decode(bytes));if(!result||typeof result!=="object"||Array.isArray(result))fail(400,"无效正文");return result;}catch{fail(400,"无效JSON正文");}}
async function session(db:D1Database,room:string,id:string){const row=await db.prepare("SELECT * FROM intake_sessions WHERE room_id=? AND id=?").bind(room,id).first<any>();if(!row)fail(404,"需求草稿不存在");return row;}
async function view(db:D1Database,row:any){const [turns,tasks,job]=await Promise.all([
  db.prepare("SELECT id,role,content,created_at FROM intake_turns WHERE room_id=? AND session_id=? ORDER BY id").bind(row.room_id,row.id).all(),
  db.prepare("SELECT t.id,t.title,t.assigned_to,t.status FROM tasks t JOIN messages m ON m.id=t.id WHERE t.room_id=? AND m.sender=? AND m.client_id LIKE ? ORDER BY t.id").bind(row.room_id,ownerName(row.room_id),"intake-"+row.id+"-%").all(),
  row.current_job_id?db.prepare("SELECT status,error FROM intake_jobs WHERE id=? AND room_id=?").bind(row.current_job_id,row.room_id).first():null,
]);return {session:{id:row.id,room_id:row.room_id,status:row.status,version:row.version,error:row.error,created_at:row.created_at,updated_at:row.updated_at},turns:turns.results,proposal:JSON.parse(row.proposal_json),tasks:tasks.results,job,model:{id:"deepseek-flash",name:env.DEEPSEEK_MODEL_NAME||"DeepSeek Flash",effort:"max"}};}
async function requestLimit(db:D1Database,request:Request){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(request.headers.get("cf-connecting-ip")||"local"));const ip=Array.from(new Uint8Array(digest)).slice(0,12).map(n=>n.toString(16).padStart(2,"0")).join("");const result=await db.prepare("INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind("intake:"+Math.floor(Date.now()/60000)+":"+ip,Date.now()+120000).first<any>();if(result.count>8)fail(429,"讨论太密集，请稍候片刻再提交");}
function taskContent(proposal:IntakeProposal,t:IntakeProposal['tasks'][number]){return "## 需求\n"+t.description+"\n\n## 交付与验收\n"+t.criteria+"\n\n## 分工\n- 负责人："+(t.assignee||"待认领")+"\n- 推荐理由："+t.assignment_reason+"\n- 优先级："+t.priority+(t.depends_on.length?"\n- 先完成："+t.depends_on.map(k=>proposal.tasks.find(x=>x.key===k)!.title).join("、"):"")+(proposal.assumptions.length?"\n\n## 已确认的假设\n"+proposal.assumptions.map(a=>"- "+a).join("\n"):"");}
async function dispatch(db:D1Database,row:any,version:number,dispatchKey:string,mode:"pool"|"direct"){
  if(row.status==="dispatched")return view(db,row);
  if(row.status!=="ready"||row.version!==version)fail(409,"需求已变化或仍有待确认事项，请重新查看最新方案");
  const proposal=validateProposal(JSON.parse(row.proposal_json),await listMembers(db,row.room_id));if(!proposal.ready)fail(409,"请先回答关键问题，或告诉AI你的明确决定，再派发任务");
  const room=row.room_id,actor=ownerName(room),now=Date.now(),statements:D1PreparedStatement[]=[];
  statements.push(db.prepare("UPDATE intake_sessions SET status='dispatching',dispatch_key=?,version=version+1,updated_at=? WHERE id=? AND room_id=? AND version=? AND status='ready' AND COALESCE((SELECT status FROM project_settings WHERE room_id=?),'active')='active'").bind(dispatchKey,now,row.id,room,version,room));
  for(const t of proposal.tasks){const client="intake-"+row.id+"-"+t.key,content=taskContent(proposal,t);
    statements.push(db.prepare("INSERT INTO messages(room_id,sender,content,summary,kind,recipient,reply_to,client_id,created_at) SELECT ?,?,?,?,'task',?,NULL,?,? WHERE EXISTS(SELECT 1 FROM intake_sessions WHERE id=? AND room_id=? AND dispatch_key=? AND status='dispatching') ON CONFLICT(room_id,sender,client_id) DO NOTHING").bind(room,actor,content+(mode==="pool"?"\n\n抢单方式：本项目全员可抢，推荐负责人仅供匹配参考。":"\n\n接单方式：定向邀请指定负责人。"),t.title,mode==="direct"?t.assignee:null,client,now,row.id,room,dispatchKey));
    statements.push(db.prepare("INSERT INTO tasks(id,room_id,title,description,criteria,requester,assigned_to,status,priority,due_at,needs_decision,last_action_key,created_at,updated_at) SELECT id,room_id,?,?,?,sender,recipient,'todo',?,NULL,0,?,created_at,created_at FROM messages WHERE room_id=? AND sender=? AND client_id=? ON CONFLICT(id) DO NOTHING").bind(t.title,t.description+(t.depends_on.length?"\n\n前置任务："+t.depends_on.map(k=>proposal.tasks.find(x=>x.key===k)!.title).join("、"):""),t.criteria,t.priority,client,room,actor,client));
    statements.push(db.prepare("INSERT INTO task_events(room_id,task_id,message_id,actor,action,from_state,to_state,note,created_at) SELECT room_id,id,id,sender,'created',NULL,'todo',content,created_at FROM messages WHERE room_id=? AND sender=? AND client_id=? ON CONFLICT(message_id) DO NOTHING").bind(room,actor,client));
    statements.push(db.prepare("INSERT INTO order_details(task_id,room_id,recommended_to,dispatch_mode,created_at) SELECT id,room_id,?,?,created_at FROM messages WHERE room_id=? AND sender=? AND client_id=? ON CONFLICT(task_id) DO NOTHING").bind(t.assignee,mode,room,actor,client));
  }
  statements.push(db.prepare("INSERT INTO messages(room_id,sender,content,summary,kind,recipient,reply_to,client_id,created_at) SELECT ?,?,? || COALESCE((SELECT group_concat('#' || id || ' · ' || summary || ' → ' || COALESCE(recipient,'待认领'),char(10)) FROM messages WHERE room_id=? AND sender=? AND client_id LIKE ?),''),?,'decision',NULL,NULL,?,? WHERE EXISTS(SELECT 1 FROM intake_sessions WHERE id=? AND room_id=? AND dispatch_key=? AND status='dispatching') ON CONFLICT(room_id,sender,client_id) DO NOTHING").bind(room,actor,"## 主人已确认派单\n"+proposal.reply+"\n\n## 任务与负责人\n",room,actor,"intake-"+row.id+"-%","已确认并派发 "+proposal.tasks.length+" 项任务，请各负责人公开接单","intake-plan-"+row.id,now,row.id,room,dispatchKey));
  statements.push(db.prepare("UPDATE intake_sessions SET status='dispatched',updated_at=? WHERE id=? AND room_id=? AND dispatch_key=? AND status='dispatching'").bind(now,row.id,room,dispatchKey));
  await db.batch(statements);const current=await session(db,room,row.id);if(current.status!=="dispatched")fail(409,"项目或需求已变化，本次没有派单，请刷新后重试");return view(db,current);
}
export async function handleIntake(request:Request,room:string,id?:string,action?:string){
  const db=env.DB!;
  if(!await overviewAuthorized(request))return json({error:{message:"请先输入总览密码，再使用主人的AI需求助手",code:"overview_locked"}},401);
  if(request.method!=="GET"&&request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)fail(403,"请从当前站点操作");
  const project=await db.prepare("SELECT r.id,COALESCE(s.status,'active') AS status FROM rooms r LEFT JOIN project_settings s ON s.room_id=r.id WHERE r.id=?").bind(room).first<any>();if(!project)fail(404,"项目不存在");
  if(!id&&request.method==="GET"){const rows=await db.prepare("SELECT s.id,s.status,s.version,s.updated_at,(SELECT substr(content,1,80) FROM intake_turns t WHERE t.session_id=s.id ORDER BY id LIMIT 1) AS summary FROM intake_sessions s WHERE room_id=? ORDER BY updated_at DESC LIMIT 20").bind(room).all();return json({sessions:rows.results,available:!!env.DEEPSEEK_API_KEY&&env.RELAY_RUNTIME==="node-sqlite",model:{id:"deepseek-flash",name:env.DEEPSEEK_MODEL_NAME||"DeepSeek Flash",effort:"max"}});}
  if(!id&&request.method==="POST"){const d=await body(request),newId=string(d.id,36,"草稿ID");if(!/^[a-f0-9-]{36}$/.test(newId))fail(400,"无效草稿ID");const now=Date.now();await db.prepare("INSERT INTO intake_sessions(id,room_id,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(newId,room,now,now).run();return json(await view(db,await session(db,room,newId)),201);}
  if(!id)fail(405,"不支持的请求");
  const current=await session(db,room,id);
  if(!action&&request.method==="GET")return json(await view(db,current));
  if(request.method!=="POST")fail(405,"不支持的请求");
  if(project.status!=="active")fail(409,"项目已暂停或归档，请恢复后再讨论或派单");
  const d=await body(request),clientId=string(d.client_id,128,"请求ID"),version=d.expected_version;if(!Number.isSafeInteger(version)||version<0)fail(400,"缺少有效的草稿版本");
  if(action==="dispatch"){const mode=d.dispatch_mode??"pool";if(!["pool","direct"].includes(mode))fail(400,"无效抢单方式");return json(await dispatch(db,current,version,clientId,mode));}
  if(action!=="turns")fail(405,"不支持的请求");
  if(!env.DEEPSEEK_API_KEY||env.RELAY_RUNTIME!=="node-sqlite")fail(503,"AI需求助手尚未配置，请联系站点负责人");
  const content=string(d.text,4000,"需求描述"),existing=await db.prepare("SELECT request_text FROM intake_jobs WHERE room_id=? AND session_id=? AND client_id=?").bind(room,id,clientId).first<any>();
  if(existing){if(existing.request_text!==content)fail(409,"请求ID已用于另一段需求");return json(await view(db,await session(db,room,id)),202);}
  if(current.status==="thinking"||current.status==="dispatched"||current.version!==version)fail(409,"AI正在处理或需求已变化，请查看最新内容后再补充");
  const count=await db.prepare("SELECT COUNT(*) AS n FROM intake_turns WHERE session_id=?").bind(id).first<any>();if(count.n>=40)fail(409,"这轮讨论较长，请先总结已确认内容，再开启一条新需求");
  await requestLimit(db,request);
  const queued=await db.prepare("SELECT COUNT(*) AS n FROM intake_jobs WHERE status IN ('queued','running')").first<any>();if(queued.n>=8)fail(429,"AI正在处理已有需求，请稍候再提交");
  const job=crypto.randomUUID(),now=Date.now();
  await db.batch([
    db.prepare("INSERT INTO intake_jobs(id,room_id,session_id,client_id,request_text,created_at,updated_at) SELECT ?,?,?,?,?,?,? FROM intake_sessions WHERE id=? AND room_id=? AND version=? AND status IN ('draft','ready','failed')").bind(job,room,id,clientId,content,now,now,id,room,version),
    db.prepare("INSERT INTO intake_turns(session_id,room_id,role,content,created_at) SELECT ?,?,'user',?,? WHERE EXISTS(SELECT 1 FROM intake_jobs WHERE id=?)").bind(id,room,content,now,job),
    db.prepare("UPDATE intake_sessions SET status='thinking',current_job_id=?,version=version+1,error='',updated_at=? WHERE id=? AND room_id=? AND version=? AND EXISTS(SELECT 1 FROM intake_jobs WHERE id=?)").bind(job,now,id,room,version,job),
  ]);
  const row=await session(db,room,id);if(row.current_job_id!==job){const repeated=await db.prepare("SELECT request_text FROM intake_jobs WHERE room_id=? AND session_id=? AND client_id=?").bind(room,id,clientId).first<any>();if(!repeated||repeated.request_text!==content)fail(409,"需求已被更新，请查看最新讨论后再补充");}return json(await view(db,row),202);
}
