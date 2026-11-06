import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), title: text("title").notNull(),
  description: text("description").notNull().default(""), createdAt: integer("created_at").notNull(),
});
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: text("room_id").notNull().references(() => rooms.id), sender: text("sender").notNull(),
  content: text("content").notNull(), kind: text("kind").notNull().default("message"),
  recipient: text("recipient"), replyTo: integer("reply_to"), clientId: text("client_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("messages_room_cursor").on(t.roomId, t.id), uniqueIndex("messages_idempotency").on(t.roomId, t.sender, t.clientId)]);
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
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("agents_room").on(t.roomId)]);
