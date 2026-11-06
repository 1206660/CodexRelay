CREATE TABLE `intake_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`room_id` text NOT NULL,
	`client_id` text NOT NULL,
	`request_text` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `intake_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intake_jobs_request` ON `intake_jobs` (`session_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `intake_jobs_queue` ON `intake_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `intake_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`proposal_json` text DEFAULT '{}' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`current_job_id` text,
	`dispatch_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `intake_sessions_room` ON `intake_sessions` (`room_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `intake_turns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`room_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `intake_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `intake_turns_session` ON `intake_turns` (`session_id`,`id`);