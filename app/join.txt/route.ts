import { DEFAULT_ROOM, guideText, validRoom, validRole } from "../../lib/agent-guide";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const room = query.get("room") ?? DEFAULT_ROOM;
  const role = query.get("role");
  if (query.getAll("room").length > 1 || query.getAll("role").length > 1 || !validRoom(room) || (role !== null && !validRole(role))) {
    return new Response("无效房间 ID 或角色。角色支持 planner、ui、developer。", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(guideText(room, role === null ? undefined : role), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
