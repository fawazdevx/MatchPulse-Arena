// Maps TxLINE country/team names to ISO 3166-1 alpha-2 codes for flag rendering.
// Flags are served as bundled SVGs from /public/flags/<iso>.svg so they render
// identically on mobile, PC, and tablet and work offline during the demo.
// Unmapped names fall back to colored initials in <TeamCrest />.

const NAME_TO_ISO: Record<string, string> = {
  argentina: "ar",
  france: "fr",
  brazil: "br",
  england: "gb-eng",
  spain: "es",
  portugal: "pt",
  germany: "de",
  netherlands: "nl",
  belgium: "be",
  croatia: "hr",
  italy: "it",
  uruguay: "uy",
  colombia: "co",
  mexico: "mx",
  "united states": "us",
  usa: "us",
  canada: "ca",
  japan: "jp",
  "south korea": "kr",
  "korea republic": "kr",
  australia: "au",
  morocco: "ma",
  senegal: "sn",
  ghana: "gh",
  nigeria: "ng",
  cameroon: "cm",
  ivorycoast: "ci",
  "ivory coast": "ci",
  "cote d'ivoire": "ci",
  egypt: "eg",
  algeria: "dz",
  tunisia: "tn",
  switzerland: "ch",
  denmark: "dk",
  poland: "pl",
  serbia: "rs",
  wales: "gb-wls",
  scotland: "gb-sct",
  sweden: "se",
  norway: "no",
  austria: "at",
  ukraine: "ua",
  turkey: "tr",
  "türkiye": "tr",
  ecuador: "ec",
  peru: "pe",
  chile: "cl",
  paraguay: "py",
  "saudi arabia": "sa",
  iran: "ir",
  qatar: "qa",
  "costa rica": "cr",
  panama: "pa",
  "new zealand": "nz",
  "czech republic": "cz",
  czechia: "cz",
  hungary: "hu",
  greece: "gr",
  russia: "ru"
};

/** Returns the ISO code for a team/country name, or null when unmapped. */
export function isoForCountry(name: string): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (NAME_TO_ISO[key]) return NAME_TO_ISO[key];
  // Tolerate suffixes like "Argentina U20" or "Brazil (H)".
  for (const [country, iso] of Object.entries(NAME_TO_ISO)) {
    if (key.startsWith(country)) return iso;
  }
  return null;
}

/** Public path to a bundled flag SVG, or null when unmapped. */
export function flagSrc(name: string): string | null {
  const iso = isoForCountry(name);
  return iso ? `/flags/${iso}.svg` : null;
}
