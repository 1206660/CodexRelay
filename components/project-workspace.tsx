"use client";
import { useEffect,useState } from "react";
import { AlertTriangle,ArrowLeft,ArrowRight,Archive,CalendarClock,CheckCheck,ChevronLeft,ChevronRight,ClipboardCheck,ExternalLink,Flag,History,Inbox,Layers3,ListTodo,LoaderCircle,MessageSquare,PauseCircle,Plus,RefreshCw,Search,Settings2,Target,Users } from "lucide-react";
import type { ProjectList,ProjectRecord,TaskRecord } from "../lib/control-model";
import { TASK_STATES } from "../lib/control-model";
import Relay from "../app/relay";
import AgentStatus from "./agent-status";
import ControlShell from "./control-shell";
import ProjectForm from "./project-form";
import TaskForm from "./task-form";
import TaskDetails from "./task-details";
import MemberPanel from "./member-panel";
import MessageBody from "./message-body";
import { ControlError,Empty,StatusTag,controlApi,since,useLive } from "./control-ui";
export default function ProjectWorkspace({room}:{room:string}){
  const [tab,setTab]=useState("tasks"),[filter,setFilter]=useState("all"),[query,setQuery]=useState(""),[search,setSearch]=useState(""),[offset,setOffset]=useState(0),[selected,setSelected]=useState<number|null>(null);
  const [newProject,setNewProject]=useState(false),[edit,setEdit]=useState(false),[newTask,setNewTask]=useState(false),[syncing,setSyncing]=useState(false),[actionError,setActionError]=useState(""),[toast,setToast]=useState("");
  const actor=room.slice(0,60)+"-owner";
  useEffect(()=>{const q=new URLSearchParams(location.search);const panel=q.get("tab");if(panel&&["tasks","members","activity","deliveries","chat"].includes(panel))setTab(panel);if(q.get("filter"))setFilter(q.get("filter")!);const id=Number(q.get("task"));if(Number.isSafeInteger(id)&&id>0)setSelected(id);},[]);
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setOffset(0);},200);return()=>clearTimeout(timer);},[query]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(""),2800);return()=>clearTimeout(timer);},[toast]);
  const list=useLive<ProjectList>("/projects?limit=100",12000),live=useLive<{project:ProjectRecord;server_time:number}>("/projects/"+room);
  const tasks=useLive<{tasks:TaskRecord[];total:number;has_more:boolean}>(tab==="tasks"||tab==="deliveries"?"/projects/"+room+"/tasks?"+new URLSearchParams({filter:tab==="deliveries"?"deliveries":filter,q:search,limit:"40",offset:String(offset)}):null);
  const activity=useLive<{messages:any[]}>(tab==="activity"?"/rooms/"+room+"/messages?limit=60":null);
  const project=live.data?.project;
  function changeTab(value:string){setTab(value);setOffset(0);const q=new URLSearchParams(location.search);q.set("tab",value);q.delete("task");history.replaceState(null,"","?"+q.toString());}
  function selectTask(id:number|null){setSelected(id);const q=new URLSearchParams(location.search);if(id)q.set("task",String(id));else q.delete("task");history.replaceState(null,"","?"+q.toString());}
  function changed(){tasks.reload();live.reload();list.reload();activity.reload();setToast("已同步到任务与项目群聊");}
  async function sync(){if(syncing)return;setSyncing(true);setActionError("");let count=0;
    try{let more=true;while(more){const r=await controlApi("/projects/"+room+"/sync",{method:"POST",body:"{}"});count+=r.imported;more=r.has_more;}changed();setToast("已登记 "+count+" 项历史派活");}catch(e:any){setActionError(e.message);}finally{setSyncing(false);}
  }
  return <ControlShell projects={project?[project,...(list.data?.projects||[]).filter(p=>p.id!==project.id)]:list.data?.projects||[]} activeId={room} onCreate={()=>setNewProject(true)}><div className="control-content project-content">
    <a className="control-back" href="/"><ArrowLeft size={14}/>所有项目</a>
    {live.error&&<ControlError message={live.error} onRetry={live.reload}/>}
    {!project?<Empty icon={<LoaderCircle size={28}/>}>{live.error?"未能打开项目":"正在读取项目…"}</Empty>:<>
      <header className="control-page-head project-page-head"><div><div className="control-eyebrow">PROJECT / {project.id}</div><h1>{project.name}{project.project_status!=="active"&&<span className="project-stage-badge">{project.project_status==="paused"?<PauseCircle size={16}/>:<Archive size={16}/>} {project.project_status==="paused"?"已暂停":"已归档"}</span>}</h1></div><div className="control-head-actions"><button className="control-icon" aria-label="刷新项目" onClick={()=>{live.reload();tasks.reload();activity.reload();}}><RefreshCw size={17}/></button><button className="control-icon" aria-label="项目设置" onClick={()=>setEdit(true)}><Settings2 size={18}/></button><button className="control-primary" onClick={()=>setNewTask(true)} disabled={project.project_status==="archived"}><Plus size={17}/>派活</button></div></header>
      <div className="project-goal-strip"><div><span><Target size={14}/>当前目标</span><strong title={project.goal}>{project.goal||"尚未填写目标"}{!project.goal&&<button className="control-text-link" onClick={()=>setEdit(true)}>补充 →</button>}</strong>{project.milestone&&<small><Flag size={12}/>{project.milestone}</small>}</div><div className="project-header-progress">{project.total_tasks?<><span><b>{project.done_tasks}</b> / {project.total_tasks}<CheckCheck size={15}/></span><progress value={project.done_tasks} max={project.total_tasks} aria-label={"已验收"+project.done_tasks+"/"+project.total_tasks}/><small>已验收 · 未取消任务</small></>:<span className="control-muted">尚未拆任务</span>}</div></div>
      {(project.owner_tasks>0||project.blocked_tasks>0||project.untracked_tasks>0)&&<div className="project-focus-bar">
        {project.review_tasks>0&&<button onClick={()=>{changeTab("tasks");setFilter("review");}}><ClipboardCheck size={15}/><b>{project.review_tasks}</b>待验收</button>}
        {project.decision_tasks>0&&<button onClick={()=>{changeTab("tasks");setFilter("attention");}}><HelpIcon/><b>{project.decision_tasks}</b>待决策</button>}
        {project.blocked_tasks>0&&<button className="blocked" onClick={()=>{changeTab("tasks");setFilter("blocked");}}><AlertTriangle size={15}/><b>{project.blocked_tasks}</b>阻塞</button>}
        {project.untracked_tasks>0&&<button onClick={sync} disabled={syncing}>{syncing?<LoaderCircle size={15}/>:<History size={15}/>}登记历史派活 · {project.untracked_tasks}</button>}
      </div>}
      {actionError&&<ControlError message={actionError}/>}
      <div className="project-team-strip"><AgentStatus room={room} onOwner={()=>changeTab("chat")} onManage={()=>changeTab("members")}/></div>
      <div className="workspace-tabs" role="tablist" aria-label="项目工作区">{[["tasks","任务",ListTodo],["members","成员",Users],["activity","动态",History],["deliveries","成果",CheckCheck],["chat","群聊",MessageSquare]].map(([id,label,Icon]:any)=><button key={id} id={"tab-"+id} role="tab" aria-controls={"panel-"+id} aria-selected={tab===id} className={tab===id?"selected":""} onClick={()=>changeTab(id)}><Icon size={17}/>{label}{id==="tasks"&&<small>{project.total_tasks}</small>}{id==="deliveries"&&project.review_tasks>0&&<b>{project.review_tasks}</b>}</button>)}</div>
      <section id={"panel-"+tab} role="tabpanel" aria-labelledby={"tab-"+tab} className={"workspace-panel "+(tab==="chat"?"chat-panel":"")}>
      {tab==="members"?<MemberPanel room={room} members={project.members} onChanged={()=>{live.reload();list.reload();}}/>:tab==="chat"?<Relay initialRoom={room} embedded/>:tab==="activity"?<div className="activity-feed">{activity.error&&<ControlError message={activity.error} onRetry={activity.reload}/>}
        {!activity.data?.messages.length?<Empty icon={<History size={27}/>}>{activity.loading?"正在读取动态…":"暂无协作动态"}</Empty>:activity.data.messages.slice().reverse().map(m=><article key={m.id} className="activity-message"><div className="activity-marker"><MessageSquare size={15}/></div><div><div className="activity-meta"><strong>{m.sender}</strong><span className={"activity-kind kind-"+m.kind}>{({task:"派活",claim:"接活",result:"交付",status:"进展",blocker:"阻塞",decision:"决策",handoff:"交接"} as Record<string,string>)[m.kind]||"消息"}</span><time>{since(m.created_at)}</time><small>#{m.id}</small></div>{m.task_id?<button className="control-text-link" onClick={()=>selectTask(m.task_id)}>↳ 任务 #{m.task_id}</button>:m.reply_to?<span className="control-muted">↳ 消息 #{m.reply_to}</span>:null}<MessageBody content={m.content} summary={m.summary}/></div></article>)}
        <a className="control-text-link" href={"/?room="+room+"&as=owner"}><ExternalLink size={13}/>打开完整历史</a></div>:
      <><div className="task-list-toolbar">{tab==="tasks"?<select aria-label="筛选任务状态" value={filter} onChange={e=>{setFilter(e.target.value);setOffset(0);}}><option value="all">全部任务</option><option value="open">未结束</option><option value="attention">待我处理</option><option value="overdue">逾期</option>{Object.entries(TASK_STATES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>:<span className="control-muted"><CheckCheck size={15}/>交付记录与验收状态</span>}<label className="control-search"><Search size={15}/><input aria-label="搜索任务" value={query} onChange={e=>setQuery(e.target.value)} placeholder="任务、负责人或 #编号"/></label></div>
        {tasks.error&&<ControlError message={tasks.error} onRetry={tasks.reload}/>}
        {!tasks.data?.tasks.length?<Empty icon={tab==="deliveries"?<ClipboardCheck size={30}/>:<ListTodo size={30}/>}>{tasks.loading?"正在读取任务…":tab==="deliveries"?"尚未提交成果":"暂无符合条件的任务"}{tab==="tasks"&&<button className="control-primary" onClick={()=>setNewTask(true)}><Plus size={15}/>派发第一项任务</button>}</Empty>:
        <div className="task-table-wrap"><table className="task-table"><thead><tr><th>任务 / 目标</th><th>负责人</th><th>状态</th><th>焦点</th><th>更新</th></tr></thead><tbody>{tasks.data.tasks.map(task=><tr key={task.id} onClick={()=>selectTask(task.id)}>
          <td><button className="task-title-button" onClick={e=>{e.stopPropagation();selectTask(task.id);}}><small>#{task.id}</small><strong>{task.title}</strong>{task.priority==="high"&&<Flag size={13} className="priority-high"/>}</button></td>
          <td><span className="task-person"><Users size={13}/>{project.members.find(m=>m.sender===(task.assignee||task.assigned_to))?.display_name||task.assignee||task.assigned_to||"待接单"}</span>{task.assignee&&task.assigned_to&&task.assignee!==task.assigned_to&&<small className="control-muted">原指定 {task.assigned_to}</small>}</td>
          <td><StatusTag state={task.status}/></td>
          <td className="task-focus">{task.needs_decision===1&&<span title={task.decision_note}><HelpIcon/>待决策</span>}{task.status==="blocked"&&<span title={task.blocker}><AlertTriangle size={13}/>{task.waiting_for?"等 "+task.waiting_for:"查看卡点"}</span>}{task.due_at&&<span className={task.due_at<Date.now()&&!["done","cancelled"].includes(task.status)?"text-overdue":""} title={new Date(task.due_at).toLocaleString("zh-CN")}><CalendarClock size={13}/>{new Date(task.due_at).toLocaleDateString("zh-CN",{month:"2-digit",day:"2-digit"})}</span>}{!task.needs_decision&&task.status!=="blocked"&&!task.due_at&&"—"}</td>
          <td className="task-updated">{since(task.updated_at)}</td>
        </tr>)}</tbody></table></div>}
        <div className="control-list-footer"><span>{tasks.data?.total||0} 项 · 点击任务查看过程与证据</span><div><button className="control-icon" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-40))} aria-label="上一页任务"><ChevronLeft size={17}/></button><button className="control-icon" disabled={!tasks.data?.has_more} onClick={()=>setOffset(offset+40)} aria-label="下一页任务"><ChevronRight size={17}/></button></div></div>
      </>}
      </section>
    </>}
    </div>
    {newProject&&<ProjectForm onClose={()=>setNewProject(false)} onSaved={id=>location.assign("/projects/"+id)}/>}
    {edit&&project&&<ProjectForm project={project} onClose={()=>setEdit(false)} onSaved={()=>{setEdit(false);live.reload();list.reload();setToast("项目设置已保存");}}/>}
    {newTask&&project&&<TaskForm project={project} actor={actor} onClose={()=>setNewTask(false)} onSaved={id=>{setNewTask(false);changeTab("tasks");selectTask(id);changed();}}/>}
    {selected&&<TaskDetails key={selected} room={room} id={selected} actor={actor} onClose={()=>selectTask(null)} onChanged={changed}/>}
    {toast&&<div className="control-toast" role="status"><CheckCheck size={16}/>{toast}</div>}
  </ControlShell>;
}
function HelpIcon(){return <span className="small-help-icon" aria-hidden="true">?</span>;}
