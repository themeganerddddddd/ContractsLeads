import snapshot from "@/data/public-snapshot.json";

/** Bundled source-backed historical sample. No database or network access at request time. */
export type ArchivedCompany = (typeof snapshot.companies)[number];
export type ArchivedAward = (typeof snapshot.awards)[number];
export const archivedSources = snapshot;

const includes = (v: string, q: string) => v.toLocaleLowerCase("en-US").includes(q);
export function filterArchivedCompanies(raw = "", state = "", county = "", country = "US") {
  const q = raw.trim().toLocaleLowerCase("en-US").slice(0,100);
  return snapshot.companies.filter(c =>
    (country === "US" || country === "ALL") &&
    (!state || c.hqState.toUpperCase() === state.toUpperCase()) &&
    (!county || includes(c.hqCounty,county.toLocaleLowerCase("en-US"))) &&
    (!q || [c.name,c.legalName,c.sector,c.hqCity,c.hqState,c.hqCounty,c.uei].some(v=>includes(v,q)))
  );
}
export function filterArchivedAwards(raw = "", state = "", county = "", country = "US") {
  const q = raw.trim().toLocaleLowerCase("en-US").slice(0,100);
  return snapshot.awards.filter(a =>
    (country === "US" || country === "ALL") &&
    (!state || a.recipientState.toUpperCase() === state.toUpperCase()) &&
    (!county || includes(a.recipientCounty,county.toLocaleLowerCase("en-US"))) &&
    (!q || [a.company,a.uei,a.agency,a.awardId,a.description].some(v=>includes(v,q)))
  );
}
export function findArchivedCompany(id: string): ArchivedCompany | null {
  return snapshot.companies.find(c => c.id === id) || null;
}
/** Only exact UEI / legal name matches, never inferred ownership or contract relationships. */
export function awardsForArchivedCompany(c: ArchivedCompany): ArchivedAward[] {
  const names=[c.name,c.legalName].map(s=>s.trim().toLocaleLowerCase("en-US"));
  return snapshot.awards.filter(a => Boolean(
    (c.uei && a.uei && c.uei.toUpperCase()===a.uei.toUpperCase())
    || names.includes(a.company.toLocaleLowerCase("en-US"))
  ));
}

/** Only displayed as optional suggestions, never a restriction on county search. */
export function archivedCountySuggestions(state = ""): string[] {
  if (!state) return [];
  return Array.from(new Set(snapshot.companies.filter(c=>c.hqState===state).map(c=>c.hqCounty).filter(Boolean)));
}
