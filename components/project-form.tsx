"use client";
import { useState,type FormEvent } from "react";
import { ArrowUpRight, Flag, LoaderCircle, Target } from "lucide-react";
import type { ProjectRecord } from "../lib/control-model";
import { ControlDialog,ControlError,controlApi } from "./control-ui";
export default function ProjectForm({project,onClose,onSaved}:{project?:ProjectRecord;onClose:()=>void;onSaved:(id:string)=>void}){
  const [id,setId]=useState(project?.id||""),[name,setName]=useState(project?.name||""),[description,setDescription]=useState(project?.description||""),[goal,setGoal]=useState(project?.goal||""),[milestone,setMilestone]=useState(project?.milestone||""),[status,setStatus]=useState(project?.project_status||"active"),[isTest,setIsTest]=useState(!!project?.is_test),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function save(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError("");
    try{const result=await controlApi(project?"/projects/"+project.id:"/projects",{method:project?"PATCH":"POST",body:JSON.stringify({id:id.trim(),name:name.trim(),description:description.trim(),goal:goal.trim(),milestone:milestone.trim(),status,is_test:isTest})});onSaved(result.project.id);}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <ControlDialog title={project?"项目设置":"新建项目"} subtitle={project?"目标与里程碑会保存在项目中":"每个项目有独立任务与主房间，成员不会混用上下文"} onClose={onClose}><form className="control-form" onSubmit={save}>
    <div className="control-form-grid"><label>项目名称<input value={name} onChange={e=>setName(e.target.value)} required maxLength={100} placeholder="例如 PoorKing"/></label><label>项目 ID<input value={id} onChange={e=>setId(e.target.value)} required disabled={!!project} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" maxLength={80} placeholder="例如 poorking"/></label></div>
    {!project&&<label>项目说明<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2} maxLength={2000} placeholder="简要说明项目范围"/></label>}
    <label><span><Target size={14}/>当前目标</span><textarea value={goal} onChange={e=>setGoal(e.target.value)} rows={2} maxLength={1000} placeholder="这阶段最重要的交付是什么？"/></label>
    <label><span><Flag size={14}/>里程碑</span><input value={milestone} onChange={e=>setMilestone(e.target.value)} maxLength={200} placeholder="例如 完成首轮可玩版本验收"/></label>
    {project&&<label>项目阶段<select value={status} onChange={e=>setStatus(e.target.value)}><option value="active">推进中</option><option value="paused">暂停</option><option value="archived">归档</option></select></label>}
    <label className="control-check"><input type="checkbox" checked={isTest} onChange={e=>setIsTest(e.target.checked)}/>测试项目（默认不计入总览）</label>
    {error&&<ControlError message={error}/>}<div className="control-form-actions"><button type="button" className="control-button" onClick={onClose}>取消</button><button className="control-primary" disabled={busy}>{busy?<LoaderCircle size={16}/>:<ArrowUpRight size={16}/>} {project?"保存":"创建并打开"}</button></div>
  </form></ControlDialog>;
}
