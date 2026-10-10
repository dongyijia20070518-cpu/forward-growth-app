CREATE TABLE `classification_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`capture_id` text NOT NULL,
	`body` text NOT NULL,
	`from_type` text,
	`to_type` text NOT NULL,
	`signal_key` text,
	`topic` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_corrections_user_signal` ON `classification_corrections` (`user_id`,`signal_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_corrections_user_topic` ON `classification_corrections` (`user_id`,`topic`,`created_at`);--> statement-breakpoint
ALTER TABLE `captures` ADD `secondary_type` text;--> statement-breakpoint
ALTER TABLE `captures` ADD `reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `captures` SET `category` = 'Knowledge' WHERE `category` = 'Knowledge Candidate';--> statement-breakpoint
UPDATE `captures` SET `category` = '' WHERE `category` = '暂未分类';--> statement-breakpoint
UPDATE `captures` SET `confidence` = `confidence` / 100.0 WHERE `confidence` > 1;
