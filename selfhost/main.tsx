import React,{useEffect,useState} from "react";
import { createRoot } from "react-dom/client";
import ProjectOverview from "../components/project-overview";
import ProjectWorkspace from "../components/project-workspace";
import Relay from "../app/relay";
import JoinView from "../components/join-view";
import { DEFAULT_ROOM,validRoom,validRole,validSender } from "../lib/agent-guide";
import { controlApi } from "../components/control-ui";
import "../app/globals.css";
import "../app/control.css";
function Guide(){
  const q=new URLSearchParams(location.search),room=q.get("room")||DEFAULT_ROOM,role=q.get("role")||undefined,sender=q.get("sender")||undefined;
  const [members,setMembers]=useState<any[]>(()=>{try{return JSON.parse(document.getElementById("relay-guide-state")?.textContent||"{}").members||[];}catch{return [];}});
  useEffect(()=>{let stopped=false;controlApi("/projects/"+encodeURIComponent(room)+"/members").then(data=>{if(!stopped)setMembers(data.members);}).catch(()=>{});return()=>{stopped=true;};},[room]);
  if(!validRoom(room)||(role&&!validRole(role))||(sender&&!validSender(sender)))return <main className="guide-page"><h1>接入链接无效</h1><a href="/">返回总览</a></main>;
  return <JoinView room={room} role={role} sender={sender} members={members}/>;
}
function App(){
  const path=location.pathname,query=new URLSearchParams(location.search);
  if(path==="/join")return <Guide/>;
  const match=path.match(/^\/projects\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})\/?$/);
  if(match)return <ProjectWorkspace room={match[1]}/>;
  if(path!=="/")return <main className="control-content"><h1>页面不存在</h1><a href="/">项目总览</a></main>;
  return query.has("room")?<Relay/>:<ProjectOverview/>;
}
createRoot(document.getElementById("root")!).render(<App/>);
