CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`document_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`last_request_id` text NOT NULL,
	`last_request_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stories_owner_updated` ON `stories` (`owner_id`,`updated_at`);