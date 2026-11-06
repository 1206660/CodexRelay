CREATE TABLE `agents` (
	`key` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`sender` text NOT NULL,
	`role` text NOT NULL,
	`state` text NOT NULL,
	`task` text DEFAULT '' NOT NULL,
	`waiting_for` text,
	`mode` text DEFAULT 'manual' NOT NULL,
	`last_read_id` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `agents_room` ON `agents` (`room_id`);