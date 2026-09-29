# Bun

Runtime JS/TS all-in-one (bundler + test runner + package manager + Node compat). TypeScript, ESLint e `tsc` entram aqui apenas com o que um projeto Bun precisa na prática — este documento é autossuficiente para começar um projeto do zero.

## Quickstart (Dia 1)

Sequência executável do zero ao servidor rodando com uma rota e um teste. Cada passo aponta para a seção detalhada mais abaixo.

1. **Toolchain** — `curl -fsSL https://bun.sh/install | bash && bun upgrade` (**Bun 1.4.2**; em CI/Docker o pin é `bun-version: 1.4.2` e `oven/bun:1.4`)
2. **Scaffold** — `bun init -y`, depois `bun add hono drizzle-orm zod @t3-oss/env-core pino` e `bun add -d typescript typescript-eslint eslint prettier tinybench drizzle-kit lefthook`
3. **Arquivos de base** — `.gitignore`, `.editorconfig`, `.env.example`, `LICENSE` e `lefthook.yml` (ver abaixo), seguidos de `bunx lefthook install`
4. **Estrutura clean arch** — `mkdir -p src/domain/repositories src/application src/infrastructure/http/ui src/infrastructure/repositories src/infrastructure/db`, com o port em `src/domain/repositories/user-repository.ts`
5. **Banco** — `drizzle.config.ts` apontando para `src/infrastructure/db/schema.ts`, então `bunx drizzle-kit generate --name=init` e `bunx drizzle-kit migrate`
6. **Primeira rota** — `POST /users` (handler → `CreateUserUseCase` → port `UserRepository`) montada no composition root `src/index.ts`
7. **Primeiro teste** — RED: `bun test` com o teste de integração do repositório falhando; GREEN: o mesmo teste passando contra SQLite `:memory:`
8. **Gates locais** — `bunx prettier --check .` + `bunx eslint .` + `bunx tsc --noEmit` + `bun test --coverage` (gate de cobertura ≥ 90% vem do `bunfig.toml`)
9. **Container** — `docker build -t app .`
10. **Governança** — bootstrap do `pwn` + `pwn work init` (ver Governança (pwn))
11. **CI** — `.github/workflows/ci.yml` com os jobs `quality`, `test`, `security` e `build` (ver CI/CD)

### Arquivos de base

```gitignore
# .gitignore
# dependências e build
node_modules/
dist/
# SQLite local
*.db
*.db-shm
*.db-wal
# cobertura
coverage/
# ambiente local — o contrato das chaves é o .env.example, versionado
.env
.env.local
.env.*.local
!.env.example

# PWN (runtime)
.pwn/sandboxes/
.pwn/metrics.jsonl
.pwn/RUN-*.jsonl
.pwn/learnings.json
.pwn/gate-cache/
.piwerness
```

> `bun.lock` é **versionado** (não ignore): é ele que faz `bun install --frozen-lockfile` ser determinístico no CI e no Docker.

```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.go]
indent_style = tab

[*.{rs,java,py}]
indent_size = 4

[*.{md,yml,yaml,json}]
indent_size = 2
```

```dotenv
# .env.example
DATABASE_URL=app.db
PORT=3000
LOG_LEVEL=info
APP_ENV=development
SESSION_SECRET=<32 bytes aleatorios>
```

```text
# LICENSE
MIT License

Copyright (c) 2026 <titular>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    format:
      glob: "*.{ts,tsx,js,jsx,json,md,yml,yaml}"
      run: bunx prettier --write {staged_files}
      stage_fixed: true
    lint:
      glob: "*.{ts,tsx,js,jsx}"
      run: bunx eslint {staged_files}
    secrets:
      glob: "*"
      run: gitleaks git --staged --redact
pre-push:
  commands:
    test:
      run: bun test
```

```bash
bunx lefthook install   # grava os hooks em .git/hooks
```

## Toolchain & versões

| Componente | Referência | Notas |
|---|---|---|
| Bun | **1.4.2** | API compat Node 22+ (a maioria das APIs do Node funciona; não substitui o Node) |
| Versão por projeto | `bunfig.toml` (`[bun]` não pina versão) | Pin via CI/Docker, não há `engines` nativo |

