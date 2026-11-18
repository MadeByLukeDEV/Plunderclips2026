import { flushViews, rotateWeekly, snapshotClipStats } from "@plunderclips/clips";
import { pollLive } from "@plunderclips/creators";
import { logger, redis } from "@plunderclips/shared";

/**
 * Background jobs on timers, in their own container (compose service `worker`). Each job runs
 * alone: a run that's still going skips the next tick instead of stacking up, and a failure is
 * logged and tried again next time. One worker is enough; a second copy would just do the same
 * work twice.
 */
type Job = { name: string; everyMs: number; run: () => Promise<unknown> };

const jobs: Job[] = [
  // Twitch and Kick live status for creator pages and the home page.
  { name: "live-status", everyMs: 60_000, run: () => pollLive() },
  // Views counted in Redis but not yet written to Postgres (a page view normally flushes them).
  { name: "flush-views", everyMs: 5 * 60_000, run: () => flushViews({ force: true }) },
  // This week's Weekly section from votes and views (mod picks stay; past weeks are final).
  { name: "weekly-rotation", everyMs: 60 * 60_000, run: () => rotateWeekly() },
  // Today's view and vote totals per clip, for creator analytics trends.
  { name: "clip-stats", everyMs: 60 * 60_000, run: () => snapshotClipStats() },
];

const timers: NodeJS.Timeout[] = [];
const running = new Set<string>();
let stopping = false;

async function tick(job: Job) {
  if (stopping || running.has(job.name)) return;
  running.add(job.name);
  const started = Date.now();
  try {
    const result = await job.run();
    logger.info("job done", { job: job.name, ms: Date.now() - started, result });
  } catch (err) {
    logger.error("job failed", { job: job.name, ms: Date.now() - started, error: String(err) });
  } finally {
    running.delete(job.name);
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info("worker stopping", { signal });
  for (const t of timers) clearInterval(t);
  // Let jobs in flight finish (up to 20 s), then close Redis so the process exits.
  const deadline = Date.now() + 20_000;
  while (running.size && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  await redis()
    .quit()
    .catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

logger.info("worker started", { jobs: jobs.map((j) => `${j.name} every ${j.everyMs / 1000}s`) });
for (const job of jobs) {
  void tick(job);
  timers.push(setInterval(() => void tick(job), job.everyMs));
}
