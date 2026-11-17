# BusinessCurrent database-free preview

The `feature/company-intelligence-studio-v2` branch now provides useful pages without connecting to Neon. This is a **degraded mode**, not a full replication of the database-backed product.

## Accessible without any PostgreSQL connection

- `/`: company-first homepage, archived monitor entries, archived source records and optional live USAspending feed
- `/public-records`: search a small committed Montgomery County historical snapshot
- `/public-records/company/<id>`: original registry records and exact-identifier award matches
- `/companies`: archived directory when no `DATABASE_URL` exists
- `/contracts`: official, read-only USAspending search, with an offline records fallback when the public API fails
- `/locations`, `/search`, radar pages: helpful and accurate offline/limited-data state rather than fabricating scores
- `/company/[slug]`, `/contract/[id]` and company contract archives: clear source/availability messaging rather than throwing a missing-connection runtime error
- `/api/status/public`: safe configuration/record readiness plus archived source count and timestamp

### Coverage and limits

The bundled snapshot currently contains **9 registry companies and 25 recent award actions**, from checked-in `data/companies.json` and `data/latest.json`, last updated **November 2, 2026**. It is explicitly *not* comprehensive Montgomery County coverage, and not national coverage. Different fields have different official provenance, and an exact UEI or company-name match is required to associate an award with one of the nine registry records. Lack of matching awards in the sample does not imply the company has none.

No contact names, phone numbers, email addresses, secrets, or connection URLs from the source JSON are included in the archived bundle. No award is treated as proof of a physical move or expansion. The radar pages intentionally provide **no probabilities** in offline mode. The archive pages declare `noindex` rather than being mistaken for up-to-date canonical company dossiers.

The direct USAspending public API is separate from Neon. It has a 15-minute response cache, conservative limits and server-side timeout. The archive is fully static and will still render when both Neon and USAspending are unavailable.

### Refresh the archived snapshot without using Neon

From repository root, after updating the pre-existing static collector outputs:

```bash
python platform/scripts/export_offline_snapshot.py --check
python platform/scripts/export_offline_snapshot.py
```

The exporter uses only checked-in local JSON data; it never makes a network request, opens a PostgreSQL connection, triggers migrations, or inserts records. Review the JSON diff to ensure no sensitive data was included, then commit and deploy the snapshot normally. This export is **not automatically scheduled**, so resuming Neon or a data feed will not silently update it.

### Restoring real company intelligence

When Neon resumes and the team makes a Preview database branch available, configure the pooled server-only `DATABASE_URL` in Vercel Preview, apply reviewed schema migrations independently, and redeploy. Only then can the full historical profiles and evidence-based growth/movement/retention views work. Never connect unreviewed Preview code to a writable production database. The four automatic Neon-backed GitHub ingestion schedules were separately paused on `main` when Neon hit its free quota; they remain paused until explicit cost review.

**Release status:** this feature is on PR #6, not the production `main` site. GitHub CI/Vercel build status does not by itself prove protected preview URLs are accessible to end users.
