CREATE TABLE `captures` (
	`id` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`category` text NOT NULL,
	`topic` text,
	`confidence` integer DEFAULT 78 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `progress_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`why` text DEFAULT '' NOT NULL,
	`current_state` text DEFAULT '' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`accent` text DEFAULT 'blue' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`period_kind` text NOT NULL,
	`period_label` text NOT NULL,
	`reflection` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`level` text NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`tier` text DEFAULT 'suggested' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`due_date` text NOT NULL,
	`carry_count` integer DEFAULT 0 NOT NULL,
	`progress_text` text DEFAULT '' NOT NULL,
	`project_id` text,
	`created_at` text NOT NULL,
	`completed_at` text
);
