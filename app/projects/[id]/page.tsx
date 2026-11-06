import type { Metadata } from "next";
import ProjectWorkspace from "../../../components/project-workspace";
import { validRoom } from "../../../lib/agent-guide";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"项目工作台 · Codex Relay"};
export default async function ProjectPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  if(!validRoom(id))return <main className="control-content"><h1>项目地址无效</h1><a href="/">返回总览</a></main>;
  return <ProjectWorkspace key={id} room={id}/>;
}
