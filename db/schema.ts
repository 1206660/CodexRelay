import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), title: text("title").notNull(),
  description: text("description").notNull().default(""), createdAt: integer("created_at").notNull(),
});
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: text("room_id").notNull().references(() => rooms.id), sender: text("sender").notNull(),
  content: text("content").notNull(), summary: text("summary").notNull().default(""), kind: text("kind").notNull().default("message"),
  recipient: text("recipient"), replyTo: integer("reply_to"), clientId: text("client_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("messages_room_cursor").on(t.roomId, t.id), index("messages_room_reply").on(t.roomId, t.replyTo), uniqueIndex("messages_idempotency").on(t.roomId, t.sender, t.clientId)]);
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const agents = sqliteTable("agents", {
  key: text("key").primaryKey(),
  roomId: text("room_id").notNull().references(() => rooms.id),
  sender: text("sender").notNull(), role: text("role").notNull(),
  state: text("state").notNull(), task: text("task").notNull().default(""),
  waitingFor: text("waiting_for"), mode: text("mode").notNull().default("manual"),
  lastReadId: integer("last_read_id").notNull().default(0),
  pollingIntervalMinutes:integer("polling_interval_minutes").notNull().default(1),nextCheckAt:integer("next_check_at"),automationId:text("automation_id"),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("agents_room").on(t.roomId)]);
export const projectSettings = sqliteTable("project_settings", {
  roomId: text("room_id").primaryKey().references(() => rooms.id),
  name: text("name").notNull().default(""), goal: text("goal").notNull().default(""),
  milestone: text("milestone").notNull().default(""), status: text("status").notNull().default("active"),
  isTest: integer("is_test").notNull().default(0), updatedAt: integer("updated_at").notNull(),
});
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey().references(() => messages.id),
  roomId: text("room_id").notNull().references(() => rooms.id),
  title: text("title").notNull(), description: text("description").notNull(), criteria: text("criteria").notNull().default(""),
  requester: text("requester").notNull(), assignedTo: text("assigned_to"), assignee: text("assignee"),
  status: text("status").notNull().default("todo"), priority: text("priority").notNull().default("normal"),
  dueAt: integer("due_at"), blocker: text("blocker").notNull().default(""),
  waitingFor: text("waiting_for"), needsDecision: integer("needs_decision").notNull().default(0),
  decisionNote: text("decision_note").notNull().default(""), evidence: text("evidence").notNull().default(""),
  reviewNote: text("review_note").notNull().default(""), reviewer: text("reviewer"), reworkCount: integer("rework_count").notNull().default(0),
  version: integer("version").notNull().default(0), lastActionKey: text("last_action_key").notNull(),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(), completedAt: integer("completed_at"),
}, (t) => [index("tasks_room_status").on(t.roomId, t.status), index("tasks_room_updated").on(t.roomId, t.updatedAt)]);
export const taskEvents = sqliteTable("task_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), roomId: text("room_id").notNull().references(() => rooms.id),
  taskId: integer("task_id").notNull().references(() => tasks.id), messageId: integer("message_id").notNull().references(() => messages.id),
  actor: text("actor").notNull(), action: text("action").notNull(), fromState: text("from_state"),
  toState: text("to_state").notNull(), note: text("note").notNull().default(""), createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("task_events_message").on(t.messageId), index("task_events_room_task").on(t.roomId, t.taskId, t.id)]);
export const projectMembers = sqliteTable("project_members", {
  key: text("key").primaryKey(), roomId: text("room_id").notNull().references(() => rooms.id),
  sender: text("sender").notNull(), displayName: text("display_name").notNull(), role: text("role").notNull().default("成员"),
  responsibility: text("responsibility").notNull().default(""), active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, (t) => [index("project_members_room").on(t.roomId)]);

export const intakeSessions = sqliteTable("intake_sessions", {
  id: text("id").primaryKey(),roomId:text("room_id").notNull().references(()=>rooms.id),
  status:text("status").notNull().default("draft"),version:integer("version").notNull().default(0),
  proposalJson:text("proposal_json").notNull().default("{}"),error:text("error").notNull().default(""),
  currentJobId:text("current_job_id"),dispatchKey:text("dispatch_key"),
  createdAt:integer("created_at").notNull(),updatedAt:integer("updated_at").notNull(),
},t=>[index("intake_sessions_room").on(t.roomId,t.updatedAt)]);
export const intakeTurns = sqliteTable("intake_turns", {
  id:integer("id").primaryKey({autoIncrement:true}),sessionId:text("session_id").notNull().references(()=>intakeSessions.id),
  roomId:text("room_id").notNull().references(()=>rooms.id),role:text("role").notNull(),content:text("content").notNull(),
  createdAt:integer("created_at").notNull(),
},t=>[index("intake_turns_session").on(t.sessionId,t.id)]);
export const intakeJobs = sqliteTable("intake_jobs", {
  id:text("id").primaryKey(),sessionId:text("session_id").notNull().references(()=>intakeSessions.id),roomId:text("room_id").notNull().references(()=>rooms.id),
  clientId:text("client_id").notNull(),requestText:text("request_text").notNull(),status:text("status").notNull().default("queued"),
  resultJson:text("result_json").notNull().default("{}"),error:text("error").notNull().default(""),
  createdAt:integer("created_at").notNull(),updatedAt:integer("updated_at").notNull(),
},t=>[uniqueIndex("intake_jobs_request").on(t.sessionId,t.clientId),index("intake_jobs_queue").on(t.status,t.createdAt)]);
export const orderDetails=sqliteTable("order_details",{
  taskId:integer("task_id").primaryKey().references(()=>tasks.id),roomId:text("room_id").notNull().references(()=>rooms.id),
  recommendedTo:text("recommended_to"),dispatchMode:text("dispatch_mode").notNull().default("pool"),createdAt:integer("created_at").notNull(),
});
export const orderReviews=sqliteTable("order_reviews",{
  taskId:integer("task_id").primaryKey().references(()=>tasks.id),roomId:text("room_id").notNull().references(()=>rooms.id),
  reviewer:text("reviewer").notNull(),assignee:text("assignee").notNull(),stars:integer("stars").notNull(),comment:text("comment").notNull().default(""),
  clientId:text("client_id").notNull(),version:integer("version").notNull().default(1),createdAt:integer("created_at").notNull(),updatedAt:integer("updated_at").notNull(),
},t=>[index("order_reviews_member").on(t.roomId,t.assignee)]);
