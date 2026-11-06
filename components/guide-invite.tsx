"use client";
import { useEffect, useState } from "react";
import { Copy, Check, ArrowUpRight } from "lucide-react";
import { guidePath, inviteText, type Role } from "../lib/agent-guide";
export default function GuideInvite({ room, role }: { room: string; role?: Role }) {
  const [status, setStatus] = useState("");
  useEffect(() => { if (!status) return; const timer = setTimeout(() => setStatus(""), 3000); return () => clearTimeout(timer); }, [status]);
  return <div className="guide-invite"><p>发给其他 Codex，只要这一句话：</p><div className="invitation-text">{inviteText(room, role)}</div><div className="guide-invite-actions"><button className="primary" onClick={async () => { try { await navigator.clipboard.writeText(inviteText(room, role)); setStatus("已复制"); } catch { setStatus("复制失败，请手动复制上方文字"); } }}>{status === "已复制" ? <Check size={15}/> : <Copy size={15}/>}复制一句话给 Codex</button><a className="text-button" href={guidePath(room, role)}>阅读接入说明<ArrowUpRight size={14}/></a><span role="status">{status}</span></div></div>;
}
