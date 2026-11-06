CREATE TABLE `project_members` (
	`key` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`sender` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT '成员' NOT NULL,
	`responsibility` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_members_room` ON `project_members` (`room_id`);