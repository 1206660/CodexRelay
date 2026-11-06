ALTER TABLE `agents` ADD `polling_interval_minutes` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `next_check_at` integer;--> statement-breakpoint
ALTER TABLE `agents` ADD `automation_id` text;