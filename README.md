# Myka Quad — Mini ERP

Live: **https://myka-quad.vercel.app** (the old GitHub Pages address keeps working and uses the same API)

Web version of the Myka Quad master workbook: invoices, receipts, purchases, expenses,
customers, products, suppliers, double-entry accounting (general journal, trial balance, P&L,
balance sheet, VAT report), trend analysis, forecasting, Salesforce-style data-hygiene KPIs and
an admin portal for users and access.

```
browser ──► Vercel (London)
             ├─ /            source/ → single-file index.html + config.js
             └─ /api         api/index.js → server/core.js (business logic, 2-step login)
                                 │  one transaction per request, writes serialised by an advisory lock
                                 ▼
                             Supabase Postgres (eu-west-2) — tables in db/schema.sql
                                 │  RLS on; only the myka_api role has access (no public REST access)
             emailDocument ──► "Myka Quad Mailer" Apps Script (mykaquadent@gmail.com) ──► customer
```

* Push to `main` → Vercel runs `npm test` (API tests + mailer tests), type-checks and builds, then deploys.
  A failing test blocks the deploy.
* `server/core.js` — the API (ported 1:1 from the old Apps Script `backend/Code.gs`, kept for reference).
  `server/runtime.js` — per-request unit of work + Apps Script service shims. `server/store-pg.js` — Postgres.
* `db/schema.sql` — database schema and access rules.
* Vercel environment variables (never in this repo): `DATABASE_URL` (Supabase pooler, role `myka_api`),
  `MAILER_URL`, `MAILER_SECRET`, optional `ADMIN_TEMP` (first-admin password on an empty database).
* Local: `npm install && npm test`; `TEST_DATABASE_URL=postgres://… npm test` runs the same tests on Postgres;
  `node backend/test/server.js` is a local API on :8787 with an in-memory database.

## Posting rules (same as the Excel macros)

| Document | Debit | Credit |
|---|---|---|
| Invoice | 1100 A/R (total) | 4000 Sales (subtotal), 2100 VAT |
| Paid at invoicing | Cash / MoMo / Bank | 1100 A/R |
| Receipt | 1000 Cash · 1010 MoMo · 1020 Bank | 1100 A/R |
| Purchase | 5100 Purchases | Cash/MoMo/Bank, or 2000 A/P on credit |
| Expense | 6000 Operating expenses | Cash/MoMo/Bank |
| Void | exact reversal of the original lines | |

## Roles

admin (everything + Admin Portal) · manager (record + void) · staff (record) · viewer (read-only),
each limited to the areas ticked for them.
