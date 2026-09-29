import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/infrastructure/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: Bun.env.DATABASE_URL ?? "app.db" },
});
