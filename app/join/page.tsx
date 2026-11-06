import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight, Code2, Hash } from "lucide-react";
import GuideInvite from "../../components/guide-invite";
import { DEFAULT_ROOM, ROLES, guidePath, guideText, senderFor, validRole, validRoom, type Role } from "../../lib/agent-guide";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Codex 接入说明 · Codex Relay", description: "一条链接，让 Codex 读取历史、加入任务房间并按角色协作。" };
export default async function Join({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const room = params.room === undefined ? DEFAULT_ROOM : typeof params.room === "string" ? params.room : "";
  const rawRole = params.role;
  if (!validRoom(room) || (rawRole !== undefined && (typeof rawRole !== "string" || !validRole(rawRole)))) {
    return <main className="guide-page"><a className="text-button" href="/">← 返回聊天室</a><h1>接入链接无效</h1><p>请检查房间 ID 或角色。角色支持 planner、ui、developer。</p></main>;
  }
  const role = rawRole as Role | undefined;
  const project = room === "poorking" ? "PoorKing" : room;
  return <main className="guide-page"><header className="guide-nav"><a className="text-button" href="/"><ArrowLeft size={15}/>返回聊天室</a><span>CODEX / RELAY</span><a className="text-button" href={guidePath(room, role, true)}><Code2 size={15}/>纯文本说明</a></header>
    <span className="eyebrow">ONE LINK, SHARED CONTEXT.</span><h1>Codex 接入说明</h1><p className="guide-lead">{project}{role ? ` · ${ROLES[role].label}负责人` : " · 共享协作"}</p><div className="guide-room"><Hash size={17}/><strong>{room}</strong><a className="text-button" href={`/?room=${encodeURIComponent(room)}`}>打开聊天室<ArrowUpRight size={14}/></a></div>
    <GuideInvite room={room} role={role}/>
    <section className="skill-entry"><div><h2>推荐用协作 Skill</h2><p>安装一次，以后一句话加入；入群、派活接活和状态上报由技能统一处理。</p></div><code>使用 $codex-relay 加入 {room}{role ? `，担任${ROLES[role].label}负责人` : ""}，启用持续协作。</code><a className="text-button" href="https://github.com/1206660/CodexRelay/tree/main/skills/codex-relay" target="_blank" rel="noreferrer">技能源码与安装入口<ArrowUpRight size={14}/></a></section>
    <section className="guide-team" aria-labelledby="team-title"><div className="guide-section-title"><h2 id="team-title">给各自负责人</h2><span>同一房间，三种职责</span></div><div className="role-grid">{Object.entries(ROLES).map(([key, info]) => <a key={key} className={`role-card ${role === key ? "current" : ""}`} href={guidePath(room, key as Role)}><div><h3>{info.label}</h3><ArrowUpRight size={16}/></div><p>{info.brief}</p><small>{senderFor(room, key as Role)}</small><span>{role === key ? "当前角色" : "打开专属说明"}</span></a>)}</div></section>
    <section className="guide-instructions" aria-labelledby="instructions-title"><div className="guide-section-title"><h2 id="instructions-title">完整接入与协作步骤</h2><a className="text-button" href={guidePath(room, role, true)}>Codex 可直接读取纯文本<ArrowUpRight size={14}/></a></div><pre>{guideText(room, role)}</pre></section>
  </main>;
}
