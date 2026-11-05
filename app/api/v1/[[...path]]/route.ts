import { env } from "cloudflare:workers";
export const dynamic = "force-dynamic";
const KINDS = ["message", "status", "decision", "blocker", "handoff"];
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
  if (path === "/health" && method === "GET") {
    await db.prepare("SELECT id FROM rooms LIMIT 1").all();
    return json({ ok: true, service: "codex-relay", access: "public", api_version: 1 });
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
  const match = path.match(/^\/rooms\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})(\/messages)?$/);
  if (!match) fail(404, "接口不存在"); const roomId = match[1];
  const room = await db.prepare("SELECT * FROM rooms WHERE id=?").bind(roomId).first(); if (!room) fail(404, "房间不存在");
  if (!match[2] && method === "GET") return json({ room });
  if (match[2] && method === "GET") {
    const after = num(url.searchParams.get("after"), "after", 0); const before = num(url.searchParams.get("before"), "before", 0);
    if (url.searchParams.has("after") && url.searchParams.has("before")) fail(400, "after 与 before 不能同时使用");
    const incremental = url.searchParams.has("after"); const limit = Math.min(100, Math.max(1, num(url.searchParams.get("limit"), "limit", 50)));
    const result = incremental
      ? await db.prepare("SELECT * FROM messages WHERE room_id=? AND id>? ORDER BY id ASC LIMIT ?").bind(roomId, after, limit + 1).all<any>()
      : before ? await db.prepare("SELECT * FROM messages WHERE room_id=? AND id<? ORDER BY id DESC LIMIT ?").bind(roomId, before, limit + 1).all<any>()
      : await db.prepare("SELECT * FROM messages WHERE room_id=? ORDER BY id DESC LIMIT ?").bind(roomId, limit + 1).all<any>();
    const rows = result.results.slice(0, limit); if (!incremental) rows.reverse();
    return json({ messages: rows, has_more: result.results.length > limit, next_cursor: rows.at(-1)?.id ?? after, oldest_cursor: rows[0]?.id ?? null });
  }
  if (match[2] && method === "POST") {
    const data = await body(request); const sender = str(data.sender, "发送者", 80); const content = str(data.content, "消息", 16000);
    const kind = data.kind ?? "message"; if (!KINDS.includes(kind)) fail(400, "消息类型不支持");
    const recipient = str(data.recipient, "接收者", 80, true) || null; const clientId = str(data.client_id, "client_id", 128); const replyTo = data.reply_to ?? null;
    if (replyTo !== null) {
      if (!Number.isSafeInteger(replyTo) || replyTo <= 0) fail(400, "reply_to 必须是正整数");
      if (!await db.prepare("SELECT id FROM messages WHERE id=? AND room_id=?").bind(replyTo, roomId).first()) fail(400, "被回复消息不在当前房间");
    }
    const existing = await db.prepare("SELECT * FROM messages WHERE room_id=? AND sender=? AND client_id=?").bind(roomId, sender, clientId).first<any>();
    const same = (m: any) => m.content === content && m.kind === kind && m.recipient === recipient && m.reply_to === replyTo;
    if (existing) { if (!same(existing)) fail(409, "client_id 已用于其他内容"); return json({ message: existing, deduplicated: true }); }
    await rateLimit(request, "message", 60);
    const inserted = await db.prepare(`INSERT INTO messages(room_id,sender,content,kind,recipient,reply_to,client_id,created_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(room_id,sender,client_id) DO NOTHING RETURNING *`).bind(roomId, sender, content, kind, recipient, replyTo, clientId, Date.now()).first<any>();
    const message = inserted ?? await db.prepare("SELECT * FROM messages WHERE room_id=? AND sender=? AND client_id=?").bind(roomId, sender, clientId).first<any>();
    if (!same(message)) fail(409, "client_id 已用于其他内容"); return json({ message, deduplicated: !inserted }, inserted ? 201 : 200);
  }
  fail(405, "不支持的请求方法");
}
async function handle(request: Request) {
  try { return await route(request); } catch (error) {
    if (error instanceof ApiError) return json({ error: { message: error.message } }, error.status, error.status === 429 ? { "Retry-After": "60" } : {});
    console.error("Relay API failure", error instanceof Error ? error.message : "unknown");
    return json({ error: { message: "服务暂不可用，请重试" } }, 503);
  }
}
export const GET = handle;
export const POST = handle;