```bash
curl -fsSL https://bun.sh/install | bash   # instala
bun upgrade                                # atualiza
```

Substitui `node`, `npm`, `npx`, `jest`/`vitest`:

- `bun` → runtime
- `bun run <script>` → scripts
- `bun add` / `bun install` → package manager (lê `package.json`)
- `bunx` → executa binários sem instalar global
- `bun test` → test runner

## Setup de projeto

```bash
bun init                    # scaffold interativo
bun create <template>       # ex.: bun create vite / hono
bun add <dep>
bun add -d <dep>            # dev dependency
```

## Arquitetura (clean arch)

Domínio protegido: `domain` não importa infra/framework; `infra` depende de `domain`. Interfaces (ports) e repositories são obrigatórios.

```
src/
  domain/             # entidades + interfaces (ports)
    repositories/
      user-repository.ts      # interface (port)
  application/        # casos de uso
  infrastructure/     # adapters: repositories impl, DB, HTTP
    repositories/
      sqlite-user-repository.ts   # implementa UserRepository
```

```ts
// domain/repositories/user-repository.ts — port (interface)
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

```ts
// infrastructure/repositories/sqlite-user-repository.ts — adapter
import { drizzle } from "drizzle-orm/bun-sqlite";

export class SqliteUserRepository implements UserRepository {
  constructor(private db: ReturnType<typeof drizzle>) {}
  // ... implementação com Drizzle, sem SQL cru
}
```

Regra de dependência: `domain` não importa nada de `application`/`infrastructure`; `infrastructure` importa `domain`.

### Caso de uso — application layer

O caso de uso recebe ports via construtor e orquestra a lógica:

```ts
// application/create-user.ts
export class CreateUserUseCase {
  constructor(private users: UserRepository) {}

  async execute(input: { name: string; email: string }): Promise<string> {
    const id = Bun.randomUUIDv7();
    const user = new User(id, input.name, input.email);
    await this.users.save(user);
    return id;
  }
}
```

> O caso de uso depende da **interface** `UserRepository`, nunca da implementação concreta.

## Validação

Runtime: **Zod** (valida na borda da aplicação).

```bash
bun add zod
```

```ts
import { z } from "zod";
const UserInput = z.object({ name: z.string().min(1), email: z.string().email() });
```

## ORM / query builder

| Ferramenta | Tipo | Notas |
|---|---|---|
| **Drizzle ORM** (recomendado) | ORM/query builder TS-first | Leve, type-safe, sem runtime pesado |
| Prisma | ORM | Schema declarativo, DX forte, engine binária |
| Kysely | Query builder | Só tipos, sem migrations |

Destaque: **Drizzle ORM** sobre `bun:sqlite` (driver nativo, zero dependência extra):

```bash
bun add drizzle-orm
bun add -d drizzle-kit
```

```ts
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";

const sqlite = new Database("app.db");
const db = drizzle(sqlite);
```

`drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/infrastructure/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: "app.db" },
});
```

**Banco**: SQLite por padrão (`bun:sqlite` embutido). Postgres via Drizzle `node-postgres` (`pg`) quando fizer sentido (concorrência, volume, replicação).

**IDs**: UUIDv7 obrigatório — `Bun.randomUUIDv7()` nativo.

> **Regra**: nenhum código de acesso a dados escreve SQL cru — só via Drizzle. Migrations geradas por `drizzle-kit generate`, nunca escritas à mão.

Dia a dia: `drizzle-kit generate` (gera migration), `drizzle-kit migrate` (aplica), `drizzle-kit studio` (UI de dados).

## Framework HTTP

| Framework | Notas |
|---|---|
| **Hono** (recomendado) | Leve, web-standard, rápido e multi-runtime (Bun, Deno, CF Workers) |

```bash
bun add hono
```

Rota mínima com clean arch (handler → use case → repository port):

```ts
// infrastructure/http/app.ts
import { Hono } from "hono";
import { CreateUserUseCase } from "../../application/create-user";

