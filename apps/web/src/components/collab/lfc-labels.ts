import type { LfcPlatform, LfcRegion, LfcShip, LfcStyle } from "@plunderclips/social";

export const REGION: Record<LfcRegion, string> = {
  eu: "Europe",
  na: "North America",
  sa: "South America",
  oce: "Oceania",
  asia: "Asia",
  any: "Any region",
};
export const PLATFORM: Record<LfcPlatform, string> = {
  pc: "PC",
  xbox: "Xbox",
  playstation: "PlayStation",
  any: "Any platform",
};
export const SHIP: Record<LfcShip, string> = {
  sloop: "Sloop",
  brigantine: "Brigantine",
  galleon: "Galleon",
  any: "Any ship",
};
export const STYLE: Record<LfcStyle, string> = {
  pvp: "PvP",
  adventure: "Adventure",
  hourglass: "Hourglass",
  reapers: "Reaper's Bones",
  fishing: "Fishing",
  "tall-tales": "Tall Tales",
  fotd: "Fort of the Damned",
  chill: "Chill sailing",
  streaming: "On stream",
};
