export const clipSections = [
  {
    href: "/clips/weekly",
    label: "This week",
    blurb: "The week's top clips, picked every Monday.",
  },
  {
    href: "/clips/best-of",
    label: "Best of",
    blurb: "All-time favourites the crew keeps rewatching.",
  },
  {
    href: "/clips/featured",
    label: "Featured",
    blurb: "Hand-picked by the mods, with the streamer up front.",
  },
  { href: "/clips", label: "All clips", blurb: "Everything approved, newest first." },
] as const;

export const mainLinks = [
  { href: "/creators", label: "Creators" },
  { href: "/crews", label: "Crews" },
] as const;