export function buildApp(createUser: CreateUserUseCase) {
  const app = new Hono();

  app.post("/users", async (c) => {
    const body = await c.req.json();
    // Dica: Para validar o payload na borda, use o middleware oficial @hono/zod-validator
    const id = await createUser.execute(body);
    return c.json({ id }, 201);
  });

  return app;
}
```

> O handler nunca acessa o banco diretamente — chama o caso de uso, que usa o port.

## UI / Templates

Renderização no servidor com **`hono/jsx`**: componentes com props tipadas, escape automático e layout por middleware — o equivalente nesta stack aos motores de template das outras linguagens (EJS, Jinja2, Qute, ERB). `hono/jsx` e `hono/jsx-renderer` já vêm no pacote `hono`: nenhuma dependência nova.

| Opção | Quando usar |
|---|---|
| **`hono/jsx`** (recomendado) | Páginas com layout e dados tipados — o caso normal. Metadados (`<title>`, `<meta>`) declarados dentro do componente são içados para o `<head>` |
| `hono/jsx-renderer` | Middleware de layout: `jsxRenderer()` define o layout uma vez e cada rota só faz `c.render(<Página />)`; suporta layouts aninhados |
| `hono/html` | Zero config (sem chaves de JSX no `tsconfig`): páginas triviais e, principalmente, **ilhas de `<script>`/`<style>`** — `{html`<script>…</script>`}` dentro de JSX não é escapado |
| `hono/jsx/dom` | Só se algum dia precisar de ilha reativa no cliente — fora do padrão desta stack (interação é vanilla JS) |

JSX exige duas chaves no `tsconfig.json` (o `jsxImportSource` dispensa importar JSX em cada arquivo). Arquivos que contêm JSX usam extensão `.tsx`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  }
}
```

```tsx
// infrastructure/http/ui/layout.tsx — layout único da aplicação
import type { FC } from "hono/jsx";

export const Layout: FC<{ title: string }> = (props) => (
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>{props.title}</title>
    </head>
    <body>{props.children}</body>
  </html>
);
```

```tsx
// infrastructure/http/ui/users-list.tsx — página como componente tipado
import type { FC } from "hono/jsx";
import { Layout } from "./layout";

export const UsersList: FC<{ users: { id: string; name: string }[] }> = ({ users }) => (
  <Layout title="Usuários">
    <h1>Usuários</h1>
    <ul>
      {users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
    <a href="/form">Novo</a>
  </Layout>
);
```

```ts
// infrastructure/http/ui/context.d.ts — tipa as props extras aceitas por c.render()
declare module "hono" {
  interface ContextRenderer {
    (content: string | Promise<string>, props: { title: string }): Response;
  }
}
```

```tsx
// infrastructure/http/ui/routes.tsx — o layout entra por middleware; a rota devolve só o conteúdo
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { jsxRenderer } from "hono/jsx-renderer";
import { CreateUserUseCase } from "../../application/create-user";
import { UserInput } from "../../domain/user";
import { issueCsrfToken, requireCsrf, type Env } from "./security";
import { Layout } from "./layout";
import { UsersForm } from "./users-form";
import { UsersList } from "./users-list";

export function buildUiApp(createUser: CreateUserUseCase) {
  const ui = new Hono<Env>();

  ui.use(csrf());         // Origin + Sec-Fetch-Site
  ui.use(issueCsrfToken); // cookie double-submit
  ui.use(jsxRenderer(({ children, title }) => <Layout title={title}>{children}</Layout>));

  ui.get("/users", (c) => c.render(<UsersList users={[]} />, { title: "Usuários" }));

  ui.get("/form", (c) => c.render(<UsersForm token={c.get("csrfToken")} />, { title: "Cadastro" }));

  ui.post("/users", requireCsrf, async (c) => {
    const input = UserInput.parse(await c.req.json());
    return c.json({ id: await createUser.execute(input) }, 201);
  });

  return ui;
}
```

O componente `UsersForm` (formulário + token CSRF e o `fetch` que o reenvia no header) e os middlewares `issueCsrfToken`/`requireCsrf` estão na seção **Segurança de sessão & CSRF** — o componente recebe o token por prop, não o lê de cookie.

