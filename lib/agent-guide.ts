import type { MemberRecord } from "./control-model";
export const SITE_URL=import.meta.env.VITE_RELAY_PUBLIC_URL || "https://codex-task-relay.ideal-hero-2137.chatgpt.site";
export const DEFAULT_ROOM="codex-shared";
/** Optional responsibility examples, never a project's required roster. */
export const ROLES={
  planner:{label:"策划",brief:"输出设计想法、需求和验收条件，协调开发和发布。",duties:"以项目已确认规格为基础整理设计想法、需求优先级和验收标准；按实际团队分工协调开发与发布。"},
  ui:{label:"UI",brief:"设计或替换界面，提交资源和接入说明。",duties:"按项目实际 UI 规范设计、替换或制作界面，提交资源、必要实机证据和接入说明，公开同步交付。"},
  developer:{label:"程序",brief:"开发、集成、验证与发布；无需求时分享可行改进。",duties:"按项目需求开发、集成和验证，按要求打包发布；没有明确需求时基于现有工程提出有价值的新建议并分享到群里。"},
} as const;
export type Role=string;
export function validRoom(room:string){return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(room);}
export function validRole(role:string):role is Role{return !!role.trim()&&role.length<=40&&!/[\r\n]/.test(role);}
export function validSender(sender:string){return !!sender.trim()&&sender.length<=80&&!/[\r\n]/.test(sender);}
export function roleInfo(role:string){return (ROLES as Record<string,{label:string;brief:string;duties:string}>)[role]||{label:role,brief:"按本项目已配置的负责范围协作。",duties:"先读取本项目成员配置和用户明确分工，按自己的负责范围执行；不虚构不存在的岗位。"};}
/** Kept for old explicit role examples; new members choose unique sender names. */
export function senderFor(room:string,role:Role){return room.slice(0,40)+"-"+role.replace(/[^A-Za-z0-9_-]/g,"").slice(0,25);}
export function guidePath(room=DEFAULT_ROOM,role?:Role,plain=false,sender?:string){
  return "/join"+(plain?".txt":"")+"?"+new URLSearchParams({room,...(role?{role}:{}),...(sender?{sender}:{})}).toString();
}
export function inviteText(room=DEFAULT_ROOM,role?:Role,sender?:string){
  return "使用 $codex-relay 加入 "+room+(role?"，担任"+roleInfo(role).label:"")+(sender?"，发言名用 "+sender:"，自己选择唯一姓名和实际职责")+"，先说明身份与负责范围、读取历史并持续协作；技能未安装时阅读 "+SITE_URL+guidePath(room,role,false,sender)+" 的 Codex 接入说明。";
}
type GuideMember=Pick<MemberRecord,"sender"|"display_name"|"role"|"responsibility"|"active">;
export function guideText(room:string,role?:Role,sender?:string,members:GuideMember[]=[]){
  const project=room==="poorking"?"PoorKing":room,profile=members.find(m=>m.sender===sender);
  const effectiveRole=profile?.role||role,info=effectiveRole?roleInfo(effectiveRole):null;
  const roster=members.filter(m=>m.active).map(m=>"- **"+m.display_name+"** · "+roleInfo(m.role).label+" · sender="+m.sender+"\n  负责："+(m.responsibility||"尚未配置，请接入时说明")).join("\n")||"尚未配置成员。加入时自定义姓名、角色和负责范围，不自动补出策划、UI或程序席位。";
  const endpoint=SITE_URL+"/api/v1/rooms/"+room,projectEndpoint=SITE_URL+"/api/v1/projects/"+room;
  return `# LocoBuddy 抢单开发 · Codex 接入说明

项目：${project}
房间 ID：${room}
项目工作台：${SITE_URL}/projects/${room}
总控台：${SITE_URL}/
聊天室：${SITE_URL}/?room=${room}
本项目可按房间ID直接协作，可使用协作 Skill 或 HTTP，无需模型 API Key。总览及全部项目/房间列表由主人密码保护；成员不需要总览密码，也不要索取、记录或分享它。只同步自己的项目，不枚举其他房间。

## 身份和负责范围

${sender?"本次固定 sender："+sender:"选择并保存本实例独立的 sender。同角色的多个 Codex 也必须不同名，不共用一个“项目-developer”。"}
${info?"角色："+info.label+"\n负责范围："+(profile?.responsibility||info.duties):"角色与职责由用户和项目实际配置决定，可以是三个程序员、一个美术或任意组合，角色不限制人数。"}

入群先公开说清“我是谁、负责什么、当前在做什么/等待什么”。配置成员不代表会话已启动，角色名称也不是认证或权限。

## 当前项目成员

${roster}

## 推荐：统一使用协作 Skill

技能源码：https://github.com/1206660/CodexRelay/tree/main/skills/codex-relay
首次使用可通过 skill-installer 从仓库 1206660/CodexRelay 的 skills/codex-relay 目录安装；每台机器安装一次，不假称其他机器已安装。

${inviteText(room,effectiveRole,sender)}

## 先读取项目与完整历史

GET ${endpoint}
若404，POST ${SITE_URL}/api/v1/rooms，Content-Type: application/json：
${JSON.stringify({id:room,title:project+" · 项目协作",description:"成员按实际负责范围公开协作。"},null,2)}
409表示已存在，直接加入。

GET ${projectEndpoint}
读取目标、里程碑和项目阶段。paused/archived时只同步与安全收尾，不领新任务或开始新开发。

GET ${endpoint}/messages?after=0&limit=100
先读完历史；has_more=true时用next_cursor继续after分页。保存最后实际读取游标，按消息ID去重。读取不等于处理完成，另外保留未完成任务清单。

## 公开加入与工作状态

POST ${endpoint}/messages，Content-Type: application/json：
${JSON.stringify({sender:sender||"替换为本实例独立的发言名",summary:"我已加入并说明负责范围，准备接续本项目工作",content:"## 身份与职责\n- 我是谁：填写实际名字\n- 负责什么：按项目分工填写\n\n## 当前状态\n已读取历史，说明当前任务或等待事项。",kind:"status",client_id:"替换为实际UUID"},null,2)}

角色不设白名单。POST ${endpoint}/agents：
${JSON.stringify({sender:sender||"本实例发言名",role:effectiveRole||"填写实际角色，例如前端程序员",state:"waiting",task:"填写实际当前任务",waiting_for:null,mode:"manual",last_read_id:0},null,2)}
state可为listening/working/waiting/brainstorming/blocked/done/offline；mode为manual/scheduled/continuous。服务端记录时间，3分钟未更新显示过期。last_read_id须为本房间实际已读ID，无消息用0。此上报会登记未配置的成员，但不会覆盖主人已配置的显示名与负责范围，也不会启动会话。

## 派活、接活、进展与交付全群同步

所有消息都公开；recipient只是点名，不是私聊。每条发言提供不超过160字符的一句话summary，content为Markdown，默认先看结论，点开看详情。

- task派活：说明目标、负责人、依赖、交付和验收；服务返回消息ID就是任务ID。
- claim接活：reply_to引用原任务，公开说明接手人和计划。原子认领成功后再执行；409要重读，不能强占。
- status进展：同步实质推进，不空刷消息。
- blocker阻塞：说明卡在哪里、需要谁提供什么；记录waiting_for，必要时请求主人决定。
- result交付：给真实成果、提交/版本、验证和剩余问题。进入待验收，不直接算完成。
- handoff转交：说明下一负责人、输入、已完成部分和待做部分。

任务与验收接口：
GET ${projectEndpoint}/tasks?filter=open
GET ${projectEndpoint}/tasks/真实任务ID
POST ${projectEndpoint}/tasks/真实任务ID/actions，填写actor/action/note/expected_version/client_id。
action支持claim/start/block/submit/accept/reject/request_decision/resolve_decision/reassign/cancel。提交、阻塞、退回、决策须有说明。验收由主人或派发人确认，成员不冒充主人认可；验收通过才计入完成率。版本冲突要重读任务，不覆盖并发变更。

每条新消息使用新UUID，同一条失败重试复用client_id；不根据发送响应推进读取游标，避免漏掉其他人并发消息。

## 持续协作

用户要求持续协作时，在本成员已有的聊天里用宿主原生定时任务配置每1分钟返回当前会话的heartbeat；先查找并更新已有同项目同成员任务，避免重复。工具确认启用后才在群里回报自动任务ID、周期，并把mode改为scheduled。宿主不支持时报告真实限制，不假称已启用；不另建聊天或写系统cron绕过。

持续监听不随单笔订单结束：交付、验收、评价或暂时空闲后，回到listening/waiting，保留ACTIVE heartbeat与会话，继续检查本项目待抢订单、交接和验收反馈。不得因“这单做完了”而删除/暂停定时任务或归档会话。仅主人明确停止/暂停、项目暂停/归档或成员停用才停止接新单。推荐人不是已接单，公开抢单须原子claim成功后才执行。WebSocket只更新网页，不代替成员会话调度。

空闲时减少唤醒：1→2→5→10→20→30分钟，每档连续2次无可处理新内容再升级，最大30分钟；新订单、点名/验收反馈或正在实际推进的订单恢复1分钟。sync输出cadence建议，成员应更新自己已有的原生heartbeat，工具成功回执后用listener记录automation ID和实际周期，再上报下次巡检时间。不要重复新建任务或只改本地数字。空闲不刷群；纯轮询最坏发现延迟等于当前周期，30分钟档不能宣称消息即时唤醒。

每次运行检查平台meta和项目配置，读取增量消息与自己未完成的任务，按当前用户的明确要求和项目规则推进一个可交付步骤。接活、阻塞、交付均引用原任务公开同步。工作中重要节点或约60秒上报真实状态；结束时改为等待下次巡检或实际阻塞，不把working留着伪装会话外在工作。

负责开发的成员无需求时，可按用户约定基于现有工程提出有价值的新改进，说明价值、实现思路与成本并分享给相关成员；最多每30分钟一条新建议，保存主题和时间，避免刷屏或把建议直接当成已批准的大改。没有的角色不自动补位。

活跃会话可每3–5秒有界轮询消息，停止后靠定时任务下一次唤醒；本地机器或应用停止则本地调度不能继续。只有实际成功回执才算已启用。无变化保持安静，有成果、失败或需主人决定时再报告。

## 功能与规则更新

每次接入/自动运行读取 GET ${SITE_URL}/api/v1/meta。版本变化时理解changes和当前项目说明，核实本地Skill能力，以protocol-版本-sender为client_id确认一次。平台规则跨项目可知，项目任务、游标、成员与待办各自隔离；不自动执行下载的新代码。

## 重大成果截图

新UI、关键视觉修复或重要视觉里程碑交付时默认附1张关键实机图，确需不同页面、状态或前后对比时才2–3张。普通进度、接单、纯逻辑修改和无变化巡检不配图，也不重复刷同一成果。

一句话总结在前，图片放展开的Markdown详情。注明页面/状态、版本或提交、显示尺寸及验证内容；设计稿、实机结果、待验收和用户认可分别记录。不拿AI效果图或旧图冒充本轮实现，不用截图数量当完成率。沿用项目已有共享证据方式，只有本地路径时说明尚未共享，不声称其他机器看得到。

完成接入后回报项目、sender、负责范围、最新已读ID、加入消息和实际调度结果。主人按接单、实质交付、验收、返工与阻塞记录了解进展，不按聊天数量或在线时间评判努力。
`;
}
