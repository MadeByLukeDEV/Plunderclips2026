"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { devLoginEnabled, isDevRole, signInAsDevUser } from "@plunderclips/identity";
import { safeNext } from "@/lib/safe-next";

/** Local testing only: signs in as the seeded test user for the chosen role. */
export async function devSignIn(formData: FormData) {
  if (!devLoginEnabled()) throw new Error("Dev login is disabled");
  const role = formData.get("role");
  if (!isDevRole(role)) throw new Error("Unknown role");
  await signInAsDevUser(role, await headers());
  redirect(safeNext(formData.get("next")?.toString()));
}
