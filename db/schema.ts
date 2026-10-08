import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(), title: text("title").notNull(),
  why: text("why").notNull().default(""), currentState: text("current_state").notNull().default(""),
  nextStep: text("next_step").notNull().default(""), status: text("status").notNull().default("active"),
  accent: text("accent").notNull().default("blue"), updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_projects_status_updated").on(table.status, table.updatedAt)]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(), title: text("title").notNull(), notes: text("notes").notNull().default(""),
  tier: text("tier").notNull().default("suggested"), status: text("status").notNull().default("open"),
  dueDate: text("due_date").notNull(), carryCount: integer("carry_count").notNull().default(0),
  progressText: text("progress_text").notNull().default(""), projectId: text("project_id"),
  createdAt: text("created_at").notNull(), completedAt: text("completed_at"),
}, (table) => [index("idx_tasks_status_due").on(table.status, table.dueDate), index("idx_tasks_project").on(table.projectId)]);

export const captures = sqliteTable("captures", {
  id: text("id").primaryKey(), body: text("body").notNull(), category: text("category").notNull(),
  topic: text("topic"), confidence: integer("confidence").notNull().default(78), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_captures_topic").on(table.topic)]);

export const progressEvents = sqliteTable("progress_events", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull(),
  body: text("body").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_progress_project_created").on(table.projectId, table.createdAt)]);

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(), name: text("name").notNull(), level: text("level").notNull(),
  evidence: text("evidence").notNull().default(""), updatedAt: text("updated_at").notNull(),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(), periodKind: text("period_kind").notNull(), periodLabel: text("period_label").notNull(),
  reflection: text("reflection").notNull().default(""), createdAt: text("created_at").notNull(),
});