> **Regra**: componente de UI não acessa banco nem regra de negócio — recebe dados já resolvidos pelo handler (que chama o caso de uso) e só monta HTML. JSX monta árvore de vnodes a cada render: em listas muito grandes, use `memo` ou gere aquele trecho com `hono/html`, que concatena strings.

Composição manual no entrypoint. O `src/index.ts` monta o grafo de dependências e inicia o servidor:

```ts
// src/index.ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { SqliteUserRepository } from "./infrastructure/repositories/sqlite-user-repository";
import { CreateUserUseCase } from "./application/create-user";
import { buildApp } from "./infrastructure/http/app";
import { buildUiApp } from "./infrastructure/http/ui/routes";

const db = drizzle(new Database("app.db"));
const userRepo = new SqliteUserRepository(db);
const createUser = new CreateUserUseCase(userRepo);

const app = buildApp(createUser);
app.route("/", buildUiApp(createUser)); // anexa as rotas de UI

console.log("Listening on http://localhost:3000");
export default {
  port: 3000,
  fetch: app.fetch,
};
```

> Injeção manual via construtor é preferida. `tsyringe` é alternativa para grafos complexos. Note que no Bun com Hono, exportamos o objeto com `fetch` para iniciar o servidor web padrão do Bun.


## Tratamento de erros

Erros de domínio como classes tipadas; o Hono converte em respostas HTTP usando `app.onError()`:

```ts
// domain/errors.ts
export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}
export class UserNotFound extends DomainError {
  constructor(id: string) {
    super("USER_NOT_FOUND", `Usuário ${id} não encontrado`);
  }
}
```

```ts
// infrastructure/http/app.ts — error handler
import { Hono } from "hono";
import { DomainError } from "../../domain/errors";

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof DomainError) {
    return c.json({ error: err.code, message: err.message }, 422);
  }
  console.error("Unhandled exception:", err);
  return c.json({ error: "INTERNAL_SERVER_ERROR", message: "Erro interno" }, 500);
});
```

> Erros de domínio nunca vazam stack traces — o handler mapeia para código HTTP e mensagem segura.

## Segurança de sessão & CSRF

A UI desta stack é renderizada no servidor (`hono/jsx`) sobre `<form>` + `fetch` na mesma origem, com sessão em cookie. É exatamente essa combinação que um site de terceiros explora: um `<form action="https://app.exemplo.com/users" method="post">` hospedado em outro domínio faz o browser da vítima enviar um `POST` autenticado com os cookies dela. Sem defesa, todo endpoint que muda estado vira um CSRF de graça.

| Defesa | Como aplicar nesta stack |
|---|---|
| `Origin` / `Sec-Fetch-Site` | `app.use(csrf())` (middleware embutido `hono/csrf`) no sub-app de UI — recusa `POST` de formulário vindo de outra origem |
| Token por sessão (double-submit) | `setSignedCookie(c, "csrf", token, SESSION_SECRET, …)` + cópia em `X-CSRF-Token` (fetch) ou no campo `_csrf` (form), comparadas em tempo constante |
| Cookie de sessão | `httpOnly: true`, `sameSite: "Lax"`, `path: "/"` e `secure: APP_ENV === "production"` — `HttpOnly` tira o cookie do alcance do JS e `SameSite=Lax` já corta `POST` cross-site |
| `Origin`/`Referer` explícitos | o middleware próprio confere `Origin` e cai para `Referer`; sem nenhum dos dois, **nega** (fail-closed) |
| HTTPS forçado | com `APP_ENV=production`, redireciona `http` → `https` com `308` e responde `Strict-Transport-Security: max-age=31536000; includeSubDomains` |

