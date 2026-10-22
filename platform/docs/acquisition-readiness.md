# Acquisition-readiness package

## Accurate external position

Federal Ledger is a live government-procurement intelligence beta that keeps
official identifiers, native currencies, lifecycle evidence, and source links
across USAspending, UK Find a Tender, and EU TED. Search and profiles are ready
for design-partner review. Historical coverage is intentionally incomplete,
predicted probabilities are disabled, and disclosed values must not be
described as economic impact or complete market size.

Safe one-sentence description:

> Federal Ledger helps teams search and audit public U.S., UK, and EU
> procurement activity from the official source records, with clear coverage
> and data-sufficiency labels.

Do not claim comprehensive multi-year coverage until the capacity blocker is
resolved and each source window passes reconciliation. Do not call recipient
addresses headquarters. Do not advertise prediction accuracy while model
status is `insufficient_history`.

## External review script

1. Start at the global market/source selector on `/search`.
2. Demonstrate a U.S. award with separate recipient and place-of-performance
   geography.
3. Demonstrate a UK procedure with OCID, native GBP, buyer, supplier, events,
   and the exact Find a Tender link.
4. Demonstrate a TED procedure with notice versions, lots, contracts, CPV,
   country/NUTS filters, native currency, and exact HTML/XML links.
5. Show `Insufficient history` in predictive panels and explain the gate.
6. Ask the reviewer to complete one real research task and record where source
   coverage, terminology, filters, or provenance were insufficient.

## Feedback capture

Record one row per review in the team's approved issue tracker or CRM with:

- reviewer role and organization segment;
- research task and source market;
- successful/failed outcome and time to answer;
- missing filter, field, source, or workflow;
- source-link trust rating (1–5);
- data-completeness concern;
- willingness to repeat the workflow weekly;
- acquisition/budget signal and decision timeline;
- consented follow-up date;
- verbatim quote only when the reviewer has authorized its retention.

Do not put private contact data, credentials, or unapproved quotes in the
repository.

## Suggested contact cadence

- Day 0: invite a small set of qualified design partners to a 20-minute task-
  based review; state that historical coverage is bounded.
- Day 2: send the source-backed answer or limitation discovered in the review.
- Day 7: ask whether the workflow saved time and which missing coverage blocks
  repeat use.
- Day 21: share only verified changes and ask for a second task-based review.

No outreach has been sent by the implementation work. Sending messages,
selecting recipients, enabling billing, or making acquisition claims requires
the owner's explicit approval.

## Exit criteria for broader acquisition outreach

- approved database/object-storage architecture and a passing capacity
  projection;
- at least one reconciled historical year for the marketed source;
- daily source jobs healthy for 14 consecutive days;
- public coverage/status language reviewed against production counts;
- five task-based reviews with structured feedback;
- privacy, terms, support contact, authentication, and billing decisions made;
- prediction claims remain absent until an out-of-time model passes every gate.
