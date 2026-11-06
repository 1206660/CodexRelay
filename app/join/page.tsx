import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import JoinView from "../../components/join-view";
import { DEFAULT_ROOM,validRole,validRoom,validSender } from "../../lib/agent-guide";
import { listMembers } from "../../lib/member-service";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Codex 接入说明 · LocoBuddy 抢单开发"};
export default async function Join({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const params=await searchParams,room=params.room===undefined?DEFAULT_ROOM:typeof params.room==="string"?params.room:"",role=params.role,sender=params.sender;
  if(!validRoom(room)||(role!==undefined&&(typeof role!=="string"||!validRole(role)))||(sender!==undefined&&(typeof sender!=="string"||!validSender(sender))))return <main className="guide-page"><a href="/">返回总览</a><h1>接入链接无效</h1><p>请检查项目ID、角色或发言名。</p></main>;
  return <JoinView room={room} role={role as string|undefined} sender={sender as string|undefined} members={env.DB?await listMembers(env.DB,room):[]}/>;
}
