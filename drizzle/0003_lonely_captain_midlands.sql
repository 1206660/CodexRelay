CREATE TABLE `project_settings` (
	`room_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`milestone` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_test` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`task_id` integer NOT NULL,
	`message_id` integer NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`from_state` text,
	`to_state` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_events_message` ON `task_events` (`message_id`);--> statement-breakpoint
CREATE INDEX `task_events_room_task` ON `task_events` (`room_id`,`task_id`,`id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`criteria` text DEFAULT '' NOT NULL,
	`requester` text NOT NULL,
	`assigned_to` text,
	`assignee` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`due_at` integer,
	`blocker` text DEFAULT '' NOT NULL,
	`waiting_for` text,
	`needs_decision` integer DEFAULT 0 NOT NULL,
	`decision_note` text DEFAULT '' NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`reviewer` text,
	`rework_count` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`last_action_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_room_status` ON `tasks` (`room_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_room_updated` ON `tasks` (`room_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `messages_room_reply` ON `messages` (`room_id`,`reply_to`);