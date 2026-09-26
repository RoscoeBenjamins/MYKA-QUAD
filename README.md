# Myka Quad — Mini ERP

Live web version of the Myka Quad master workbook: invoices, receipts, purchases, expenses,
customers, products, suppliers, double-entry accounting (general journal, trial balance, P&L,
balance sheet, VAT report), trend analysis, forecasting, Salesforce-style data-hygiene KPIs and
an admin portal for users and access.

```
GitHub Pages (this repo)            Google Drive — "Myka Quad ERP" folder
index.html  ── HTTPS/JSON ──►  Apps Script web app (backend/Code.gs)
config.js (API URL)                         │
                                            ▼
                                "Myka Quad DB" Google Sheet (the database)
```

* `index.html` — the whole app, pre-built into one file.
* `config.js` — holds the Apps Script Web app URL. Edit this one line to reconnect.
* `backend/Code.gs` + `appsscript.json` — the API. Lives in Google Drive, not here.
* `source/` — React + TypeScript source. Rebuild with `pnpm i && npx parcel build index.html`.
* `backend/test/` — runs Code.gs in Node with fake Google services: `node backend/test/api.test.js`.

No business data is stored in this repo. It all lives in the Google Sheet, behind sign-in.

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

* **admin** — everything, including the Admin Portal
* **manager** — record + void in the areas granted
* **staff** — record in the areas granted, no voiding
* **viewer** — read-only in the areas granted

Areas: Dashboard, Sales, Purchases & expenses, Customers, Products, Suppliers, Accounting,
Trend analysis, Forecast, Data hygiene KPIs.
