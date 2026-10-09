CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`nickname` text NOT NULL,
	`first_capture_completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
DROP INDEX `idx_captures_topic`;--> statement-breakpoint
ALTER TABLE `captures` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_captures_user_topic` ON `captures` (`user_id`,`topic`);--> statement-breakpoint
CREATE INDEX `idx_captures_user_created` ON `captures` (`user_id`,`created_at`);--> statement-breakpoint
DROP INDEX `idx_progress_project_created`;--> statement-breakpoint
ALTER TABLE `progress_events` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_progress_user_project_created` ON `progress_events` (`user_id`,`project_id`,`created_at`);--> statement-breakpoint
DROP INDEX `idx_projects_status_updated`;--> statement-breakpoint
ALTER TABLE `projects` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_projects_user_status_updated` ON `projects` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
DROP INDEX `idx_tasks_status_due`;--> statement-breakpoint
DROP INDEX `idx_tasks_project`;--> statement-breakpoint
ALTER TABLE `tasks` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_tasks_user_status_due` ON `tasks` (`user_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_tasks_user_project` ON `tasks` (`user_id`,`project_id`);--> statement-breakpoint
ALTER TABLE `reviews` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reviews_user_period` ON `reviews` (`user_id`,`period_kind`,`period_label`);--> statement-breakpoint
ALTER TABLE `skills` ADD `user_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_skills_user_updated` ON `skills` (`user_id`,`updated_at`);