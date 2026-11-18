# Plunderclips: agent guide

A Sea of Thieves clip community where streamers promote their content and connect with each other. Unofficial fan project. The visual direction takes cues from seaofthieves.com (dark sea, parchment, painterly, cinematic). **Logos and fonts are original**; the only game art is the credited fan artwork under Microsoft's Game Content Usage Rules (see Design system → Art). Never copy SoT logos, fonts or UI.

## Workflow

- Never commit to `main`. Branch per topic: `feature/`, `fix/`, `chore/`, `refactor/`, `docs/`, `design/`. Land work via PR and link the roadmap issue (`Closes #N`). See CONTRIBUTING.md.
- Conventional Commits.
- Next.js 16.4 has breaking changes. Read `apps/web/node_modules/next/dist/docs/` before using an unfamiliar API (see `apps/web/AGENTS.md`).

## Architecture (modular monolith)

- `apps/web`: Next.js App Router (cacheComponents on, standalone output).
- `apps/worker`: background jobs on timers (Twitch/Kick live status every minute, view flushing), compose service `worker`, run with tsx. Add new periodic jobs to its `jobs` list; exactly one worker runs.
- `packages/modules/<name>`: domain modules (`identity`, `clips`, `creators`, `moderation`, `social`, `notifications`, `media`). `media` (sharp + R2) only processes and stores images; owners and permissions stay in the module that uses it. `notifications` depends only on db and shared, so any module can notify (insert inside the transaction, `announce()` after it commits). **Import only from a module's public entry** (`@plunderclips/clips`), never from `src/` internals. ESLint enforces this.
- `packages/db`: Drizzle client + schema barrel. Each module's tables live in `src/schema/<module>.ts`.
- `packages/shared`: lazy env validation (`env()`), Redis client, logger.
- `packages/ui`: shadcn components, ReactBits pieces, `cn`.

Commands: `pnpm dev:services` (Postgres + Redis in Docker), `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:generate`, `pnpm db:migrate`.

Deploy: Dokploy Compose app from `docker/compose.yml`, guide in `docs/deploy.md`. CI (`.github/workflows/ci.yml`) runs lint, typecheck, migrations, tests against Postgres + Redis, the web build and both Docker images on every PR. Env read only at build time: `SITE_URL` (build arg). Never use `NEXT_PUBLIC_*` for runtime config; Next bakes it in at build time.

Versions: TypeScript stays on 6.0.x because typescript-eslint doesn't support 7 yet. ESLint stays on 9 because the eslint-config-next plugins don't support 10.

## Auth (identity module)

- Better Auth in `packages/modules/identity`: Drizzle adapter, Redis secondary storage (sessions, OAuth state, rate limits), admin plugin with roles `user | creator | mod | admin` (`src/permissions.ts`).
- Providers turn on only when their env credentials exist (Twitch, Discord, Kick, Google→shown as YouTube). Callback: `{BETTER_AUTH_URL}/api/auth/callback/<provider>`.
- Linking: no implicit linking on sign-in; signed-in users link more platforms from `/dashboard/accounts`.
- Schema is generated, never hand-edited: `pnpm --filter @plunderclips/identity auth:schema`, then `pnpm db:generate` and `pnpm db:migrate`.
- Server: `getSession(headers)` / `requireSession()` inside a Suspense boundary (cacheComponents). Client: `@plunderclips/identity/client`. Proxy (`src/proxy.ts`) is only an optimistic cookie check.
- First admin: `UPDATE "user" SET role = 'admin' WHERE email = '...';`
- Hosted Better Auth dashboard (`@better-auth/infra` `dash()`) runs only when `BETTER_AUTH_API_KEY` is set.

## Design system

- Tokens: `packages/ui/src/styles/theme.css`. Palette "deep sea" (cues from seaofthieves.com, values our own): night-sea blue deck is the default look, `.band-parchment` / `[data-theme="light"]` is the parchment look. Use the token names (`bg-background`, `text-muted-foreground`, `bg-primary`...), never raw hex in components.
- Colour roles: `primary` (brick red) is for filled buttons only; accent text, borders and highlights use `headline` (`text-headline`: mint on the deck, dark brick on parchment). Brick as small text on the deck fails contrast (3:1).
- Type: Big Shoulders (display, `font-display`; h1/h2 are uppercase condensed caps), DM Sans (UI/body/leads), Geist Mono (labels, numbers). No serifs. Scale: `text-display`, `text-h2`, `text-h3`, `text-lead`.
- Motion: `MotionProvider` (Lenis on the GSAP ticker), `Enter` (hero entrance, once), `WordHighlight` (statement moment), ReactBits `split-text`. Hover layer utilities: `lift`, `zoom-frame`, `link-draw`. No scroll fade-ins, no tilt, no parallax on text. Everything rests under reduced motion and nothing is hidden without JS.
- Art: Sea of Thieves artwork by Namaaay (@ArteInFlames) and official Rare screenshots in `apps/web/public/art`, used under Microsoft's Game Content Usage Rules: keep the site non-commercial, keep the footer credit and the "not endorsed by or affiliated with" notice. New fan art only with the artist's OK and a credit; official screenshots are credited to Rare. Logos and fonts stay original; never copy Sea of Thieves logos, fonts or UI.
- Buttons: one family (`@plunderclips/ui/components/button`), 44px minimum tap height.

## Skill routing (avoid overlap)

| Need                                 | Use                                          | Don't                                                                            |
| ------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------- |
| Art direction, new public pages      | `design-taste-frontend`                      | stacking several design skills on one task                                       |
| Polish / critique / audit passes     | `impeccable`                                 |                                                                                  |
| Palettes, font pairing, GSAP presets | `ui-ux-pro-max`                              |                                                                                  |
| Second-opinion review only           | `frontend-design`, `apple-design` (a11y/HIG) | using them to generate                                                           |
| Reference design systems             | `docs/design-refs/*.md` (awesome-design-md)  | copying any one wholesale                                                        |
| A11y/UX compliance check             | `web-design-guidelines`                      |                                                                                  |
| Security review before deploy        | `security-audit`                             | `agent-skills:security-and-hardening` for audits (fine for build-time hardening) |
| SEO/GEO/AEO                          | `seo-geo-aeo` (phase 3)                      |                                                                                  |
| UI copy                              | `stop-slop`                                  | `humanizer` (long-form only)                                                     |
| E2E flows                            | `playwright` MCP                             |                                                                                  |
| Perf, Lighthouse, network            | `chrome-devtools` MCP                        |                                                                                  |
| Quick visual check                   | built-in browser pane                        |                                                                                  |
| Spec → plan → build discipline       | `agent-skills` (addyosmani)                  |                                                                                  |
| Codebase map                         | `graphify`                                   |                                                                                  |
| Session memory                       | `claude-mem`                                 |                                                                                  |