> O `hono/csrf` só inspeciona métodos não seguros cujo `Content-Type` pode vir de um formulário HTML (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`). O `fetch` da UI manda `application/json`, que **não** entra nessa checagem. O token double-submit é a defesa que cobre esse caminho — as duas se complementam.

### Mecanismo implementado

Token aleatório por sessão, guardado em cookie **assinado** (o HMAC com `SESSION_SECRET` impede que o atacante forje o par cookie/header) e comparado em tempo constante com `crypto.timingSafeEqual`:

```ts
// infrastructure/http/security.ts
import type { Context, MiddlewareHandler } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { timingSafeEqual } from "node:crypto";
import { env } from "../../config/env";

export const CSRF_COOKIE = "csrf";
export const CSRF_FIELD = "_csrf";
export const CSRF_HEADER = "X-CSRF-Token";

export type Env = { Variables: { csrfToken: string } };
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function sameOrigin(c: Context<Env>): boolean {
  const expected = new URL(c.req.url).origin;
  const origin = c.req.header("Origin");
  if (origin) return origin === expected;
  const referer = c.req.header("Referer");
  return referer ? referer.startsWith(`${expected}/`) : false;
}

async function tokenFromForm(c: Context<Env>): Promise<string | undefined> {
  const type = c.req.header("Content-Type") ?? "";
  if (!type.includes("application/x-www-form-urlencoded") && !type.includes("multipart/form-data")) {
    return undefined;
  }
  // O Hono cacheia o corpo parseado: o handler pode reler com c.req.parseBody().
  const value = (await c.req.formData()).get(CSRF_FIELD);
  return typeof value === "string" ? value : undefined;
}

/** Emite o cookie double-submit quando ele ainda não existe (roda em toda resposta de UI). */
export const issueCsrfToken: MiddlewareHandler<Env> = async (c, next) => {
  let token = await getSignedCookie(c, env.SESSION_SECRET, CSRF_COOKIE);
  if (typeof token !== "string") {
    token = crypto.randomUUID();
    await setSignedCookie(c, CSRF_COOKIE, token, env.SESSION_SECRET, {
      path: "/",
      httpOnly: false, // o client precisa ler o cookie para ecoar no header
      secure: env.APP_ENV === "production",
      sameSite: "Lax",
    });
  }
  c.set("csrfToken", token);
  await next();
};

/** Recusa método que muda estado sem mesma origem + token válido. */
export const requireCsrf: MiddlewareHandler<Env> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  if (!sameOrigin(c)) return c.json({ error: "CSRF_ORIGIN_INVALID" }, 403);

  const expected = await getSignedCookie(c, env.SESSION_SECRET, CSRF_COOKIE);
  const sent = c.req.header(CSRF_HEADER) ?? (await tokenFromForm(c));
  if (typeof expected !== "string" || sent === undefined || !constantTimeEqual(expected, sent)) {
    return c.json({ error: "CSRF_TOKEN_INVALID" }, 403);
  }
  await next();
};
```

> Acrescente `SESSION_SECRET: z.string().min(32)` e `APP_ENV: z.enum(["development", "production"]).default("development")` ao `createEnv` da seção `## Configuração`: as duas chaves estão no `.env.example` e o app não sobe sem elas.

### Form + handler

O `<form>` carrega o token em campo oculto (fallback sem JS) e o `fetch` o reenvia no header — o mesmo valor do cookie assinado. O componente recebe `token` por prop; quem lê `c.get("csrfToken")` é a rota:

```tsx
// infrastructure/http/ui/users-form.tsx
import type { FC } from "hono/jsx";
import { html } from "hono/html";
import { Layout } from "./layout";

export const UsersForm: FC<{ token: string }> = ({ token }) => (
  <Layout title="Cadastro">
    <h1>Cadastro</h1>
    <form id="my-form" method="post" action="/users">
      <input type="hidden" name="_csrf" value={token} />
      <input type="text" name="name" required />
      <button type="submit">Enviar</button>
    </form>

    {/* ilha de JS vanilla: o conteúdo de `html` não é escapado */}
    {html`<script>
      document.getElementById("my-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const token = form.elements._csrf.value; // mesmo valor do cookie assinado
        const res = await fetch("/users", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
          body: JSON.stringify({ name: form.elements.name.value }),
        });
        alert("ID gerado: " + (await res.json()).id);
      });
    </script>`}
  </Layout>
);
```

A verificação roda no handler, como `preHandler` da rota mutante (`ui/routes.tsx`):

```ts
// Verificação no handler: requireCsrf roda antes da lógica de negócio.
ui.post("/users", requireCsrf, async (c) => {
  const input = UserInput.parse(await c.req.json());
  return c.json({ id: await createUser.execute(input) }, 201);
});
```

