import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/infrastructure/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  // `drizzle-kit` roda em Node, onde `Bun` nao existe; ler o ambiente pelos dois lados mantem
  // o comando funcionando tanto sob `bun run db:generate` quanto sob drizzle-kit direto.
  dbCredentials: { url: process.env.DATABASE_URL ?? globalThis.Bun?.env?.DATABASE_URL ?? "app.db" },
});
