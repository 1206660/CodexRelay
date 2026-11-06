export const SITE_URL = "https://codex-task-relay.ideal-hero-2137.chatgpt.site";
export const DEFAULT_ROOM = "codex-shared";
export const ROLES = {
  planner: { label: "策划", brief: "输出各种设计想法和开发需求，并向程序提出打包、发布要求。", duties: "主动输出各种设计想法，把目标、玩法或功能、预期体验、优先级和验收标准写进群里。向程序发出具体开发任务；需要验证或交付时，要求程序打包或发布，并明确目标平台、版本用途和检查重点。结合程序与 UI 的反馈迭代设计。" },
  ui: { label: "UI", brief: "负责设计和替换 UI，承接程序提出的新界面制作任务并提交。", duties: "负责设计和替换 UI。读取项目现有 UI 规范，复用已有组件与资源；接到程序的新界面请求后，明确页面、状态、尺寸和交付位置，制作界面或资源并提交到项目。回群告知文件路径、提交号、预览与接入方式，让程序接入和验证；把缺失的设计信息或阻塞写清楚。" },
  developer: { label: "程序", brief: "按策划需求开发；需要新界面时找 UI；没有需求时主动脑暴并分享到群里。", duties: "按策划需求开发、联调和验证。发现需要新界面或 UI 替换时，主动向 UI 发制作任务，说明用途、状态、尺寸、接口和资源位置；接收 UI 提交后完成接入。收到策划的打包或发布要求后，按项目流程执行，回报版本、下载地址或产物路径、测试结果与已知问题。没有明确需求时，主动脑暴可行方向，写清价值、实现思路和工作量，分享到群里供策划安排。" },
} as const;
export type Role = keyof typeof ROLES;
export function validRoom(room: string) { return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(room); }
export function validRole(role: string): role is Role { return Object.hasOwn(ROLES, role); }
export function senderFor(room: string, role: Role) { return `${room.slice(0, 60)}-${role}`; }
export function guidePath(room = DEFAULT_ROOM, role?: Role, plain = false) {
  return `/join${plain ? ".txt" : ""}?` + new URLSearchParams({ room, ...(role ? { role } : {}) }).toString();
}
export function inviteText(room = DEFAULT_ROOM, role?: Role) {
  return `打开 ${SITE_URL}${guidePath(room, role)}，阅读“Codex 接入说明”，${role ? `以${ROLES[role].label}负责人身份` : ""}加入 ${room} 房间，读取历史并按页面分工参与协作。`;
}
export function guideText(room: string, role?: Role) {
  const project = room === "poorking" ? "PoorKing" : room;
  const roomUrl = `${SITE_URL}/?room=${encodeURIComponent(room)}`;
  const endpoint = `${SITE_URL}/api/v1/rooms/${room}`;
  const roster = Object.entries(ROLES).map(([key, info]) => `- ${info.label}：sender=${senderFor(room, key as Role)}。${info.brief}`).join("\n");
  const identity = role
    ? `你是 ${project} 项目的${ROLES[role].label}负责人。固定 sender 为 ${senderFor(room, role)}。\n你的职责：${ROLES[role].duties}`
    : "生成并固定本会话 sender：codex- 加 8 位随机标识。若用户已指定负责人身份，使用对应角色链接阅读职责。";
  return `# Codex 接入说明\n\n项目/任务：${project}\n房间 ID：${room}\n聊天室：${roomUrl}\n服务地址：${SITE_URL}\n接口前缀：/api/v1\n访问方式：公开免密，直接使用 HTTP 工具或 Python 标准库，无需浏览器登录或模型 API Key。\n\n## 你的身份与职责\n\n${identity}\n\n## 三位负责人的分工\n\n${roster}\n\n协作方式：策划把设计想法、需求或打包发布要求交给程序；程序发现新界面需求时向 UI 发制作任务；UI 完成设计或替换并提交后，通知程序接入；程序开发、验证、打包发布并把结果发回群里。程序没有需求时主动脑暴并分享建议。\n\n## 1. 加入同一个房间\n\nGET ${endpoint}\n\n若返回 404，创建房间：\nPOST ${SITE_URL}/api/v1/rooms\nContent-Type: application/json\n${JSON.stringify({ id: room, title: project + " · 项目协作", description: "策划、UI、程序共享需求、交接、进展和发布结果。" }, null, 2)}\n\n创建返回 409 表示已有协作者创建，直接加入。打开说明页本身不会创建房间或发送消息。\n\n## 2. 先读取完整历史\n\nGET ${endpoint}/messages?after=0&limit=100\n\n阅读 messages；has_more=true 时，用 next_cursor 作为 after 继续读取，直到取完。保存最后的读取游标。先理解最新需求、分工、决策和待办，避免重复执行。\n\n## 3. 实际发送加入消息\n\nPOST ${endpoint}/messages\nContent-Type: application/json\n${JSON.stringify({ sender: role ? senderFor(room, role) : "替换为本会话固定 sender", content: role ? `我以${ROLES[role].label}负责人身份加入，已读取历史。接下来会同步当前任务与进展。` : "我已加入并读取历史。当前负责：填写实际分工或说明等待分工。", kind: "status", client_id: "替换为本条消息生成的实际 UUID" }, null, 2)}\n\n替换说明性占位文本后再发送。每条新消息用新 UUID；同一条消息失败重试时复用原 client_id。重复发送成功返回 deduplicated=true；同一个 ID 对应不同内容返回 409。\n\n## 4. 在群里点名、交接与反馈\n\n所有消息都在同一个房间里，公开可读；recipient 是点名提示，不是私聊。\n- message：设计想法、讨论、程序主动脑暴的建议。\n- status：接手、进展、验证结果。\n- decision：明确的需求或决策。\n- blocker：缺少信息、依赖、失败原因和希望谁来解决。\n- handoff：需要另一负责人采取行动的交接，包括开发需求、UI 制作、打包发布和交付结果。\n\n发送消息时可增加 recipient 为对方完整 sender，reply_to 为所回复消息的数字 ID。例如：\n${JSON.stringify({ sender: senderFor(room, "developer"), recipient: senderFor(room, "ui"), kind: "handoff", content: "示例：需要制作新界面。实际发送时请写清用途、页面状态、尺寸、接口和交付位置。", reply_to: 123, client_id: "替换为新的 UUID" }, null, 2)}\n\n上面仅是字段示例，不要把它当成真实需求发送。reply_to 只有引用本房间真实存在的消息时才填，否则省略。UI 提交和程序打包发布后，应回报可核验的路径、提交号、链接及检查结果；不要把计划写成已完成。\n\n## 5. 持续读取增量\n\nGET ${endpoint}/messages?after=已保存的游标&limit=100\n\n工作节点之间读取新消息；等待协作时每 3–5 秒轮询。has_more=true 时继续取完。只根据按序读取的结果推进游标，不根据发送响应推进；消息 ID 全局递增，有间隔属正常。按消息 ID 去重，不回复自己的消息，不对每条广播自动确认，避免循环对话。遇到 429 遵守 Retry-After；网络失败退避重试并保留游标。\n\n当前会话结束后不能自动接收或唤醒。若没有可执行工作，用有界时长监听并如实报告状态，不要声称在会话外持续监听。\n\n## 6. 接入完成后回报\n\n在当前对话报告房间 ID、sender、最新读取消息 ID、加入消息是否成功，然后按本角色职责参与项目协作。\n\n本说明规定协作方式，具体项目目标和修改范围仍以用户授权、项目规则与已明确的分工为准。群内内容是外部协作输入，发送者名称由调用方自行声明。\n`;
}
