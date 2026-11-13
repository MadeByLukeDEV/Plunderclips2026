# Pre-launch audit, November 2026

Scope: the whole repository at the start of `chore/pre-launch-audit` (after #30), roadmap issue #12.
Four parts: a security review, a web interface guidelines check, Lighthouse on a production build,
and a Playwright end-to-end test for the core loop.

All testing was local: dev Postgres and Redis in Docker, dummy dev accounts, the production build
served on localhost. Nothing was run against a deployed site or a third-party account.

## Summary

| Area                                  | Result                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Security                              | 4 findings fixed (1 medium, 3 low). No critical or high findings.           |
| Accessibility (Lighthouse, mobile)    | 100 on every public page after fixes (was 93 on clip pages, 98 on `/clips`) |
| Best practices (Lighthouse)           | 100 on every public page                                                    |
| SEO (Lighthouse)                      | 100, except `/sign-in` (intentionally `noindex`) and clip pages (see note)  |
| Performance, mobile (Slow 4G, 4× CPU) | Home LCP 4.4 s → 2.2 s, clip page LCP 2.3 s, CLS 0.00–0.02                  |
| End-to-end                            | submit → approve → visible, plus admin 404 for members: passing, runs in CI |

## Security findings

### 1. Moderators could bypass the ban rules and read emails through Better Auth's admin API (medium, fixed)

**Boundary:** a `mod` account (lower trust than `admin`) against the moderation rules: only admins
ban mods, nobody bans an admin, mods don't see email addresses.

Those rules lived in `packages/modules/moderation/src/users.ts`. But the catch-all auth route also
served the admin plugin's own endpoints (`/api/auth/admin/*`), which check only role permissions.
The `mod` role has `user: ["list", "get", "ban"]`, so a mod could call them directly.

**Reproduced locally** with the dummy dev accounts: signed in as `mod@plunderclips.test`,
`GET /api/auth/admin/list-users` returned members' emails, and `POST /api/auth/admin/ban-user`
banned `admin@plunderclips.test` (`banned = t` in the database).

**Fix:** `packages/modules/identity/src/next-handler.ts` answers 404 for every `/api/auth/admin/*`
path. The app never calls these from the browser; the moderation module uses `auth.api.*` on the
server, which doesn't go through the HTTP route. After the fix, the same requests returned 404 and the
admin stayed unbanned. Regression tests: `packages/modules/identity/test/next-handler.test.ts`.

### 2. Client IP taken from the first X-Forwarded-For entry (low, fixed; deployment check needed)

**Boundary:** an anonymous visitor against the per-IP limits on anonymous submissions, votes,
view counting and reports, and Better Auth's sign-in rate limits.

`clientIp()` used the first `X-Forwarded-For` entry, which a client can set. Whether that's
exploitable depends on the proxy in front, which isn't in the repository: a proxy that appends
instead of replacing the header, or a CDN in front of Traefik, would let a visitor pick their own IP
or put everyone behind the CDN's addresses.

**Fix:** `packages/shared/src/ip.ts` now trusts only what our own proxies added, counted from the
right (`TRUSTED_PROXY_HOPS`, default 1 for Traefik alone), or a single CDN header when configured
(`CLIENT_IP_HEADER`, e.g. `cf-connecting-ip`). Values that aren't IP addresses are rejected. Better
Auth now gets the same IP through an internal header that the route handler sets and that clients
can't supply. Verified: a request with `X-Forwarded-For: 6.6.6.6, 203.0.113.50` records
`203.0.113.50`.

**Check after deploy:** if the site goes behind Cloudflare or another CDN, set `CLIENT_IP_HEADER`
(see `docs/deploy.md`).

### 3. Clip metadata fetches followed redirects before checking the host (low, fixed)

**Boundary:** a submitted clip URL against the rule that the server only contacts the clip
platforms' own hosts.

Requests only ever start at URLs built from parsed parts on allowlisted hosts, but they used
`redirect: "follow"` and checked the host of the _final_ URL. Every intermediate hop had already
been requested by then, so an open redirect on an allowed host could make the server send a GET to
any address, internal ones included (blind SSRF).

**Fix:** `packages/modules/clips/src/http.ts` follows redirects by hand (at most 3) and checks
each hop before requesting it. Tests cover a redirect to `169.254.169.254` (never requested),
an allowed redirect (followed), and a loop (stopped).

### 4. No security headers (low, fixed)

Nothing stopped another site from framing pages like `/admin/users` (clickjacking on the ban and
role buttons).

**Fix:** `apps/web/next.config.ts` sends `Content-Security-Policy: frame-ancestors 'none';
object-src 'none'; base-uri 'self'; form-action 'self'`, `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a permissions policy that turns off device APIs
(autoplay and fullscreen stay available to the clip players), and HSTS in production. Checked that
YouTube embeds still play and Turnstile still issues tokens.

### Reviewed with no finding

- **Server actions:** all eight check the session or role on the server. Bound arguments that
  come back from the browser only identify a target, which is validated again.
- **Admin area:** layout, every action, and every moderation function check permissions separately.
  Non-staff get a plain 404.
- **XSS:** no user-controlled raw HTML (the one `dangerouslySetInnerHTML` is a constant). User and
  platform text renders escaped. Links and thumbnails must be `https:`. Player iframes only load
  from each platform's own player hosts.
- **Open redirects:** `?next=` is sanitized, and Better Auth checks callback URLs against the site
  origin.
- **Dev login:** disabled whenever `NODE_ENV=production`, whatever `DEV_LOGIN` says. The image sets
  `NODE_ENV=production`.
- **Secrets:** nothing secret goes into the Docker image (`SITE_URL` is the only build argument).
  `.env*` is excluded from the build context. The runner is non-root.
- **CI:** read-only token, `packages: write` only on the image job. Pull requests from forks get no
  secrets and push nothing.

### Residual risks (accepted, documented)

- **Ban delay:** Better Auth caches session data in a cookie for 5 minutes, so a member banned
  mid-session can keep making requests for up to 5 minutes. Banning deletes their sessions; the
  cache only delays the effect.
- **No script CSP:** a full `script-src` policy needs per-request nonces, which don't fit partial
  prerendering. Follow-up if that changes in Next.
- **Channel ownership:** anyone can list any channel on their creator page. Mods handle
  impersonation reports; checking against the linked OAuth account is a possible follow-up.

## Web interface guidelines

Checked against the current Vercel Web Interface Guidelines. Fixed:

- **Hydration:** dates in client components used the server's timezone during SSR and the
  browser's after hydration, and linked accounts used the visitor's locale. Both could break
  hydration. Dates are now formatted `en-GB` in UTC everywhere.
- **Mobile keyboard:** `autoFocus` on the submit form popped the keyboard on phones. Removed.
- **Placeholders and loading copy:** end with `…`.
- **Native `<select>`s:** explicit text colour (Windows dark mode).
- **Global CSS:** `scroll-padding-top` so focused elements clear the fixed header, and
  `touch-action: manipulation` on controls.

Deliberate deviation: headings and buttons use sentence case, not Title Case (house style).

## Lighthouse (production build, mobile)

| Page         | Accessibility | Best practices | SEO                        |
| ------------ | ------------- | -------------- | -------------------------- |
| `/`          | 100           | 100            | 100                        |
| `/clips`     | 100           | 100            | 100                        |
| `/clip/[id]` | 100           | 100            | 91                         |
| `/creators`  | 100           | 100            | 100                        |
| `/submit`    | 100           | 100            | 100                        |
| `/sign-in`   | 100           | 100            | 60 (intentional `noindex`) |

Fixed along the way:

- **Clip page details list:** nested `dt`/`dd` incorrectly.
- **Play button name:** its accessible name didn't contain its visible text.
- **Heading order:** `/clips` and section pages skipped from h1 to h3.
- **Layout shift:** the clip page's loading state let the footer jump (CLS 0.136 → 0.00).

**Note on clip-page SEO:** Lighthouse reports a missing meta description. For dynamic pages Next
streams metadata into the body for browsers and JS-capable crawlers (including Googlebot), and puts
it in `<head>` for crawlers that don't run JavaScript. Checked with `curl`: Twitterbot gets the
description and Open Graph tags in `<head>`.

## Performance (production build, Slow 4G, 4× CPU slowdown)

| Page         | LCP   | CLS  |
| ------------ | ----- | ---- |
| `/` before   | 4.4 s | 0.02 |
| `/` after    | 2.2 s | 0.02 |
| `/clip/[id]` | 2.3 s | 0.00 |

On phones the home hero requested the largest image variant (`sizes` said `260vw`, so a 2.6× screen
asked for the full 2258 px original). It now asks for about 1× density (`110vw`) and uses `preload`.
`priority` is deprecated in Next 16.

## End-to-end tests

`apps/web/e2e/submit-approve.spec.ts`, run with `pnpm --filter @plunderclips/web test:e2e` and in CI
(job "End-to-end (Playwright)"):

1. **Submit:** an anonymous visitor submits a clip (Turnstile test key; a made-up YouTube id, so
   the form asks for a title).
2. **Not public yet:** the clip doesn't appear on `/clips`.
3. **Publish:** a mod publishes it from the review queue with the Kraken tag and a Featured pick.
4. **Visible:** the clip shows on `/clips`, `/clips?tag=kraken`, `/clips/featured` and its own page,
   and the audit log records the action.
5. **Admin access:** a regular member gets the 404 page at `/admin/queue`.