> **Regra**: toda rota que muda estado exige token CSRF válido — mesma origem **e** token por sessão comparado em tempo constante. O token nunca vai em query string nem para o log: circula só no cookie, no campo oculto do form e no header. Webhooks e APIs públicas com autenticação própria (assinatura HMAC ou `Bearer`) ficam **fora** do filtro CSRF — monte-os em sub-app separado, sem `issueCsrfToken`/`requireCsrf`.

## Observabilidade

| Função | Ferramenta | Notas |
|---|---|---|
| Logging | **pino** | Estruturado (JSON), rápido, mesmo do Node |
| Tracing | OpenTelemetry SDK | `@opentelemetry/sdk-node` + exporter OTLP |
| Métricas | OpenTelemetry SDK | Exporter Prometheus/OTLP |

```bash
bun add pino
bun add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

```ts
import pino from "pino";
const log = pino({ level: "info" });
log.info({ userId: id }, "user created");
```

> Use logging estruturado desde o início. Existem middlewares comunitários para Hono (ex: `hono-pino`) e integrações com OpenTelemetry.

## Health check & shutdown gracioso

Dois endpoints com papéis diferentes — liveness responde "o processo está vivo", readiness responde "posso receber tráfego":

| Endpoint | Tipo | O que verifica |
|---|---|---|
| `/healthz` | liveness | Só o processo HTTP. Nunca toca banco, disco ou rede externa |
| `/readyz` | readiness | Ping **real** no SQLite (`SELECT 1`) via Drizzle |

```ts
// infrastructure/http/health.ts
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/bun-sqlite";

export function buildHealthApp(db: ReturnType<typeof drizzle>) {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.get("/readyz", (c) => {
    try {
      db.get(sql`select 1`);
      return c.json({ status: "ready" });
    } catch {
      return c.json({ status: "not-ready" }, 503);
    }
  });

  return app;
}
```

> `/healthz` não pode depender do banco: se ele falhar junto, o orquestrador reinicia um processo saudável em loop em vez de apenas tirá-lo do balanceador.

### Shutdown gracioso

`Bun.serve` devolve o handle do servidor; `await server.stop()` para de aceitar conexões novas e **drena** as requisições em andamento (sem argumento, não mata nada em voo; `server.stop(true)` mataria na hora). O entrypoint captura o handle e trata os sinais:

```ts
// src/index.ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import pino from "pino";
import { env } from "./config/env";
import { SqliteUserRepository } from "./infrastructure/repositories/sqlite-user-repository";
import { CreateUserUseCase } from "./application/create-user";
import { buildApp } from "./infrastructure/http/app";
import { buildUiApp } from "./infrastructure/http/ui/routes";
import { buildHealthApp } from "./infrastructure/http/health";

const log = pino({ level: env.LOG_LEVEL });
const sqlite = new Database(env.DATABASE_URL);
const db = drizzle(sqlite);
const createUser = new CreateUserUseCase(new SqliteUserRepository(db));

const app = buildApp(createUser);
app.route("/", buildUiApp(createUser));
app.route("/", buildHealthApp(db));

const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
log.info({ url: server.url.href }, "server up");

