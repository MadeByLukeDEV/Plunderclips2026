import { connection } from "next/server";
import { ping as pingDb } from "@plunderclips/db";
import { redis } from "@plunderclips/shared";

const TIMEOUT_MS = 2000;

async function check(fn: () => Promise<unknown>) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    return "ok" as const;
  } catch {
    return "down" as const;
  }
}

/** Liveness + dependency check used by Docker/Dokploy healthchecks. */
export async function GET() {
  await connection();
  const [database, cache] = await Promise.all([
    check(pingDb),
    check(async () => {
      const client = redis();
      if (client.status === "reconnecting" || client.status === "end")
        throw new Error(client.status);
      return client.ping();
    }),
  ]);
  const healthy = database === "ok" && cache === "ok";
  return Response.json(
    { status: healthy ? "ok" : "degraded", database, cache },
    { status: healthy ? 200 : 503 },
  );
}
