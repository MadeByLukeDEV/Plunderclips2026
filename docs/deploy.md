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

Open the **Environment** tab and paste the following, filled in, then turn on **Create Environment
File** and save. Without that switch Dokploy stores the variables but never writes the `.env` file
that compose reads, and the deploy stops with "required variable … is missing a value". Variables
marked _required_ stop the deploy with a clear error when they're missing.

```env
# required
DATABASE_URL=postgres://plunderclips:<password>@<db-host>:5432/plunderclips
BETTER_AUTH_URL=https://plunderclips.example
BETTER_AUTH_SECRET=<openssl rand -base64 48>
IP_HASH_SALT=<openssl rand -base64 24>

# Cloudflare Turnstile (anonymous submissions are refused without it)
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
# optional: extra hosts the widget runs on, comma-separated (default: the host of BETTER_AUTH_URL)
TURNSTILE_HOSTNAMES=

# optional: 7TV emote set IDs every chat gets (comma-separated)
SEVENTV_EMOTE_SETS=

# Sign-in providers: each one turns on when both values are set
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# optional: your own Redis instead of the bundled one, e.g. a Redis service in Dokploy
REDIS_URL=

# optional: Better Auth hosted dashboard (sends auth events to Better Auth's cloud)
BETTER_AUTH_API_KEY=
```

Notes:

- `BETTER_AUTH_URL` is also the site URL baked into the build (Open Graph links). After changing
  it, redeploy so the image is rebuilt.
- **Database host:** for a database Dokploy manages, use its internal hostname from the database's
  page (e.g. `services-postgresql-ab12cd`) as `<db-host>`. `migrate` and `web` join
  `dokploy-network` to reach it. For a database outside Docker, use an address the server can
  reach, not `localhost` (inside a container that's the container itself).
- **Redis:** leave `REDIS_URL` empty to use the bundled `cache` service. To use a Redis service you
  already run in Dokploy, set it to that service's internal URL (its full internal hostname from Dokploy, not a bare
  `redis`), with its password and a database
  number of its own: `redis://default:<password>@<redis-host>:6379/1`. The number keeps
  Plunderclips' keys (`auth:`, `rl:`, `views:`) apart from other apps on the same Redis. Don't give
  that Redis an `allkeys-*` eviction policy: it could drop sessions and pending view counts. The
  bundled service then just sits idle.
