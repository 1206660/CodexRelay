import { env } from "cloudflare:workers";
import { DEFAULT_ROOM, guideText, validRoom, validRole,validSender } from "../../lib/agent-guide";
import { listMembers } from "../../lib/member-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const room = query.get("room") ?? DEFAULT_ROOM;
  const role = query.get("role");
  const sender=query.get("sender");
  if (query.getAll("room").length > 1 || query.getAll("role").length > 1 || query.getAll("sender").length>1 || !validRoom(room) || (role !== null && !validRole(role)) || (sender!==null&&!validSender(sender))) {
    return new Response("无效房间ID、角色或发言名。角色与姓名可自定义。", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(guideText(room, role ?? undefined,sender??undefined,env.DB?await listMembers(env.DB,room):[]), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
