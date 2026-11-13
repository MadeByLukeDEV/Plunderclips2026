# Deploying to Dokploy

The production stack is `docker/compose.yml`: the Next.js app (`web`), a one-shot `migrate`
service, and Redis. Postgres runs on your own server and is reached through `DATABASE_URL`.

```
browser ── Traefik (Dokploy, HTTPS) ── web:3000 ── Redis (in the stack)
                                          └──────── Postgres (your server)
migrate ── runs once per deploy, before web starts
```

## 1. Before you start

- A Dokploy server, and a domain whose DNS `A` record points at it (e.g. `plunderclips.example`).
- A Postgres 16+ database the Dokploy server can reach. Create a database and a user for it:

  ```sql
  CREATE USER plunderclips WITH PASSWORD '<strong password>';
  CREATE DATABASE plunderclips OWNER plunderclips;
  ```

  The migrations create a trigger function, so the user needs to own the database (as above).

## 2. Create the Compose app

In Dokploy: **Projects → New project → Create service → Compose**.

| Setting      | Value                                                |
| ------------ | ---------------------------------------------------- |
| Provider     | GitHub, repository `Plunderclips2026`, branch `main` |
| Compose path | `./docker/compose.yml`                               |
| Compose type | Docker Compose                                       |

## 3. Environment

Open the **Environment** tab and paste the following, filled in. Dokploy writes it to a `.env`
file next to the compose file. Variables marked _required_ stop the deploy with a clear error
when they're missing.

```env
# required
DATABASE_URL=postgres://plunderclips:<password>@<db-host>:5432/plunderclips
BETTER_AUTH_URL=https://plunderclips.example
BETTER_AUTH_SECRET=<openssl rand -base64 48>
IP_HASH_SALT=<openssl rand -base64 24>

# Cloudflare Turnstile (anonymous submissions are refused without it)
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Sign-in providers: each one turns on when both values are set
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# optional: Better Auth hosted dashboard (sends auth events to Better Auth's cloud)
BETTER_AUTH_API_KEY=
```

Notes:

- `BETTER_AUTH_URL` is also the site URL baked into the build (Open Graph links). After changing
  it, redeploy so the image is rebuilt.
- Generate secrets with `openssl rand -base64 48`. Never reuse the dev values.
- `IP_HASH_SALT` salts the IP hashes used for rate limits and abuse review. Changing it later
  resets every rate-limit window and makes old hashes unmatchable. Pick it once.
- `DEV_LOGIN` does nothing in production, so leave it out.

## 4. Domain

**Domains → Add domain**: host `plunderclips.example`, service `web`, container port `3000`,
HTTPS on with Let's Encrypt.

Don't publish port 3000 on the host. The app trusts `x-forwarded-for` from Traefik for rate
limits, so it must only be reachable through the proxy.

## 5. OAuth apps

For each platform you turn on, register this redirect URL in its developer console:

```
https://plunderclips.example/api/auth/callback/twitch
https://plunderclips.example/api/auth/callback/discord
https://plunderclips.example/api/auth/callback/kick
https://plunderclips.example/api/auth/callback/google
```

For Google, also enable the **YouTube Data API v3** for the project (the YouTube sign-in asks
for read-only channel access).

## 6. Deploy

Press **Deploy**. Dokploy builds the images, runs `migrate` (it applies any pending migrations
in `packages/db/migrations` and exits), then starts `web` once Redis is healthy.

Check it:

```bash
curl -s https://plunderclips.example/api/health
```

`{"status":"ok","database":"ok","cache":"ok"}` means the app reaches both Postgres and Redis.
A 503 marks the one it can't reach as `"down"`.

## 7. First admin

Sign in once with any provider, then on the database:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
```

Sign out and back in. **Admin** appears in the header, and everything else (roles for mods
and creators) can be done from `/admin/users`.

## Updating

- **Auto deploy:** in the app's **General** tab turn on _Autodeploy_. Dokploy then redeploys on
  every push to `main`. Merges only reach `main` through PRs, and CI runs on every PR.
- **Migrations:** every deploy runs `migrate` first. A migration that fails stops the deploy
  before the new `web` starts, so the old version keeps running. Check the `migrate` logs.
- **Rollback:** redeploy an earlier commit from **Deployments**. Migrations are forward-only. If
  a release added a column, the older code ignores it, which is fine. Don't roll back across a
  migration that removed something the old code needs.

## Images on GHCR (optional)

CI builds both images on every PR and pushes them to
`ghcr.io/madebylukedev/plunderclips:web-<sha>` / `:migrate-<sha>` (and `web-latest`,
`migrate-latest`) on every push to `main`. To deploy prebuilt images instead of building on the
Dokploy server, replace the two `build:` blocks in a copy of the compose file with
`image: ghcr.io/madebylukedev/plunderclips:web-latest` (and `migrate-latest`). Set the
repository variable `SITE_URL` so CI builds with your domain.

## Backups

- **Postgres** holds everything that matters. Back it up on your server, e.g. a nightly
  `pg_dump -Fc` kept for 14 days.
- **Redis** (volume `redisdata`) holds sessions, rate-limit windows and views not yet written to
  Postgres (at most about a minute's worth). Losing it signs people out and drops those few views;
  nothing else.

## Troubleshooting

| Symptom                                              | Look at                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Deploy fails right away with "set … in Dokploy"      | A required variable is missing in the Environment tab.                                      |
| `migrate` exits non-zero                             | Its logs: usually `DATABASE_URL` or permissions (the user must own the database).           |
| `/api/health` 503 with `"database":"down"`           | Can the Dokploy server reach the database host and port? Firewall, `pg_hba.conf`.           |
| Sign-in fails with "invalid origin"                  | `BETTER_AUTH_URL` must exactly match the public URL, with `https://` and no trailing slash. |
| Sign-in redirect error at the provider               | The redirect URL registered with the provider doesn't match step 5.                         |
| No bot check on `/submit`, anonymous submits refused | `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` aren't set.                                 |
