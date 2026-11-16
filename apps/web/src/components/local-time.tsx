"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** False while rendering on the server and hydrating, true once in the browser. */
export const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

export type TimeFormat = "date" | "time" | "datetime" | "day" | "auto";

const OPTIONS: Record<Exclude<TimeFormat, "auto">, Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "short", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit" },
  datetime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  day: { weekday: "short", day: "numeric", month: "short" },
};

/**
 * Formats a moment in the viewer's own timezone ("auto": the time if it's today, else the date).
 * The server can't know the viewer's zone, so the server render (and anyone without JS) shows UTC,
 * labelled "UTC" wherever a clock time is shown; the browser swaps in local time after hydration.
 */
export function formatTime(value: Date | string, format: TimeFormat, local: boolean): string {
  const d = new Date(value);
  const zone = local ? undefined : "UTC";
  const fmt: Exclude<TimeFormat, "auto"> =
    format === "auto"
      ? new Date().toLocaleDateString(undefined, { timeZone: zone }) ===
        d.toLocaleDateString(undefined, { timeZone: zone })
        ? "time"
        : "date"
      : format;
  const text = new Intl.DateTimeFormat(local ? undefined : "en-GB", {
    ...OPTIONS[fmt],
    timeZone: zone,
  }).format(d);
  return !local && (fmt === "time" || fmt === "datetime") ? `${text} UTC` : text;
}

export function LocalTime({
  value,
  format = "datetime",
  className,
}: {
  value: Date | string;
  format?: TimeFormat;
  className?: string;
}) {
  const local = useHydrated();
  const iso = new Date(value).toISOString();
  return (
    <time
      dateTime={iso}
      className={className}
      title={
        local
          ? new Date(value).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })
          : iso
      }
      suppressHydrationWarning
    >
      {formatTime(value, format, local)}
    </time>
  );
}
