# Myka Quad — Mini ERP

Live: on Cloudflare — a Worker named **myka-quad** (address in the Cloudflare dashboard, `*.workers.dev`).

Web version of the Myka Quad master workbook: invoices, receipts, purchases, expenses,
customers, products, suppliers, double-entry accounting (general journal, trial balance, P&L,
balance sheet, VAT report), trend analysis, forecasting, Salesforce-style data-hygiene KPIs and
an admin portal for users and access.

```
browser ──► Cloudflare Worker "myka-quad"  (worker/index.js)
             ├─ static files  _site/  (source/ → single-file index.html + config.js)
             └─ /api          server/core.js (business logic, 2-step login)
                                 │  one read batch + one write batch per request (optimistic concurrency)
                                 ▼
                             Cloudflare D1 "myka-quad-db" (London) — db/migrations/0001_init.sql
             emailDocument ──► "Myka Quad Mailer" Apps Script (mykaquadent@gmail.com) ──► customer
```

* Push to `main` → Workers Builds runs `npm run build` (API tests in memory AND on a local D1,
  a concurrency test, mailer tests, type-check, site build) then `npx wrangler deploy`. A failing test blocks the deploy.
* `server/core.js` — the API (ported 1:1 from the old Apps Script `backend/Code.gs`, kept for reference).
  `server/runtime.js` — per-request unit of work + Apps Script service shims. `server/store-d1.js` — D1 store.
* Worker settings: var `MAILER_URL` (in wrangler.jsonc), secret `MAILER_SECRET` (dashboard → Settings →
  Variables and Secrets), optional `ADMIN_TEMP` (first-admin password on an empty database).
* Local: `npm install && npm test`; `npm run build:site && npx wrangler dev` runs the whole app locally.
* Retired: Vercel (`api/index.js` now only says "moved"), Supabase (`server/store-pg.js`, `db/schema.sql`).

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