- **Redis user (ACL):** if the URL uses its own user, that user needs reads and writes,
  transactions, Lua scripts (rate limits), `SCAN`/`RENAME` (view counter flush), `SELECT` (the
  database number) and `INFO` (the client's ready check), on the keys `auth:*`, `rl:*`, `views:*`
  and `clips:*`:

  ```
  ACL SETUSER plunderclips on >PASSWORD ~auth:* ~rl:* ~views:* ~clips:* +@all -@dangerous +info +select
  ```

- Generate secrets with `openssl rand -base64 48`. Never reuse the dev values.
- `IP_HASH_SALT` salts the IP hashes used for rate limits and abuse review. Changing it later
  resets every rate-limit window and makes old hashes unmatchable. Pick it once.
- **Client IP:** rate limits use the address Traefik adds to `X-Forwarded-For` (the last entry).
  Behind a CDN, either set `CLIENT_IP_HEADER` to the header it sends (Cloudflare:
  `CLIENT_IP_HEADER=cf-connecting-ip`), or set `TRUSTED_PROXY_HOPS=2`.
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

## Worker (live status)

The `worker` service runs background jobs: it checks every creator's Twitch and Kick channels once a minute for live status (the "Live now" badges and strip), writes pending view counts to Postgres, fills this week's **This week** section from votes every hour (mod picks stay, and clips a mod removed stay out), and saves each clip's daily view and vote totals for the creator analytics page. It uses the same `TWITCH_CLIENT_ID/SECRET` and `KICK_CLIENT_ID/SECRET` as sign-in; without them, that platform's live status stays off. Run exactly one worker; its logs show each job (`job done` / `job failed`).

## Search engines and AI search

The site serves `/robots.txt`, `/sitemap.xml` (clips, creators, crews and sections, refreshed hourly) and `/llms.txt` (a plain-language map for AI assistants). Pages carry structured data: VideoObject on clip pages, ProfilePage on creator pages, Organization and Event on crew pages, FAQPage on `/submit`, and breadcrumbs. Share cards are generated per clip, creator and crew.

After the first deploy, add the domain in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters) and submit `https://your-domain/sitemap.xml`. Check a clip page in the [Rich Results Test](https://search.google.com/test/rich-results).

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

## Turnstile

1. Cloudflare dashboard → Turnstile → Add widget. Hostnames: your domain (add `www.` too if it serves the site). Mode: Managed.
2. Put the site key and secret key in `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`. Cloudflare's test keys (`1x000…`) are refused in production on purpose.
3. The server accepts a token only when Cloudflare says `success`, the action is `submit_clip`, and the hostname is the one in `BETTER_AUTH_URL` (or listed in `TURNSTILE_HOSTNAMES`). Tokens are single-use and expire after 5 minutes.
4. Check the secret works (run it on your own machine, it sends the secret to Cloudflare only):

   ```bash
   curl -s https://challenges.cloudflare.com/turnstile/v0/siteverify -d secret=<your secret> -d response=XXXX.DUMMY.TOKEN.XXXX
   ```

   A working secret answers `"error-codes":["invalid-input-response"]`. `invalid-input-secret` means the secret is wrong.

5. Submit a clip while signed out: the widget shows above the button and the clip lands in the review queue. Rejections are logged as `turnstile rejected`, `turnstile action mismatch` or `turnstile hostname mismatch`.

## Image uploads (Cloudflare R2)

Members can upload a profile banner, and captains a crew banner and logo. The app re-encodes every upload to WebP (no EXIF or location data, fixed sizes) and stores it in an R2 bucket that serves the files.

1. Cloudflare dashboard → **R2** → **Create bucket**, e.g. `plunderclips-media`.
2. The bucket → **Settings** → **Custom Domains** → connect a subdomain of your site's zone, e.g. `media.your-domain`. (The `r2.dev` URL works too, but Cloudflare rate-limits it.)
3. **R2** → **Manage API tokens** → **Create API token**: permission **Object Read & Write**, limited to that bucket. Copy the **Access Key ID** and **Secret Access Key**. Your **Account ID** is on the R2 overview page.
4. In Dokploy, set:

   ```env
   MEDIA_DRIVER=r2
   MEDIA_PUBLIC_URL=https://media.your-domain
   R2_ACCOUNT_ID=<32 hex characters>
   R2_ACCESS_KEY_ID=<from step 3>
   R2_SECRET_ACCESS_KEY=<from step 3>
   R2_BUCKET=plunderclips-media
   ```

5. Redeploy. The upload buttons appear in **Your page** and in crew settings once all six are set. Without them, uploads stay off and the artwork banners are used.

Mods and admins can take an uploaded banner or logo down from the creator or crew page; it's logged in the audit log.

## Chat (live messages)

Chat streams new messages with server-sent events from `/api/chat/<channel>/stream`, and Redis pub/sub carries them between app instances. Nothing to configure, but the path must not be buffered:

- **Traefik** (Dokploy) streams by default.
- **Cloudflare** proxies event streams; the app sends a heartbeat every 25 s so idle streams stay under Cloudflare's 100 s timeout. Don't add a Cache Rule or "Cache Everything" on `/api/*`.
- **Emotes:** every chat gets the 7TV and BTTV global sets, plus the 7TV/BTTV emotes of members who linked Twitch. To add your own collection everywhere, make an emote set on 7tv.app, fill it, and put its ID (from `7tv.app/emote-sets/<id>`) in `SEVENTV_EMOTE_SETS` (comma-separated for several). Captains can attach one set to their crew in crew settings. Sets are cached for an hour, so edits on 7TV show up within one.
- **Redis** is required for live delivery. If it's down, messages still save and show up when the page reconnects or reloads.

## Troubleshooting

| Symptom                                              | Look at                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy fails right away with "set … in Dokploy"      | A required variable is missing, or **Create Environment File** is off in the Environment tab.                                                                                                                                                                                                                                    |
| `migrate` fails with `getaddrinfo EAI_AGAIN <host>`  | The database hostname doesn't resolve: check it, and that `dokploy-network` exists (it does on any Dokploy server).                                                                                                                                                                                                              |
| `migrate` exits non-zero                             | Its logs: usually `DATABASE_URL` or permissions (the user must own the database).                                                                                                                                                                                                                                                |
| `/api/health` 503 with `"database":"down"`           | Can the Dokploy server reach the database host and port? Firewall, `pg_hba.conf`.                                                                                                                                                                                                                                                |
| Sign-in fails with "invalid origin"                  | `BETTER_AUTH_URL` must exactly match the public URL, with `https://` and no trailing slash.                                                                                                                                                                                                                                      |
| Sign-in redirect error at the provider               | The redirect URL registered with the provider doesn't match step 5.                                                                                                                                                                                                                                                              |
| No bot check on `/submit`, anonymous submits refused | `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` aren't set, or they are Cloudflare's test keys.                                                                                                                                                                                                                                  |
| No "Live" badges                                     | The `worker` service isn't running, or the Twitch/Kick credentials are missing. Check its logs for `job failed`.                                                                                                                                                                                                                 |
| Upload buttons don't show                            | All six `MEDIA_*`/`R2_*` variables must be set (and `MEDIA_DRIVER=r2`).                                                                                                                                                                                                                                                          |
| Uploads fail with "didn't save"                      | The `web` logs have `… upload failed` with R2's reason. `SignatureDoesNotMatch`: wrong `R2_SECRET_ACCESS_KEY`. `InvalidAccessKeyId`: wrong `R2_ACCESS_KEY_ID`. `AccessDenied`: the token lacks Object Read & Write on the bucket. `NoSuchBucket`: wrong `R2_BUCKET` or `R2_ACCOUNT_ID`. `R2 unreachable`: wrong `R2_ACCOUNT_ID`. |
| Chat messages only appear after a reload             | Something buffers `/api/chat/*/stream`: check Cloudflare cache rules and any proxy between Traefik and the app.                                                                                                                                                                                                                  |
| Anonymous submits fail the bot check                 | Logs: `hostname mismatch` → add the host to `TURNSTILE_HOSTNAMES`; `rejected` → see Cloudflare's error code.                                                                                                                                                                                                                     |