const SHUTDOWN_TIMEOUT_MS = 8_000; // menor que o kill do orquestrador (docker stop -t 10)
let stopping = false;

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info({ signal, pending: server.pendingRequests }, "sinal recebido — parando de aceitar conexões");

  const force = setTimeout(() => {
    log.error("drain excedeu o timeout — encerrando à força");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  await server.stop(); // drena as requisições em andamento
  clearTimeout(force);
  sqlite.close(); // fecha o SQLite depois que ninguém mais escreve
  log.info("shutdown concluído");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
```

> A forma `export default { port, fetch }` (mostrada em `## Framework HTTP`) é equivalente para servir, mas **não** devolve o handle do servidor — sem ele não há como drenar. Para produção, capture o retorno de `Bun.serve(...)`.

> **Regra**: readiness só passa com o banco acessível — `/readyz` devolve `503` e o orquestrador tira a instância do balanceador antes de matá-la. No shutdown, o orquestrador envia `SIGTERM` e o processo tem que drenar as conexões em andamento antes do timeout de kill (`docker stop -t 10`), por isso o timeout interno precisa ser menor que o dele.

## Configuração

12-factor: env vars tipadas, sem segredos no código.

| Abordagem | Notas |
|---|---|
| **`@t3-oss/env-core`** + Zod (recomendado) | Valida e tipa env vars no startup |
| `Bun.env` direto | Funciona, mas sem validação nem tipos seguros |

```bash
bun add @t3-oss/env-core zod
```

```ts
// src/config/env.ts
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().default("app.db"),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  },
  runtimeEnv: Bun.env,
});
```

> O app falha no startup se uma variável obrigatória estiver ausente — fail fast.

> **Segredos**: `.env` é local e gitignored; `.env.example` é versionado e é o contrato das chaves exigidas. Nenhum segredo em código, configs commitados, logs ou CI — credenciais vêm do ambiente (orquestrador / GitHub Secrets). `gitleaks` roda no pre-commit e no CI; segredo exposto deve ser rotacionado imediatamente.

## Lint / format / test / benchmark

| Função | Ferramenta | Comando |
|---|---|---|
| Testes | `bun test` (embutido) | `bun test` |
| Cobertura | `bun test --coverage` | gate ≥ 90% via `bunfig.toml` |
| Benchmark | `tinybench` | `bun run bench` |
| Lint | ESLint (flat config) | `bunx eslint .` |
| Tipos | `tsc --noEmit` | `bunx tsc --noEmit` |
| Format | Prettier | `bunx prettier --write .` |

```bash
bun add -d tinybench eslint typescript-eslint prettier
```

ESLint usa **flat config** (`eslint.config.js`):

```js
// eslint.config.js
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  { ignores: ["dist/", "drizzle/"] },
);
```

Cobertura ≥ 90% em `bunfig.toml` (threshold é **por arquivo**, não agregado):

```toml
[test]
coverage = true
coverageThreshold = 0.9
coverageReporter = ["text", "lcov"]
```

Dia a dia:

```bash
bun test --coverage    # testes + gate de cobertura (≥ 90%)
bun run bench          # benchmarks (tinybench)
bunx eslint .          # lint
bunx tsc --noEmit      # tipos
```

### Teste de integração

Teste que exercita o adapter real com SQLite in-memory (`bun:sqlite`):

```ts
// src/infrastructure/repositories/sqlite-user-repository.test.ts
import { describe, test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { SqliteUserRepository } from "./sqlite-user-repository";

describe("SqliteUserRepository", () => {
  test("save and findById round-trip", async () => {
    const db = drizzle(new Database(":memory:"));
    // migrate(db) — aplica schema em memória
    const repo = new SqliteUserRepository(db);

    const id = Bun.randomUUIDv7();
    await repo.save(new User(id, "Alice", "alice@x.com"));
    const found = await repo.findById(id);

    expect(found).not.toBeNull();
    expect(found!.name).toBe("Alice");
  });
});
```

> Testes de integração usam banco real in-memory; testes unitários de caso de uso mockam o port.

## Segurança & qualidade

| Função | Ferramenta | Comando |
|---|---|---|
| Vulnerabilidades de deps | `bun audit` | `bun audit --audit-level=high` |
| Desatualizadas | `bun outdated` | `bun outdated` |
| SAST | Semgrep | `semgrep scan` |

Qualidade já coberta por ESLint + `tsc --noEmit`. Adicione `eslint-plugin-security` em projetos expostos à rede.

## Build / deploy

```bash
bun build src/index.ts --outdir dist --target bun
bun build --compile src/index.ts --outfile app   # binário single-file (embute runtime)
```

Docker (imagem oficial `oven/bun`):

```dockerfile
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build src/index.ts --outdir dist

FROM oven/bun:1.4
WORKDIR /app
COPY --from=build /app/dist ./dist
CMD ["bun", "dist/index.js"]
```

> `bun build --compile` gera um executável standalone (sem runtime externo) — útil para distribuir sem Docker.

## CI/CD (GitHub Actions)

Um único workflow cobre os quatro gates. `bun-version` fixa a versão de referência do doc (`1.4.2`) e o cache reaproveita o diretório de downloads do Bun entre execuções:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  quality:
    name: quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.2
      - uses: actions/cache@v6
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock', 'bun.lockb') }}
      - run: bun install --frozen-lockfile
      - run: bunx prettier --check .
      - run: bunx eslint .
      - run: bunx tsc --noEmit

  test:
    name: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.2
      - uses: actions/cache@v6
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock', 'bun.lockb') }}
      - run: bun install --frozen-lockfile
      # coverageThreshold = 0.9 no bunfig.toml faz o job falhar abaixo de 90%
      - run: bun test --coverage

  security:
    name: security
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # gitleaks precisa do histórico
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.2
      - uses: actions/cache@v6
        with:
          path: ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock', 'bun.lockb') }}
      - run: bun install --frozen-lockfile
      - run: bun audit --audit-level=high
      - uses: gitleaks/gitleaks-action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/setup-python@v7
        with:
          python-version: "3.12"
      - run: pip install semgrep
      - run: semgrep scan --config auto --error

  build:
    name: build
    needs: [quality, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: docker build -t app:${{ github.sha }} .
```

**Proteção de branch**: em `main`, marque `quality`, `test` e `security` como *required status checks* (Settings → Branches → branch protection), com "Require branches to be up to date before merging". Assim nenhum merge chega em `main` sem formatação, lint, tipos, cobertura ≥ 90%, auditoria de dependências/segredos e SAST.

**Migração zero-downtime**: migrations rodam como **passo separado** antes do deploy da nova versão (ex.: `docker run --rm app bunx drizzle-kit migrate` num job próprio, com lock — nunca no boot de cada réplica, senão N instâncias migram em paralelo). Use *expand-and-contract*: (1) **expand** — migration puramente aditiva (coluna/tabela nova, anulável ou com default), compatível com o código em produção; (2) deploy do código que escreve nos dois formatos; (3) **contract** — só depois de todo o tráfego estar na versão nova, a migration que remove o campo antigo. Cada passo é reversível e nenhum deles quebra a versão que ainda está rodando.

## Governança (pwn)

O harness `pwn` (Bun ≥ 1.4) é instalado **fora** do projeto e executado **na raiz do projeto-alvo** — todo o estado vive em `.pwn/` dentro do projeto.

```bash
git clone https://github.com/passoz/pwn.git ~/tools/pwn
pwn() { bun ~/tools/pwn/bin/pwn.js "$@"; }   # ou ponha o wrapper no PATH
pwn work init                                      # cria .pwn/work/0001/
```

> **Regra de ingresso**: toda ação pedida em prompt (usuário, agente ou issue) passa pela governança do `pwn` — nunca direto no código. O pedido entra como `.prompts/NNNN-change.md`, é validado com `pwn work specify` contra `.specs/system.json`, vira task com contrato V4 congelado e só executa via `pwn work run` (sandbox + allowlist de shell + Diff Guard). Ajuste "trivial" não é exceção: o que não cabe no contrato vigente abre contrato novo, não implementação ad-hoc.

Ciclo: 5 gates determinísticos (`GATE-DISC-REQ` → `GATE-REQ-PRD` → `GATE-PRD-SPEC` → `GATE-SPEC-PLAN` → `GATE-PLAN-CONTRACT`), execução em sandbox git worktree (`.pwn/sandboxes/<run-id>`), diff guard por `write_allow`/`write_deny` e auditoria RED/GREEN por task. Exit codes: `0` ok · `1` falha (gate/contrato/política) · `3` suspenso para revisão humana (risco L4, fila AFK).

```bash
pwn work scaffold --title "..."                                     # discovery→prd→spec→plan+contrato
pwn work gate GATE-DISC-REQ                                         # gates na ordem da cadeia
pwn work run --work 0001 -- bun test                                # sandbox + diff guard (fail-closed)
pwn work audit --work 0001 --task 1.1                               # evidência GREEN/verify
pwn work audit red --work 0001 --task 1.1 --expect "..." -- bun test  # registra RED
pwn queue list                                                      # riscos L4 pendentes
```

`<teste>` desta stack: `bun test`.

> Versões verificadas em 2026-09-15.
