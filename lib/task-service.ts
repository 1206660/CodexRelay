import { messageSummary } from "./message-summary";
import { ACTION_LABELS } from "./control-model";

export class TaskError extends Error { constructor(public status: number, message: string) { super(message); } }
export type MessageInput = { room: string; sender: string; content: string; summary: string; summaryProvided: boolean; kind: string; recipient: string | null; replyTo: number | null; clientId: string; fields?: { title: string; description: string; criteria: string; priority: string; dueAt: number | null; needsDecision: number } };
export type ActionInput = { action: string; expectedVersion?: number; assignedTo?: string | null; waitingFor?: string | null; needsDecision?: boolean; evidence?: string };
const CLOSED = ["done", "cancelled"];
export function ownerName(room: string) { return room.slice(0, 60) + "-owner"; }
function sameMessage(m: any, p: MessageInput) { return m.content === p.content && m.kind === p.kind && m.recipient === p.recipient && m.reply_to === p.replyTo && (!p.summaryProvided || m.summary === p.summary); }
export async function findTask(db: D1Database, room: string, id: number) {
  return db.prepare("SELECT * FROM tasks WHERE room_id=? AND id=?").bind(room, id).first<any>();
}
function initialTask(m: any) {
  return { id: m.id, room_id: m.room_id, title: m.summary || messageSummary(m.content), description: m.content, criteria: "", requester: m.sender, assigned_to: m.recipient, assignee: null,
    status: "todo", priority: "normal", due_at: null, blocker: "", waiting_for: null, needs_decision: 0, decision_note: "", evidence: "", review_note: "", reviewer: null,
    rework_count: 0, version: 0, last_action_key: "legacy:" + m.id, created_at: m.created_at, updated_at: m.created_at, completed_at: null };
}
function insertTask(db: D1Database, t: any) {
  return db.prepare(`INSERT INTO tasks(id,room_id,title,description,criteria,requester,assigned_to,assignee,status,priority,due_at,blocker,waiting_for,needs_decision,decision_note,evidence,review_note,reviewer,rework_count,version,last_action_key,created_at,updated_at,completed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(t.id,t.room_id,t.title,t.description,t.criteria,t.requester,t.assigned_to,t.assignee,t.status,t.priority,t.due_at,t.blocker,t.waiting_for,t.needs_decision,t.decision_note,t.evidence,t.review_note,t.reviewer,t.rework_count,t.version,t.last_action_key,t.created_at,t.updated_at,t.completed_at);
}
function mutation(t: any, p: MessageInput, input?: ActionInput) {
  const privileged = p.sender === ownerName(p.room) || p.sender === t.requester;
  const responsible = t.assignee === p.sender || (!t.assignee && t.assigned_to === p.sender);
  let action = input?.action;
  if (!action) {
    if (p.kind === "result" && !responsible) throw new TaskError(409, "仅负责人可提交该任务的交付；协助成果请用交接或消息同步");
    if (p.kind === "claim") action = "claim";
    else if (p.kind === "result" && responsible && !CLOSED.includes(t.status)) action = "submit";
    else if (p.kind === "blocker" && (responsible || privileged) && !CLOSED.includes(t.status)) action = "block";
    else if (p.kind === "status" && responsible && ["claimed", "in_progress", "blocked"].includes(t.status)) action = "start";
    else action = "comment";
  }
  if (!ACTION_LABELS[action]) throw new TaskError(400, "任务操作不支持");
  if (input?.expectedVersion !== undefined && input.expectedVersion !== t.version) throw new TaskError(409, "任务已被其他人更新，请刷新后再操作");
  const changes: Record<string, any> = {};
  if (action === "claim") {
    if (t.status !== "todo" || t.assignee) throw new TaskError(409, "任务已被接走或当前不可接单");
    if (t.assigned_to && t.assigned_to !== p.sender) throw new TaskError(409, "该任务已指定其他负责人");
    changes.assignee = p.sender; changes.status = "claimed";
  } else if (action === "start") {
    if (!responsible || !["claimed", "in_progress", "blocked"].includes(t.status)) throw new TaskError(409, "当前负责人或任务状态不允许开始");
    changes.status = "in_progress"; changes.blocker = ""; changes.waiting_for = null;
  } else if (action === "submit") {
    if (!responsible || !["todo", "claimed", "in_progress", "blocked", "review"].includes(t.status)) throw new TaskError(409, "仅任务负责人可提交当前任务");
    const evidence = input?.evidence || p.content;
    if (!evidence.trim()) throw new TaskError(400, "请提供实际成果和验证说明");
    changes.status = "review"; changes.assignee = t.assignee || p.sender; changes.evidence = evidence; changes.blocker = ""; changes.waiting_for = null;
  } else if (action === "accept") {
    if (!privileged || t.status !== "review") throw new TaskError(409, "仅主人或派发人可验收待验收任务");
    changes.status = "done"; changes.reviewer = p.sender; changes.review_note = p.content; changes.completed_at = Date.now(); changes.needs_decision = 0; changes.blocker = ""; changes.waiting_for = null;
  } else if (action === "reject") {
    if (!privileged || t.status !== "review") throw new TaskError(409, "仅主人或派发人可退回待验收任务");
    changes.status = "in_progress"; changes.review_note = p.content; changes.reviewer = p.sender; changes.rework_count = t.rework_count + 1;
  } else if (action === "block") {
    if (!(responsible || privileged) || CLOSED.includes(t.status)) throw new TaskError(409, "当前任务不可报告阻塞");
    changes.status = "blocked"; changes.blocker = p.content; changes.waiting_for = input?.waitingFor || p.recipient;
    if (input?.needsDecision !== undefined) changes.needs_decision = input.needsDecision ? 1 : 0;
  } else if (action === "request_decision") {
    if (CLOSED.includes(t.status)) throw new TaskError(409, "已结束任务不可请求决策");
    changes.needs_decision = 1; changes.decision_note = p.content;
  } else if (action === "resolve_decision") {
    if (!privileged || !t.needs_decision) throw new TaskError(409, "当前没有可由你处理的决策");
    changes.needs_decision = 0; changes.decision_note = p.content;
  } else if (action === "reassign") {
    if (!privileged || CLOSED.includes(t.status) || t.status === "review") throw new TaskError(409, "当前任务不可转派");
    changes.assigned_to = input?.assignedTo || null; changes.assignee = null; changes.status = "todo"; changes.blocker = ""; changes.waiting_for = null;
  } else if (action === "cancel") {
    if (!privileged || CLOSED.includes(t.status)) throw new TaskError(409, "当前任务不可取消");
    changes.status = "cancelled"; changes.needs_decision = 0;
  }
  return { action, changes };
}
export async function publishMessage(db: D1Database, p: MessageInput, input?: ActionInput) {
  const existing = await db.prepare("SELECT * FROM messages WHERE room_id=? AND sender=? AND client_id=?").bind(p.room, p.sender, p.clientId).first<any>();
  if (existing) {
    if (!sameMessage(existing, p)) throw new TaskError(409, "client_id 已用于其他内容");
    return { message: existing, deduplicated: true, task: p.kind === "task" ? await findTask(db,p.room,existing.id) : p.replyTo ? await findTask(db,p.room,p.replyTo) : null };
  }
  const now = Date.now(), opKey = JSON.stringify([p.sender,p.clientId]);
  const projectState=await db.prepare("SELECT status FROM project_settings WHERE room_id=?").bind(p.room).first<any>();
  const membership=await db.prepare("SELECT active FROM project_members WHERE room_id=? AND sender=?").bind(p.room,p.sender).first<any>();
  if(p.kind==="task"&&projectState?.status==="archived")throw new TaskError(409,"项目已归档，不能派发新任务");
  if(p.kind==="task"&&membership?.active===0)throw new TaskError(409,"成员已停用，不能派发新任务");
  let task = p.replyTo ? await findTask(db,p.room,p.replyTo) : null;
  let seed: any = null;
  if (!task && p.replyTo) {
    const source = await db.prepare("SELECT * FROM messages WHERE room_id=? AND id=? AND kind='task'").bind(p.room,p.replyTo).first<any>();
    if (source) { seed = initialTask(source); task = seed; }
  }
  if (input && !task) throw new TaskError(404, "任务不存在");
  if(task){
    const completed=await db.prepare("SELECT * FROM messages WHERE room_id=? AND sender=? AND client_id=?").bind(p.room,p.sender,p.clientId).first<any>();
    if(completed){if(!sameMessage(completed,p))throw new TaskError(409,"client_id已用于其他内容");return {message:completed,deduplicated:true,task:await findTask(db,p.room,task.id)};}
  }
  let change = task ? mutation(task,p,input) : null;
  if(change?.action==="start"&&!input&&projectState&&projectState.status!=="active")change={action:"comment",changes:{}};
  if(change?.action==="start"&&!input&&membership?.active===0)change={action:"comment",changes:{}};
  if(change&&["claim","start"].includes(change.action)&&projectState&&projectState.status!=="active")throw new TaskError(409,"项目已暂停或归档，不能接单或开始新工作");
  if(change&&["claim","start"].includes(change.action)&&membership?.active===0)throw new TaskError(409,"成员已停用，不能接单或开始新工作");
  const statements: D1PreparedStatement[] = [];
  if (seed) statements.push(insertTask(db,seed));
  const guarded = !!change && Object.keys(change.changes).length > 0;
  if (guarded) {
    const columns = Object.keys(change!.changes);
    const checkMembership=["claim","start"].includes(change!.action);
    statements.push(db.prepare(`UPDATE tasks SET ${columns.map(k=>k+"=?").join(",")},version=version+1,last_action_key=?,updated_at=? WHERE room_id=? AND id=? AND version=?${checkMembership ? " AND COALESCE((SELECT status FROM project_settings WHERE room_id=tasks.room_id),'active')='active' AND COALESCE((SELECT active FROM project_members WHERE room_id=tasks.room_id AND sender=?),1)=1" : ""}`)
      .bind(...columns.map(k=>change!.changes[k]),opKey,now,p.room,task.id,task.version,...(checkMembership?[p.sender]:[])));
  }
  const values = [p.room,p.sender,p.content,p.summary,p.kind,p.recipient,p.replyTo,p.clientId,now];
  const messageIndex = statements.length;
  statements.push(db.prepare(guarded
    ? `INSERT INTO messages(room_id,sender,content,summary,kind,recipient,reply_to,client_id,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tasks WHERE room_id=? AND id=? AND last_action_key=?) ON CONFLICT(room_id,sender,client_id) DO NOTHING RETURNING *`
    : `INSERT INTO messages(room_id,sender,content,summary,kind,recipient,reply_to,client_id,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(room_id,sender,client_id) DO NOTHING RETURNING *`)
    .bind(...values,...(guarded ? [p.room,task.id,opKey] : [])));
  if (p.kind === "task") {
    const f=p.fields;
    statements.push(db.prepare(`INSERT INTO tasks(id,room_id,title,description,criteria,requester,assigned_to,status,priority,due_at,needs_decision,last_action_key,created_at,updated_at)
      SELECT id,room_id,?,?,?,sender,recipient,'todo',?,?,?,?,created_at,created_at FROM messages WHERE room_id=? AND sender=? AND client_id=? ON CONFLICT(id) DO NOTHING`)
      .bind(f?.title || p.summary,f?.description || p.content,f?.criteria || "",f?.priority || "normal",f?.dueAt ?? null,f?.needsDecision || 0,opKey,p.room,p.sender,p.clientId));
    statements.push(db.prepare(`INSERT INTO task_events(room_id,task_id,message_id,actor,action,from_state,to_state,note,created_at)
      SELECT m.room_id,m.id,m.id,m.sender,'created',NULL,'todo',m.content,m.created_at FROM messages m WHERE m.room_id=? AND m.sender=? AND m.client_id=? ON CONFLICT(message_id) DO NOTHING`).bind(p.room,p.sender,p.clientId));
  } else if (task) {
    statements.push(db.prepare(`INSERT INTO task_events(room_id,task_id,message_id,actor,action,from_state,to_state,note,created_at)
      SELECT m.room_id,?,m.id,m.sender,?,?,t.status,m.content,m.created_at FROM messages m JOIN tasks t ON t.id=? AND t.room_id=m.room_id
      WHERE m.room_id=? AND m.sender=? AND m.client_id=? ON CONFLICT(message_id) DO NOTHING`)
      .bind(task.id,change!.action,task.status,task.id,p.room,p.sender,p.clientId));
  }
  const results = await db.batch<any>(statements);
  const inserted = results[messageIndex].results?.[0];
  const message = inserted || await db.prepare("SELECT * FROM messages WHERE room_id=? AND sender=? AND client_id=?").bind(p.room,p.sender,p.clientId).first<any>();
  if (!message) throw new TaskError(409, "任务或项目状态已变化，请刷新；本次操作未执行");
  if (!sameMessage(message,p)) throw new TaskError(409, "client_id 已用于其他内容");
  return { message, deduplicated: !inserted, task: p.kind === "task" ? await findTask(db,p.room,message.id) : task ? await findTask(db,p.room,task.id) : null };
}
export async function importTasks(db: D1Database, room: string) {
  const sources = await db.prepare("SELECT m.* FROM messages m WHERE m.room_id=? AND m.kind='task' AND NOT EXISTS(SELECT 1 FROM tasks t WHERE t.id=m.id) ORDER BY m.id LIMIT 50").bind(room).all<any>();
  if (!sources.results.length) return { imported: 0, has_more: false };
  let imported = 0;
  for (const source of sources.results) {
    const t = initialTask(source);
    const replies = await db.prepare("SELECT * FROM messages WHERE room_id=? AND reply_to=? AND kind IN ('claim','status','blocker','result') ORDER BY id LIMIT 500").bind(room,t.id).all<any>();
    for (const reply of replies.results) {
      const responsible = t.assignee === reply.sender || (!t.assignee && (!t.assigned_to || t.assigned_to === reply.sender));
      if (reply.kind === "claim" && !t.assignee && (!t.assigned_to || t.assigned_to === reply.sender)) { t.assignee=reply.sender; t.status="claimed"; }
      else if (responsible && reply.kind === "result") { t.assignee=reply.sender; t.status="review"; t.evidence=reply.content; t.blocker=""; }
      else if (responsible && reply.kind === "blocker") { t.status="blocked"; t.blocker=reply.content; t.waiting_for=reply.recipient; }
      else if (responsible && reply.kind === "status" && ["claimed","in_progress","blocked"].includes(t.status)) t.status="in_progress";
      t.updated_at=Math.max(t.updated_at,reply.created_at);
    }
    const result = await db.batch([insertTask(db,t),db.prepare(`INSERT INTO task_events(room_id,task_id,message_id,actor,action,from_state,to_state,note,created_at)
      SELECT ?,?,m.id,'system-import','imported',NULL,?,m.content,? FROM messages m JOIN tasks t ON t.id=m.id WHERE m.room_id=? AND m.id=? AND t.last_action_key=? ON CONFLICT(message_id) DO NOTHING`)
      .bind(room,t.id,t.status,Date.now(),room,t.id,t.last_action_key)]);
    imported+=result[0].meta.changes || 0;
  }
  return { imported, has_more: sources.results.length === 50 };
}
