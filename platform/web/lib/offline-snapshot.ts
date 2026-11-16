import snapshot from "@/data/public-snapshot.json";

/** Bundled source-backed historical sample. No database or network access at request time. */
export type ArchivedCompany = (typeof snapshot.companies)[number];
export type ArchivedAward = (typeof snapshot.awards)[number];
export const archivedSources = snapshot;

const includes = (v: string, q: string) => v.toLocaleLowerCase("en-US").includes(q);
export function filterArchivedCompanies(raw = "") {
  const q = raw.trim().toLocaleLowerCase("en-US").slice(0,100);
  return snapshot.companies.filter(c => !q || [c.name,c.legalName,c.sector,c.hqCity,c.hqState,c.uei].some(v=>includes(v,q)));
}
export function filterArchivedAwards(raw = "") {
  const q = raw.trim().toLocaleLowerCase("en-US").slice(0,100);
  return snapshot.awards.filter(a => !q || [a.company,a.uei,a.agency,a.awardId,a.description].some(v=>includes(v,q)));
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
