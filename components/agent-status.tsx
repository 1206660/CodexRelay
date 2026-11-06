"use client";
import { useEffect, useState } from "react";
import { Activity, AlertCircle } from "lucide-react";
import { ROLES, senderFor, guidePath, type Role } from "../lib/agent-guide";
type Agent = { sender: string; role: Role; state: string; task: string; waiting_for: string | null; mode: string; last_read_id: number; updated_at: number };
const STATES: Record<string, string> = { listening: "监听中", working: "工作中", waiting: "等待消息", brainstorming: "脑暴中", blocked: "遇到阻塞", done: "本项已完成", offline: "已停止" };
const MODES: Record<string, string> = { manual: "手动接入", scheduled: "定时巡检", continuous: "本轮持续监听" };
export default function AgentStatus({ room, onOwner }: { room: string; onOwner: () => void }) {
  const [data, setData] = useState<Agent[]>([]), [error, setError] = useState(""), [now, setNow] = useState(Date.now()), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); let busy = false, stopped = false;
    setData([]); setError(""); setLoading(true);
    async function update() {
      if (busy || stopped || document.hidden) return; busy = true;
      try { const response = await fetch(`/api/v1/rooms/${room}/agents`, { signal: controller.signal });
        const body: any = await response.json(); if (!response.ok) throw new Error(body.error?.message || "状态读取失败");
        if (!stopped) { setData(body.agents); setNow(body.server_time); setError(""); }
      } catch (e: any) { if (!stopped && e.name !== "AbortError") setError(e.message); }
      finally { busy = false; if (!stopped) setLoading(false); }
    }
    void update(); const timer = setInterval(() => { setNow(t => t + 5000); void update(); }, 5000);
    const focus = () => void update(); window.addEventListener("focus", focus);
    return () => { stopped = true; controller.abort(); clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [room]);
  return <section className="agent-status" aria-label="AI 工作状态"><div className="agent-status-heading"><span><Activity size={14}/>AI 工作状态</span><small>由 Codex 上报 · 3 分钟未更新标为过期</small><button className="text-button" onClick={onOwner}>主人发需求 →</button></div>
    {error && <p className="agent-status-error" role="status"><AlertCircle size={12}/>{error}；保留上次记录</p>}
    <div className="agent-status-grid">{(Object.keys(ROLES) as Role[]).map(role => {
      const matching = data.filter(a => a.role === role);
      const agent = matching.find(a => a.sender === senderFor(room, role)) ?? matching[0];
      const stale = !!agent && now - agent.updated_at > 180000;
      const status = !agent ? (loading ? "读取中" : "尚未报到") : stale ? "状态过期" : STATES[agent.state] || agent.state;
      return <article key={role} className={`agent-card ${!agent || stale ? "inactive" : agent.state}`}><div className="agent-card-head"><strong>{ROLES[role].label}</strong><span>{status}</span></div>
        <p>{agent ? agent.task || "未填写当前任务" : "尚无实时状态，不能确认是否在运行"}</p>
        {agent?.waiting_for && <div className="agent-waiting">等待：{agent.waiting_for}</div>}
        <div className="agent-card-footer">{agent ? <><span>{MODES[agent.mode] || agent.mode}</span><time title={new Date(agent.updated_at).toLocaleString("zh-CN")}>{Math.max(0, Math.floor((now - agent.updated_at) / 1000)) < 60 ? "刚刚更新" : `${Math.max(1, Math.floor((now - agent.updated_at) / 60000))} 分钟前`}</time></> : <a href={guidePath(room, role)}>接入该负责人 ↗</a>}</div>
        {agent && <small className="agent-sender">{agent.sender} · 已读 #{agent.last_read_id}</small>}
      </article>;
    })}</div></section>;
}
