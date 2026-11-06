"use client";
import { useRef,useState,type FormEvent } from "react";
import { ArrowUpRight,CalendarClock,Flag,LoaderCircle,Target,UserRound } from "lucide-react";
import type { ProjectRecord } from "../lib/control-model";
import { ControlDialog,ControlError,controlApi } from "./control-ui";
export default function TaskForm({project,actor,onClose,onSaved}:{project:ProjectRecord;actor:string;onClose:()=>void;onSaved:(id:number)=>void}){
  const [title,setTitle]=useState(""),[description,setDescription]=useState(""),[criteria,setCriteria]=useState(""),[assigned,setAssigned]=useState(""),[priority,setPriority]=useState("normal"),[deadline,setDeadline]=useState(""),[decision,setDecision]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const pending=useRef<{payload:string;id:string}|null>(null);
  const people=project.members.filter(m=>m.active);
  async function save(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError("");
    const payload=JSON.stringify({actor,title:title.trim(),description:description.trim(),criteria:criteria.trim(),assigned_to:assigned.trim()||null,priority,due_at:deadline?new Date(deadline).getTime():null,needs_decision:decision});
    if(pending.current?.payload!==payload)pending.current={payload,id:crypto.randomUUID()};
    try{const result=await controlApi("/projects/"+project.id+"/tasks",{method:"POST",body:JSON.stringify({...JSON.parse(payload),client_id:pending.current.id})});onSaved(result.task.id);}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <ControlDialog title="派发任务" subtitle={project.name+" · 任务会同步到项目群聊，全员可见"} onClose={onClose} wide><form className="control-form" onSubmit={save}>
    <label><span><Target size={14}/>一句话目标</span><input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={160} placeholder="谁需要交付什么，达到什么结果？"/></label>
    <label>任务说明<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={4} maxLength={12000} placeholder="支持 Markdown；写清范围、依赖和必要上下文"/></label>
    <label>交付与验收<textarea value={criteria} onChange={e=>setCriteria(e.target.value)} rows={3} maxLength={2500} placeholder="预期成果、验证方式、完成条件；新 UI 需要关键实机图"/></label>
    <div className="control-form-grid"><label><span><UserRound size={14}/>负责人</span><input list="task-people" value={assigned} onChange={e=>setAssigned(e.target.value)} maxLength={80} placeholder="留空待认领"/><datalist id="task-people">{people.map(person=><option key={person.sender} value={person.sender}>{person.display_name} · {person.role_label}</option>)}</datalist></label><label><span><Flag size={14}/>优先级</span><select value={priority} onChange={e=>setPriority(e.target.value)}><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label></div>
    <label><span><CalendarClock size={14}/>截止时间（可选）</span><input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label>
    <label className="control-check"><input type="checkbox" checked={decision} onChange={e=>setDecision(e.target.checked)}/>有事项需要主人决定</label>
    {error&&<ControlError message={error}/>}<div className="control-form-actions"><span className="control-muted">派发人：{actor}</span><button className="control-primary" disabled={busy}>{busy?<LoaderCircle size={16}/>:<ArrowUpRight size={16}/>}公开派发</button></div>
  </form></ControlDialog>;
}
