# Myka Quad — Mini ERP

Live: **https://roscoebenjamins.github.io/MYKA-QUAD/**

Web version of the Myka Quad master workbook: invoices, receipts, purchases, expenses,
customers, products, suppliers, double-entry accounting (general journal, trial balance, P&L,
balance sheet, VAT report), trend analysis, forecasting, Salesforce-style data-hygiene KPIs and
an admin portal for users and access.

```
push to main
   │
   ▼
GitHub Actions ── test ──► API tests (Code.gs in a fake Apps Script runtime)
   │                 └──► auto-deploy tests
   ▼ (only if tests pass)
build ──► source/ → single-file index.html + config.js
      └──► backend/Code.gs + appsscript.json + release.json → site /api/
   ▼
GitHub Pages ── website live in ~2 min
   ▲
   │ every 5 min: "new tested release?"
Apps Script "Myka Quad API" (Google Drive) ── replaces its own code, cuts a new
version and repoints the EXISTING web-app deployment (same URL) ── Google Sheet DB
```

* `source/` — React + TypeScript app. `config.js` — the API URL.
* `backend/Code.gs` + `appsscript.json` — the API. `backend/test/` — its tests.
* Private values (sheet ID, first-admin password) live in the script's Script Properties,
  never in this repo. No business data is stored here — it all lives in the Google Sheet.

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
