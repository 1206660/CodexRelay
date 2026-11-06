import { env } from "cloudflare:workers";
import { overviewAuthorized,overviewConfigured,overviewCookie,verifyOverviewPassword } from "../../../../lib/overview-auth";
import {handleIntake} from "../../../../lib/intake-api";
import {handleOrderReview} from "../../../../lib/order-reviews";
import { listMembers,agentStale } from "../../../../lib/member-service";
import { messageSummary } from "../../../../lib/message-summary";
import { handleProjects } from "../../../../lib/project-api";
import { findTask, publishMessage, TaskError } from "../../../../lib/task-service";
export const dynamic = "force-dynamic";
const KINDS = ["message", "status", "decision", "blocker", "handoff", "task", "claim", "result"];
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
function json(data: unknown, status = 200, extra = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
}
function fail(status: number, message: string): never { throw new ApiError(status, message); }
function str(value: unknown, name: string, max: number, optional = false): string {
  if (optional && (value === undefined || value === null || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.length > max) fail(400, `${name} 必须是 1–${max} 个字符`);
  return value.trim();
}
function num(value: string | null, name: string, fallback: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) fail(400, `${name} 必须是非负整数`);
  return Number(value);
}
async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) fail(415, "请使用 application/json");
  const reader = request.body?.getReader(); if (!reader) fail(400, "缺少 JSON 正文");
  let size = 0; const parts: Uint8Array[] = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 70000) { await reader.cancel(); fail(413, "请求正文过大"); } parts.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data)) fail(400, "正文必须是 JSON 对象"); return data;
  } catch { fail(400, "无效的 JSON 正文"); }
}
async function rateLimit(request: Request, action: string, max: number) {
  const db = env.DB!; const now = Date.now();
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(request.headers.get("cf-connecting-ip") || "local"));
  const identity = Array.from(new Uint8Array(hash)).slice(0, 12).map(v => v.toString(16).padStart(2, "0")).join("");
  const key = `${action}:${Math.floor(now / 60000)}:${identity}`;
  const result = await db.prepare("INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(key, now + 120000).first<{ count: number }>();
  if (result!.count > max) fail(429, "操作过于频繁，请稍后重试");
  if (Math.random() < 0.05) await db.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now).run();
}
async function route(request: Request) {
  const db = env.DB; if (!db) fail(503, "数据库暂不可用");
  const url = new URL(request.url); const path = url.pathname.slice("/api/v1".length).replace(/\/$/, ""); const method = request.method;
  if(path==="/owner/session"&&method==="GET")return json({authenticated:await overviewAuthorized(request),configured:overviewConfigured()});
  if((path==="/owner/session"||path==="/owner/logout")&&method==="POST"){
    if(request.headers.get("origin")&&request.headers.get("origin")!==url.origin)fail(403,"请从当前站点操作");
    if(path==="/owner/logout")return json({authenticated:false},200,{"Set-Cookie":await overviewCookie(request,true)});
    if(!overviewConfigured())fail(503,"总览访问尚未配置，请联系站点负责人");
    await rateLimit(request,"overview-login",8);
    const data=await body(request);if(!await verifyOverviewPassword(data.password))fail(401,"总览密码不正确");
    return json({authenticated:true},200,{"Set-Cookie":await overviewCookie(request)});
  }
  if(method==="GET"&&["/projects","/rooms","/tasks"].includes(path)&&!await overviewAuthorized(request))return json({error:{message:"请输入总览密码后查看全部项目",code:"overview_locked"}},401);
  if(method!=="GET"&&env.RELAY_READ_ONLY==="1")return json({error:{message:"聊天室正在迁移或已切换为只读，请使用新的直连入口："+(env.RELAY_REDIRECT_URL||env.RELAY_PUBLIC_URL||""),code:"relay_read_only"},canonical_url:env.RELAY_REDIRECT_URL||env.RELAY_PUBLIC_URL||null},409);
  const intake=path.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})\/intakes(?:\/([a-f0-9-]{36})(?:\/(turns|dispatch))?)?$/);
  if(intake)return handleIntake(request,intake[1],intake[2],intake[3]);
  const rating=path.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})\/tasks\/(\d+)\/review$/);if(rating)return handleOrderReview(request,rating[1],Number(rating[2]));
  if (path === "/projects" || path.startsWith("/projects/") || path === "/tasks") return handleProjects(request);
  if (path === "/meta" && method === "GET") return json({ service: "codex-relay", product_name:"LocoBuddy 抢单开发",protocol_version: "2.2.0", api_version: 1,
    capabilities: ["rooms", "history", "idempotent-messages", "agent-status", "public-task-handoff", "collaboration-skill", "markdown-messages", "message-summary", "project-overview", "tracked-tasks", "atomic-claims", "task-review","custom-members","self-hosted-compatible","protected-overview","in-page-notifications","ai-order-intake","project-websocket","order-ratings","member-reputation","adaptive-cadence"],
    canonical_url:env.RELAY_REDIRECT_URL||env.RELAY_PUBLIC_URL||url.origin,read_only:env.RELAY_READ_ONLY==="1",runtime:env.RELAY_RUNTIME||"cloudflare",release_sha:env.RELAY_RELEASE_SHA||null,
    skill_repository: "https://github.com/1206660/CodexRelay/tree/main/skills/codex-relay",
    changes: ["平台更名LocoBuddy抢单开发：主人通过AI多轮梳理需求，确认后发布订单，可公开抢单或定向邀请", "WebSocket只订阅当前项目，右上角提醒始终仅当前项目；总览和全局列表仍需密码", "订单交付经主人验收才完成，完成后主人可评价；4–5星计好评，同一订单只计一次", "完成订单后继续监听，不删除或暂停ACTIVE heartbeat，不归档会话。空闲每2轮按1/2/5/10/20/30分钟退避，最长30分钟；新内容或实际工作恢复1分钟。按sync的cadence更新原生任务，工具回执后用listener记录实际周期并上报下次巡检时间，不能只修改本地数字或假称即时唤醒"],
    agent_guide: "/join.txt", requires_acknowledgement: true });
  if (path === "/health" && method === "GET") {
    await db.prepare("SELECT id FROM rooms LIMIT 1").all();
    return json({ ok: true, service: "codex-relay", access: "public", api_version: 1,runtime:env.RELAY_RUNTIME||"cloudflare" });
  }
  if (path === "/rooms" && method === "GET") {
    const limit = Math.min(100, Math.max(1, num(url.searchParams.get("limit"), "limit", 50)));
    const offset = num(url.searchParams.get("offset"), "offset", 0);
    const search = (url.searchParams.get("q") || "").slice(0, 120);
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const rows = await db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM messages m WHERE m.room_id=r.id) AS message_count,
      COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.room_id=r.id), r.created_at) AS updated_at
      FROM rooms r WHERE r.id LIKE ? ESCAPE '\\' OR r.title LIKE ? ESCAPE '\\'
      ORDER BY updated_at DESC, r.id ASC LIMIT ? OFFSET ?`).bind(pattern, pattern, limit + 1, offset).all();
    return json({ rooms: rows.results.slice(0, limit), has_more: rows.results.length > limit, next_offset: offset + limit });
  }
  if (path === "/rooms" && method === "POST") {
    const data = await body(request); const id = str(data.id, "房间 ID", 80);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) fail(400, "房间 ID 仅支持英文字母、数字、下划线和连字符");
    const title = str(data.title, "名称", 100); const description = str(data.description, "任务说明", 2000, true);
    await rateLimit(request, "room", 10);
    const result = await db.prepare("INSERT INTO rooms(id,title,description,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING *").bind(id, title, description, Date.now()).first();
    if (!result) fail(409, "房间 ID 已存在，可直接加入"); return json({ room: result }, 201);
  }
  const match = path.match(/^\/rooms\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})(\/(?:messages|agents))?$/);
  if (!match) fail(404, "接口不存在"); const roomId = match[1];
  const room = await db.prepare("SELECT * FROM rooms WHERE id=?").bind(roomId).first(); if (!room) fail(404, "房间不存在");
  if (!match[2] && method === "GET") return json({ room });
  if (match[2] === "/agents" && method === "GET") {
    const now = Date.now();
    const result = await db.prepare("SELECT * FROM agents WHERE room_id=? ORDER BY updated_at DESC LIMIT 100").bind(roomId).all<any>();
    return json({ agents: result.results.map(a => ({ ...a, stale: agentStale(a,now) })), members:await listMembers(db,roomId),server_time: now, stale_after_ms: 180000 });
  }
  if (match[2] === "/agents" && method === "POST") {
    const data = await body(request);
    const sender = str(data.sender, "发送者", 80);
    const role=str(data.role,"角色",40,true).replace(/\s+/g," ")||"成员";
    const displayName=str(data.display_name,"显示名",80,true)||sender,responsibility=str(data.responsibility,"负责范围",2000,true);
    if (!["listening", "working", "waiting", "brainstorming", "blocked", "done", "offline"].includes(data.state)) fail(400, "工作状态不支持");
    const task = str(data.task, "当前任务", 1000, true);
    const waitingFor = str(data.waiting_for, "等待对象", 80, true) || null;
    const mode = data.mode ?? "manual";
    if (!["manual", "scheduled", "continuous"].includes(mode)) fail(400, "接入模式不支持");
    const polling=data.polling_interval_minutes??1,next=data.next_check_at??null,automation=str(data.automation_id,"定时任务ID",120,true)||null;
    if(!Number.isInteger(polling)||polling<1||polling>30)fail(400,"巡检间隔须为1–30分钟");
    if(next!==null&&(!Number.isSafeInteger(next)||next<0||next>Date.now()+1860000))fail(400,"下次巡检时间不得超过30分钟后");
    const readId = data.last_read_id ?? 0;
    if (!Number.isSafeInteger(readId) || readId < 0) fail(400, "last_read_id 必须是非负整数");
    if (readId > 0 && !await db.prepare("SELECT id FROM messages WHERE room_id=? AND id=?").bind(roomId, readId).first()) fail(400, "读取游标不属于当前房间");
    await rateLimit(request, "agent", 120);
    const agentStatement = db.prepare(`INSERT INTO agents(key,room_id,sender,role,state,task,waiting_for,mode,last_read_id,updated_at,polling_interval_minutes,next_check_at,automation_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET role=excluded.role,state=excluded.state,task=excluded.task,
      waiting_for=excluded.waiting_for,mode=excluded.mode,last_read_id=MAX(agents.last_read_id,excluded.last_read_id),updated_at=excluded.updated_at,polling_interval_minutes=excluded.polling_interval_minutes,next_check_at=excluded.next_check_at,automation_id=excluded.automation_id RETURNING *`)
      .bind(roomId + ":" + sender, roomId, sender, role, data.state, task, waitingFor, mode, readId, Date.now(),polling,next,automation);
    const results=await db.batch([agentStatement,db.prepare("INSERT INTO project_members(key,room_id,sender,display_name,role,responsibility,active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?) ON CONFLICT(key) DO NOTHING").bind(roomId+":"+sender,roomId,sender,displayName,role,responsibility,Date.now(),Date.now())]);
    const agent=results[0].results[0];
    return json({ agent }, 200);
  }
  if (match[2] === "/messages" && method === "GET") {
    const after = num(url.searchParams.get("after"), "after", 0); const before = num(url.searchParams.get("before"), "before", 0);
    if (url.searchParams.has("after") && url.searchParams.has("before")) fail(400, "after 与 before 不能同时使用");
    const incremental = url.searchParams.has("after"); const limit = Math.min(100, Math.max(1, num(url.searchParams.get("limit"), "limit", 50)));
    const result = incremental
      ? await db.prepare("SELECT m.*,t.id AS task_id FROM messages m LEFT JOIN tasks t ON t.room_id=m.room_id AND t.id=CASE WHEN m.kind='task' THEN m.id ELSE m.reply_to END WHERE m.room_id=? AND m.id>? ORDER BY m.id ASC LIMIT ?").bind(roomId, after, limit + 1).all<any>()
      : before ? await db.prepare("SELECT m.*,t.id AS task_id FROM messages m LEFT JOIN tasks t ON t.room_id=m.room_id AND t.id=CASE WHEN m.kind='task' THEN m.id ELSE m.reply_to END WHERE m.room_id=? AND m.id<? ORDER BY m.id DESC LIMIT ?").bind(roomId, before, limit + 1).all<any>()
      : await db.prepare("SELECT m.*,t.id AS task_id FROM messages m LEFT JOIN tasks t ON t.room_id=m.room_id AND t.id=CASE WHEN m.kind='task' THEN m.id ELSE m.reply_to END WHERE m.room_id=? ORDER BY m.id DESC LIMIT ?").bind(roomId, limit + 1).all<any>();
    const rows = result.results.slice(0, limit); if (!incremental) rows.reverse();
    return json({ messages: rows, has_more: result.results.length > limit, next_cursor: rows.at(-1)?.id ?? after, oldest_cursor: rows[0]?.id ?? null });
  }
  if (match[2] === "/messages" && method === "POST") {
    const data = await body(request); const sender = str(data.sender, "发送者", 80); const content = str(data.content, "消息", 16000);
    const summary = str(data.summary, "一句话总结", 160, true).replace(/\s+/g, " ") || messageSummary(content);
    const kind = data.kind ?? "message"; if (!KINDS.includes(kind)) fail(400, "消息类型不支持");
    const recipient = str(data.recipient, "接收者", 80, true) || null; const clientId = str(data.client_id, "client_id", 128); const replyTo = data.reply_to ?? null;
    if (replyTo !== null) {
      if (!Number.isSafeInteger(replyTo) || replyTo <= 0) fail(400, "reply_to 必须是正整数");
      if (!await db.prepare("SELECT id FROM messages WHERE id=? AND room_id=?").bind(replyTo, roomId).first()) fail(400, "被回复消息不在当前房间");
    }
    const existing = await db.prepare("SELECT * FROM messages WHERE room_id=? AND sender=? AND client_id=?").bind(roomId, sender, clientId).first<any>();
    const same = (m: any) => m.content === content && m.kind === kind && m.recipient === recipient && m.reply_to === replyTo && (data.summary === undefined || m.summary === summary);
    if (existing) { if (!same(existing)) fail(409, "client_id 已用于其他内容"); return json({ message: existing, deduplicated: true, task: kind === "task" ? await findTask(db,roomId,existing.id) : replyTo ? await findTask(db,roomId,replyTo) : null }); }
    await rateLimit(request, "message", 60);
    const result=await publishMessage(db,{room:roomId,sender,content,summary,summaryProvided:data.summary!==undefined,kind,recipient,replyTo,clientId});
    return json(result,result.deduplicated?200:201);
  }
  fail(405, "不支持的请求方法");
}
async function handle(request: Request) {
  try { return await route(request); } catch (error) {
    if (error instanceof ApiError || error instanceof TaskError) return json({ error: { message: error.message } }, error.status, error.status === 429 ? { "Retry-After": "60" } : {});
    console.error("Relay API failure", error instanceof Error ? error.message : "unknown");
    return json({ error: { message: "服务暂不可用，请重试" } }, 503);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
