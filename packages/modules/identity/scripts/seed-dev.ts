/**
 * Creates the dev login test users (one per role). Safe to run again: existing users are skipped.
 *   pnpm --filter @plunderclips/identity seed:dev
 * Needs DEV_LOGIN=true in apps/web/.env.local.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@plunderclips/db";
import { getAuth } from "../src/auth";
import { DEV_PASSWORD, DEV_USERS, devLoginEnabled } from "../src/dev-login";

async function main() {
  if (!devLoginEnabled()) {
    console.error("Dev login is off. Set DEV_LOGIN=true (and not NODE_ENV=production) first.");
    process.exit(1);
  }
  const auth = getAuth();
  for (const u of DEV_USERS) {
    const [existing] = await db()
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, u.email));
    if (existing) {
      console.log(`skip    ${u.role.padEnd(8)} ${u.email}`);
      continue;
    }
    await auth.api.createUser({
      body: { email: u.email, password: DEV_PASSWORD, name: u.name, role: u.role },
    });
    await db().update(schema.user).set({ emailVerified: true }).where(eq(schema.user.email, u.email));
    console.log(`created ${u.role.padEnd(8)} ${u.email}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
