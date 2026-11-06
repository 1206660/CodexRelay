"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, ArrowDown, Check, ChevronDown, Code2, Copy, Download, Hash, Menu, MessageSquare, Plus, Radio, Search, Send, X, ArrowLeft, AlertCircle } from "lucide-react";
import GuideInvite from "../components/guide-invite";
import { DEFAULT_ROOM, ROLES, senderFor, guidePath, inviteText } from "../lib/agent-guide";
import AgentStatus from "../components/agent-status";

type Room = { id: string; title: string; description: string; message_count?: number; updated_at?: number };
type Message = { id: number; room_id: string; sender: string; content: string; kind: string; recipient: string | null; reply_to: number | null; created_at: number };
const labels: Record<string, string> = { message: "消息", task: "派活", claim: "接活", status: "进展", decision: "决策", blocker: "阻塞", handoff: "交接", result: "交付" };
async function api(path: string, init?: RequestInit) {
  const response = await fetch("/api/v1" + path, init);
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "连接失败，请重试");
  return data;
}
function stamp(time: number) { return new Date(time).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }
export default function Relay() {
  const [rooms, setRooms] = useState<Room[]>([]), [selected, setSelected] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]), [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(false), [listLoading, setListLoading] = useState(true), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [moreRooms, setMoreRooms] = useState(false);
  const [name, setName] = useState(""), [draft, setDraft] = useState(""), [recipient, setRecipient] = useState(""), [kind, setKind] = useState("message");
  const [reply, setReply] = useState<Message | null>(null), [sending, setSending] = useState(false), [sync, setSync] = useState("等待连接");
  const [modal, setModal] = useState<"create" | "connect" | null>(null), [mobile, setMobile] = useState(false), [toast, setToast] = useState("");
  const [formError, setFormError] = useState(""), [creating, setCreating] = useState(false), [exporting, setExporting] = useState(false);
  const [roomId, setRoomId] = useState(""), [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [unseen, setUnseen] = useState(false);
  const selectedRef = useRef<string | null>(null), cursor = useRef(0), scroll = useRef<HTMLDivElement>(null), nearBottom = useRef(true);
  const pending = useRef<{ key: string; payload: string } | null>(null), searchGeneration = useRef(0), sendLock = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null), triggerRef = useRef<HTMLElement | null>(null), modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const query = new URLSearchParams(location.search); const id = query.get("room"); setName(query.get("as") === "owner" && id ? id.slice(0, 60) + "-owner" : localStorage.getItem("relay.sender") || "");
    if (id) api("/rooms/" + encodeURIComponent(id)).then(d => choose(d.room)).catch(e => setError(e.message));
  }, []);
  useEffect(() => { if (name.trim()) localStorage.setItem("relay.sender", name.trim()); }, [name]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 2500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const generation = ++searchGeneration.current; setListLoading(true);
    const timer = setTimeout(() => { api("/rooms?q=" + encodeURIComponent(query)).then(d => {
      if (generation === searchGeneration.current) { setRooms(d.rooms); setMoreRooms(d.has_more); }
    }).catch(e => { if (generation === searchGeneration.current) setError(e.message); }).finally(() => { if (generation === searchGeneration.current) setListLoading(false); }); }, 200);
    return () => clearTimeout(timer);
  }, [query]);
  function choose(room: Room) {
    selectedRef.current = room.id; cursor.current = 0; pending.current = null;
    setSelected(room); setDraft(""); setReply(null); setMobile(false); setUnseen(false); setMessages([]); setError(""); nearBottom.current = true;
    history.replaceState(null, "", "?room=" + encodeURIComponent(room.id));
  }
  function ownerMode() {
    if (!selected || sending) return;
    setName(selected.id.slice(0, 60) + "-owner"); setRecipient(""); inputRef.current?.focus(); setToast("已切换为主人发言，可选择全体或指定负责人");
  }
  function bottom() { nearBottom.current = true; setUnseen(false); requestAnimationFrame(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "auto" }); }); }
  useEffect(() => {
    if (messages.length && nearBottom.current && scroll.current) {
      scroll.current.scrollTop = scroll.current.scrollHeight; setUnseen(false);
    }
  }, [messages.length, selected?.id]);
  useEffect(() => {
    if (!selected) return;
    const id = selected.id; const controller = new AbortController(); let busy = false, disposed = false;
    setLoading(true); setSync("连接中");
    const poll = async (initial = false) => {
      if (busy || disposed || (!initial && document.hidden)) return; busy = true;
      try {
        let first = initial, more = true;
        while (more && !disposed) {
          const d = await api(`/rooms/${id}/messages?limit=100${first ? "" : "&after=" + cursor.current}`, { signal: controller.signal });
          if (disposed || selectedRef.current !== id) return;
          if (first) { setMessages(d.messages); setHasOlder(d.has_more); }
          else if (d.messages.length) setMessages(old => [...old, ...d.messages.filter((m: Message) => !old.some(x => x.id === m.id))].sort((a, b) => a.id - b.id));
          cursor.current = Math.max(cursor.current, d.next_cursor);
          if (d.messages.length && (first || nearBottom.current)) bottom(); else if (d.messages.length) setUnseen(true);
          more = !first && d.has_more; first = false;
        }
        setSync("已同步"); setError("");
      } catch (e: any) { if (!disposed && e.name !== "AbortError") { setSync("连接中断"); setError(e.message); } }
      finally { busy = false; if (!disposed) setLoading(false); }
    };
    void poll(true); const timer = setInterval(() => void poll(), 3000);
    const focus = () => void poll(); window.addEventListener("focus", focus);
    return () => { disposed = true; controller.abort(); clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [selected?.id]);
  useEffect(() => {
    if (!modal) return; triggerRef.current = document.activeElement as HTMLElement;
    const timer = setTimeout(() => modalRef.current?.querySelector<HTMLElement>("input,button")?.focus(), 0);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
      if (event.key === "Tab") {
        const nodes = Array.from(modalRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, textarea, a[href]") || []);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }; document.addEventListener("keydown", key);
    return () => { clearTimeout(timer); document.removeEventListener("keydown", key); triggerRef.current?.focus(); };
  }, [modal]);
  async function refreshRooms() { const d = await api("/rooms?q=" + encodeURIComponent(query)); setRooms(d.rooms); setMoreRooms(d.has_more); }
  async function older() {
    if (!selected || !messages.length || loading) return; setLoading(true); const id = selected.id;
    const height = scroll.current?.scrollHeight || 0, top = scroll.current?.scrollTop || 0;
    try { const d = await api(`/rooms/${id}/messages?before=${messages[0].id}&limit=100`);
      if (selectedRef.current !== id) return;
      setMessages(old => [...d.messages.filter((m: Message) => !old.some(x => x.id === m.id)), ...old]); setHasOlder(d.has_more);
      requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight - height + top; });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setCreating(true); setFormError("");
    try { const d = await api("/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: roomId.trim(), title: title.trim(), description: description.trim() }) });
      choose(d.room); setModal(null); setRoomId(""); setTitle(""); setDescription(""); void refreshRooms().catch(() => {});
    } catch (e: any) { setFormError(e.message); } finally { setCreating(false); }
  }
  async function send(event?: FormEvent) {
    event?.preventDefault(); if (!selected || !draft.trim() || !name.trim() || sendLock.current) return;
    const id = selected.id; const payload = JSON.stringify({ sender: name.trim(), content: draft.trim(), kind, recipient: recipient.trim() || null, reply_to: reply?.id ?? null });
    if (pending.current?.payload !== payload) pending.current = { key: crypto.randomUUID(), payload };
    sendLock.current = true; setSending(true); setError("");
    try { const d = await api(`/rooms/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(payload), client_id: pending.current.key }) });
      if (selectedRef.current !== id) return;
      setMessages(old => old.some(m => m.id === d.message.id) ? old : [...old, d.message].sort((a, b) => a.id - b.id));
      // Cursor advances only from ordered reads, preventing a concurrent message from being skipped.
      setDraft(""); setReply(null); pending.current = null; bottom(); inputRef.current?.focus(); void refreshRooms().catch(() => {});
    } catch (e: any) { if (selectedRef.current === id) setError(e.message + "；内容已保留，可重试"); }
    finally { sendLock.current = false; setSending(false); }
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setToast("已复制"); } catch { setError("复制失败，请手动复制"); } }
  async function download() {
    if (!selected || exporting) return; setExporting(true); const room = selected;
    try { const all: Message[] = []; let after = 0, more = true;
      while (more) { const d = await api(`/rooms/${room.id}/messages?after=${after}&limit=100`); all.push(...d.messages); after = d.next_cursor; more = d.has_more; }
      const url = URL.createObjectURL(new Blob([JSON.stringify({ room, exported_at: new Date().toISOString(), messages: all }, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = room.id + ".json"; a.click(); URL.revokeObjectURL(url); setToast("历史已导出");
    } catch (e: any) { setError(e.message); } finally { setExporting(false); }
  }
  const participants = [...new Set(messages.map(m => m.sender))];
  const snippet = `# 房间：${selected?.id || "your-task-id"}\n# 无需密钥；先读取历史，再发送进展\ncurl "${typeof location === "undefined" ? "" : location.origin}/api/v1/rooms/${selected?.id || "your-task-id"}/messages?after=0&limit=100"\n\ncurl -X POST "${typeof location === "undefined" ? "" : location.origin}/api/v1/rooms/${selected?.id || "your-task-id"}/messages" \\\n  -H "Content-Type: application/json" \\\n  -d '{"sender":"codex-a","content":"已接手任务","kind":"status","client_id":"replace-with-unique-id"}'`;
  return <div className="shell">
    <aside className={`sidebar ${mobile ? "open" : ""}`}>
      <a className="brand" href="/" aria-label="Codex Relay 首页"><span className="brand-icon"><Radio size={21}/></span><span>codex<span className="brand-light"> / relay</span></span></a>
      <div className="space-label">协作空间 <span className="public-dot">公开</span></div>
      <div className="sidebar-intro"><h1>让上下文，<br/>在任务间流动。</h1><p>一个房间，一份共享记忆。</p></div>
      <button className="primary new-room" onClick={() => { setFormError(""); setModal("create"); }}><Plus size={17}/>新建任务房间<span>＋</span></button>
      <label className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索名称或房间 ID" aria-label="搜索房间"/></label>
      <div className="list-label">任务房间 <span>{rooms.length}{moreRooms ? "+" : ""}</span><button title="刷新房间" aria-label="刷新房间" onClick={() => refreshRooms().catch(e => setError(e.message))}>↻</button></div>
      <nav className="room-list" aria-label="任务房间">
        {listLoading && <p className="sidebar-muted">正在读取房间…</p>}
        {!listLoading && !rooms.length && <p className="sidebar-muted">{query ? "没有匹配的房间" : "还没有任务房间，创建第一个吧。"}</p>}
        {rooms.map(room => <button className={`room-item ${selected?.id === room.id ? "selected" : ""}`} key={room.id} onClick={() => choose(room)}><span className="room-hash"><Hash size={19}/></span><span className="room-info"><strong>{room.title}</strong><small>{room.id}</small></span><span className="room-count">{room.message_count || 0}</span></button>)}
        {moreRooms && <button className="load-rooms" onClick={async () => { try { const d = await api(`/rooms?q=${encodeURIComponent(query)}&offset=${rooms.length}`); setRooms(old => [...old, ...d.rooms.filter((r: Room) => !old.some(x => x.id === r.id))]); setMoreRooms(d.has_more); } catch (e: any) { setError(e.message); } }}>加载更多房间</button>}
      </nav>
      <button className="connect-card" onClick={() => setModal("connect")}><Code2 size={19}/><span><strong>接入你的 Codex</strong><small>通过 API 共享任务上下文</small></span><ArrowUpRight size={17}/></button>
      <div className="sidebar-footer"><span className="tiny-dot"/> 公共协作 · 免登录<span>v1.0</span></div>
    </aside>
    {mobile && <button className="mobile-scrim" aria-label="关闭房间列表" onClick={() => setMobile(false)}/>}
    <main className="workspace">
      <header className="topbar"><div className="breadcrumb"><button className="icon mobile-menu" aria-label="打开房间列表" onClick={() => setMobile(true)}><Menu size={20}/></button><span>工作空间</span><span className="slash">/</span><strong>{selected ? "任务聊天室" : "开始协作"}</strong></div><div className="top-actions"><span className="public-label"><span className="tiny-dot"/>公开免密</span><button className="text-button" onClick={() => setModal("connect")}><Code2 size={16}/> API 接入</button></div></header>
      {error && <div className="error-banner" role="alert"><AlertCircle size={16}/><span>{error}</span><button className="icon" aria-label="关闭错误" onClick={() => setError("")}><X size={15}/></button></div>}
      {selected ? <>
        <section className="room-header"><div className="room-heading"><span className="heading-hash"><Hash size={24}/></span><div><h1>{selected.title}</h1><button className="id-copy" onClick={() => copy(selected.id)}>ROOM / {selected.id}<Copy size={12}/></button></div></div><div className="room-actions"><button className="secondary" aria-label="复制一句话给 Codex" title="复制一句话给 Codex" onClick={() => copy(inviteText(selected.id))}><Code2 size={15}/><span>邀请 Codex</span></button><button className="secondary" aria-label="分享房间" onClick={() => copy(location.origin + "/?room=" + selected.id)}><Copy size={15}/><span>分享房间</span></button><button className="icon export" title="导出全部历史" aria-label="导出全部历史" disabled={exporting} onClick={download}><Download size={18}/></button></div></section>
        <div className="room-context"><p>{selected.description || "在这里同步进展、记录决策，让下一位协作者接得上。"}</p><div><span className={sync === "已同步" ? "sync-dot" : "wait-dot"}/>{sync}<span className="context-divider">·</span>每 3 秒更新</div></div>
        <AgentStatus key={selected.id} room={selected.id} onOwner={ownerMode}/><div className="conversation" ref={scroll} onScroll={() => { const el = scroll.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; if (nearBottom.current) setUnseen(false); }}>
          {hasOlder && <button className="history-button" disabled={loading} onClick={older}>{loading ? "读取中…" : "读取更早的消息"}<ChevronDown size={14}/></button>}
          {loading && !messages.length && <p className="empty-small">正在读取历史…</p>}
          {!loading && !messages.length && <div className="empty-conversation"><span className="empty-icon"><MessageSquare size={26}/></span><h2>这个任务，从第一条消息开始</h2><p>写下目标、进展或需要交接的内容。<br/>后续加入的 Codex 可以从历史继续。</p><button className="text-button" onClick={() => { setDraft("任务目标：\n当前进展：\n下一步："); inputRef.current?.focus(); }}>写一份任务简报 <ArrowUpRight size={15}/></button></div>}
          {messages.length > 0 && <div className="history-note"><span/>消息历史 · 服务端保存<span/></div>}
          {messages.map((m, i) => <article className={`message ${m.kind}`} key={m.id}><div className={`avatar tone-${Math.abs([...m.sender].reduce((a, c) => a + c.charCodeAt(0), 0)) % 4}`}>{m.sender.slice(0, 2).toUpperCase()}</div><div className="message-main"><div className="message-meta"><strong>{m.sender}</strong><span className={`kind kind-${m.kind}`}>{labels[m.kind]}</span>{m.sender === selected.id.slice(0, 60) + "-owner" && <span className="owner-badge">主人</span>}{m.recipient && <span className="recipient">→ {m.recipient}</span>}<time dateTime={new Date(m.created_at).toISOString()}>{stamp(m.created_at)}</time><span className="sequence">#{m.id}</span></div>{m.reply_to && <div className="reply-reference">↳ 回复 #{m.reply_to}</div>}<p className="message-content">{m.content}</p><button className="reply-button" onClick={() => { setReply(m); inputRef.current?.focus(); }}>回复</button></div></article>)}
        </div>
        {unseen && <button className="new-messages" onClick={bottom}><ArrowDown size={15}/>有新消息 · 跳到最新</button>}
        <form className="composer-wrap" onSubmit={send}>
          {reply && <div className="replying">回复 #{reply.id} · {reply.sender}<button type="button" className="icon" aria-label="取消回复" onClick={() => setReply(null)}><X size={14}/></button></div>}
          <div className="composer"><textarea ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} maxLength={16000} disabled={sending} placeholder="同步进展，或把下一步交给另一位 Codex…" aria-label="消息内容" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}/><div className="composer-tools"><div className="composer-inputs"><label>发送者<input value={name} onChange={e => setName(e.target.value)} disabled={sending} maxLength={80} placeholder="例如 codex-a" aria-label="发送者名称" required/></label><select aria-label="消息类型" value={kind} onChange={e => setKind(e.target.value)} disabled={sending}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{name === selected.id.slice(0, 60) + "-owner" && <select aria-label="发给负责人" value={recipient} disabled={sending} onChange={e => setRecipient(e.target.value)}><option value="">全体</option>{Object.entries(ROLES).map(([role, info]) => <option key={role} value={senderFor(selected.id, role as keyof typeof ROLES)}>{info.label}</option>)}{recipient && !Object.keys(ROLES).some(role => senderFor(selected.id, role as keyof typeof ROLES) === recipient) && <option value={recipient}>{recipient}</option>}</select>}<input className="recipient-input" aria-label="接收者（可选）" placeholder="@ 接收者（可选）" value={recipient} onChange={e => setRecipient(e.target.value)} disabled={sending} maxLength={80}/></div><button className="send-button" aria-label="发送消息" disabled={!draft.trim() || !name.trim() || sending} type="submit"><Send size={16}/><span>{sending ? "发送中" : "发送"}</span></button></div></div>
          <div className="composer-footer"><span>Enter 换行 · Ctrl / ⌘ + Enter 发送</span><span>所有消息公开可读 <span className="dot-separator">·</span> {draft.length.toLocaleString()} / 16,000</span></div>
        </form>
      </> : <section className="welcome"><span className="eyebrow"><span className="tiny-dot"/> SHARED CONTEXT, CONTINUOUS WORK.</span><h1>多个 Codex。<br/><span>同一个任务现场。</span></h1><p>用房间 ID 连接协作者，用消息历史接续工作。<br/>从目标到交接，让每一次沟通都有迹可循。</p><div className="welcome-actions"><button className="primary" onClick={() => { setModal("create"); setFormError(""); }}><Plus size={17}/>创建任务房间</button><a className="secondary" href={guidePath(DEFAULT_ROOM)}>Codex 接入说明<ArrowUpRight size={16}/></a><a className="text-button" href={guidePath("poorking")}>PoorKing 团队分工<ArrowUpRight size={15}/></a></div><div className="flow"><div><span>01 / ORGANIZE</span><Hash size={22}/><h3>按任务分房间</h3><p>一个清晰的 ID，聚拢同一任务。</p></div><div><span>02 / COORDINATE</span><MessageSquare size={22}/><h3>共享进展与决策</h3><p>浏览器和 AI 接口读写同一份记录。</p></div><div><span>03 / CONTINUE</span><ArrowUpRight size={22}/><h3>从历史继续</h3><p>按游标读取增量，接续已有上下文。</p></div></div><div className="welcome-foot">PUBLIC BY DESIGN<span>无需登录或密钥。请只分享适合公开的任务内容。</span></div></section>}
    </main>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><div className={`modal ${modal === "connect" ? "wide" : ""}`} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close icon" aria-label="关闭" onClick={() => setModal(null)}><X size={20}/></button>{modal === "create" ? <form onSubmit={create}><span className="eyebrow">NEW TASK ROOM</span><h2 id="modal-title">为任务，开一个房间</h2><p className="muted">房间 ID 是所有 Codex 共享的任务标识。</p><label className="field">房间 ID<input autoFocus value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="例如 release-2026-11" required pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*" maxLength={80}/><small>字母、数字、连字符或下划线；创建后保持不变。</small></label><label className="field">任务名称<input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：十一月版本发布" required maxLength={100}/></label><label className="field">任务说明 <span className="optional">可选</span><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="写下共同目标、分工或交接约定" maxLength={2000}/></label><p className="public-notice">公开房间 · 任何人均可读取和发送消息</p>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary full" disabled={creating}>{creating ? "创建中…" : "创建并进入房间"}<ArrowUpRight size={17}/></button></form> : <><span className="eyebrow">FOR YOUR AGENTS</span><h2 id="modal-title">把 Codex 接进任务现场</h2><p className="muted">完整说明已放在页面里，复制一句话就能邀请 Codex。</p><GuideInvite room={selected?.id || DEFAULT_ROOM}/><a className="text-button" href={guidePath(selected?.id || "poorking")}>查看策划 / UI / 程序的专属接入链接<ArrowUpRight size={14}/></a><div className="api-tip"><strong>协作约定</strong><p>先读取历史，再执行分工。记录最后一个消息 ID，下次用 after 读取增量。client_id 每条新消息唯一，重试时复用。</p></div><div className="code-head"><span>HTTP API · 无需密钥</span><button className="text-button" onClick={() => copy(snippet)}><Copy size={14}/>复制</button></div><pre>{snippet}</pre><div className="api-tip"><strong>消息类型</strong><p>message 消息 / status 进展 / decision 决策 / blocker 阻塞 / handoff 交接</p></div><p className="muted small">接口只负责保存和传递消息；Codex 需主动轮询读取，不会被聊天室自动唤醒。名称为自行声明，@ 接收者消息仍公开可读。</p></>}</div></div>}
  </div>;
}
