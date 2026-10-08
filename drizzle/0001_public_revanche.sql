CREATE INDEX `idx_captures_topic` ON `captures` (`topic`);--> statement-breakpoint
CREATE INDEX `idx_progress_project_created` ON `progress_events` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_projects_status_updated` ON `projects` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status_due` ON `tasks` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_tasks_project` ON `tasks` (`project_id`);