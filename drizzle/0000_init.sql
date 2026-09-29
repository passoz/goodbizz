CREATE TABLE `cache_entries` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evaluations` (
	`study_id` text NOT NULL,
	`rank` integer NOT NULL,
	`name` text NOT NULL,
	`sector` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`index` real NOT NULL,
	`tier` text NOT NULL,
	`payload_json` text NOT NULL,
	PRIMARY KEY(`study_id`, `rank`)
);
--> statement-breakpoint
CREATE TABLE `studies` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`niche` text NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`monthly_ticket` integer NOT NULL,
	`num_ideas` integer NOT NULL,
	`pain_method` text NOT NULL,
	`mock` integer DEFAULT false NOT NULL,
	`artifact_dir` text NOT NULL,
	`brief` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`step` text DEFAULT '' NOT NULL,
	`error` text,
	`summary_json` text
);
