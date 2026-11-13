import { expect, test, type Browser } from "@playwright/test";
import postgres from "postgres";

/**
 * The core loop: an anonymous visitor submits a clip, a mod publishes it from the review queue,
 * and it shows up on the public pages.
 *
 * The clip uses a random YouTube id that doesn't exist, so YouTube returns no metadata and the
 * form asks for a title: the run doesn't depend on any real video, and the title is unique.
 */
const run = Math.random().toString(36).slice(2, 8);
const videoId = `e2e${run}xxxxxxx`.slice(0, 11);
const title = `E2E kraken run ${run}`;

const sql = postgres(
  process.env.DATABASE_URL ?? "postgres://plunder:plunder@localhost:5432/plunderclips",
  {
    max: 1,
    onnotice: () => {},
  },
);

test.afterAll(async () => {
  await sql`delete from audit_log where target_id in (select id from clip where title = ${title})`;
  await sql`delete from clip where title = ${title}`;
  await sql.end();
});

async function signedInAs(browser: Browser, role: "admin" | "mod" | "user") {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in?next=/dashboard");
  await page.locator(`button[value=${role}]`).click();
  // Match the pathname: a glob like "**/dashboard" also matches /sign-in?next=/dashboard.
  await page.waitForURL((url) => url.pathname === "/dashboard");
  return { context, page };
}

test("anonymous submit → mod approves → visible on the site", async ({ browser }) => {
  // 1. Anonymous visitor submits the clip.
  // A random client IP per run (the test server has no proxy, so it trusts this header): a fresh
  // anonymous rate-limit window, however often the suite runs.
  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
  const visitor = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
  const v = await visitor.newPage();
  await v.goto("/submit");
  await v.locator("#url").fill(`https://youtu.be/${videoId}`);
  // Turnstile's test key passes without interaction; wait for its token before submitting.
  await expect(v.locator('[name="cf-turnstile-response"]')).toHaveValue(/.+/);
  await v.getByRole("button", { name: "Submit clip" }).click();
  // No metadata for a made-up video: the form asks for a title.
  // Scoped to the form: Next's route announcer is also role="alert".
  await expect(v.locator("form [role=alert]")).toContainText("couldn't read a title");
  await v.locator("#title").fill(title);
  await expect(v.locator('[name="cf-turnstile-response"]')).toHaveValue(/.+/);
  await v.getByRole("button", { name: "Submit clip" }).click();
  await expect(v.getByText("Thanks, it's in the queue")).toBeVisible();

  // Not public yet.
  await v.goto("/clips");
  await expect(v.getByText(title)).toHaveCount(0);

  // 2. A mod publishes it from the review queue with a tag and a Featured pick.
  const { context: modContext, page: m } = await signedInAs(browser, "mod");
  await m.goto("/admin/queue");
  const card = m.locator("article", { hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText("anonymous");
  await card.locator("label", { hasText: "Kraken" }).click();
  await card.locator("label", { hasText: "Featured" }).click();
  await card.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(card.getByText("Published.")).toBeVisible();

  // 3. Visible on the public pages, for an anonymous visitor.
  await v.goto("/clips");
  await expect(v.getByText(title)).toBeVisible();
  await v.goto("/clips?tag=kraken");
  await expect(v.getByText(title)).toBeVisible();
  await v.goto("/clips/featured");
  await expect(v.getByText(title)).toBeVisible();
  await v.getByText(title).click();
  await expect(v.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(
    v.getByRole("list", { name: "Picked for" }).getByRole("link", { name: "Featured" }),
  ).toBeVisible();

  // The audit log recorded who published it.
  await m.goto("/admin/audit");
  await expect(m.locator("tbody tr").first()).toContainText("published a clip");

  await modContext.close();
  await visitor.close();
});

test("the admin area is a 404 for members", async ({ browser }) => {
  const { context, page } = await signedInAs(browser, "user");
  await page.goto("/admin/queue");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Nothing on this stretch of water",
  );
  await expect(page.locator("nav[aria-label=Admin]")).toHaveCount(0);
  await context.close();
});
