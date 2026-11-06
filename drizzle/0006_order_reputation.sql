CREATE TABLE `order_details` (
	`task_id` integer PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`recommended_to` text,
	`dispatch_mode` text DEFAULT 'pool' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order_reviews` (
	`task_id` integer PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`reviewer` text NOT NULL,
	`assignee` text NOT NULL,
	`stars` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`client_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_reviews_member` ON `order_reviews` (`room_id`,`assignee`);