/**
 * SQLite schema (Drizzle). Tables only — no driver import, so `drizzle-kit generate` can read it.
 * Migrations under `drizzle/` are produced by drizzle-kit, never written by hand.
 */
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const studies = sqliteTable("studies", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  niche: text("niche").notNull(),
  city: text("city").notNull().default(""),
  monthlyTicket: integer("monthly_ticket").notNull(),
  numIdeas: integer("num_ideas").notNull(),
  painMethod: text("pain_method").notNull(),
  mock: integer("mock", { mode: "boolean" }).notNull().default(false),
  artifactDir: text("artifact_dir").notNull(),
  brief: text("brief").notNull().default(""),
  state: text("state").notNull().default("pending"),
  step: text("step").notNull().default(""),
  error: text("error"),
  summaryJson: text("summary_json"),
  /** Consumo medido no pipeline (LLM + decisor), em JSON. Nulo em estudos antigos. */
  usageJson: text("usage_json"),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  data: text("data").notNull(),
});

export const evaluations = sqliteTable(
  "evaluations",
  {
    studyId: text("study_id").notNull(),
    rank: integer("rank").notNull(),
    name: text("name").notNull(),
    sector: text("sector").notNull().default(""),
    description: text("description").notNull(),
    index: real("index").notNull(),
    tier: text("tier").notNull(),
    payloadJson: text("payload_json").notNull(),
  },
  (table) => [primaryKey({ columns: [table.studyId, table.rank] })],
);

export const cacheEntries = sqliteTable("cache_entries", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const schema = { studies, evaluations, cacheEntries };
