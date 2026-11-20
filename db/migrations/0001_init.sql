-- Myka Quad ERP schema for Cloudflare D1 (SQLite). One table per former Google Sheet tab.
-- Column names keep the original camelCase so the API logic (server/core.js) is unchanged.
-- Only the Worker (binding DB) can reach this database; there is no public access.

CREATE TABLE IF NOT EXISTS "Settings" (
  "_row" INTEGER PRIMARY KEY,
  "key" TEXT NOT NULL DEFAULT '',
  "value" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Settings_key_key" ON "Settings" ("key");

CREATE TABLE IF NOT EXISTS "Users" (
  "_row" INTEGER PRIMARY KEY,
  "id" TEXT NOT NULL DEFAULT '',
  "username" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT '',
  "modules" TEXT NOT NULL DEFAULT '',
  "passHash" TEXT NOT NULL DEFAULT '',
  "salt" TEXT NOT NULL DEFAULT '',
  "active" TEXT NOT NULL DEFAULT '',
  "mustChange" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "lastLogin" TEXT NOT NULL DEFAULT '',
  "totpSecret" TEXT NOT NULL DEFAULT '',
  "totpEnabled" TEXT NOT NULL DEFAULT '',
  "totpLastStep" REAL NOT NULL DEFAULT 0,
  "recoveryHashes" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Users_id_key" ON "Users" ("id");

CREATE TABLE IF NOT EXISTS "Sessions" (
  "_row" INTEGER PRIMARY KEY,
  "token" TEXT NOT NULL DEFAULT '',
  "userId" TEXT NOT NULL DEFAULT '',
  "expires" TEXT NOT NULL DEFAULT '',
  "mfa" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Sessions_token_key" ON "Sessions" ("token");

CREATE TABLE IF NOT EXISTS "Customers" (
  "_row" INTEGER PRIMARY KEY,
  "id" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL DEFAULT '',
  "contact" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "address" TEXT NOT NULL DEFAULT '',
  "type" TEXT NOT NULL DEFAULT '',
  "vatStatus" TEXT NOT NULL DEFAULT '',
  "tin" TEXT NOT NULL DEFAULT '',
  "openingBalance" REAL NOT NULL DEFAULT 0,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "isDemo" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Customers_id_key" ON "Customers" ("id");

CREATE TABLE IF NOT EXISTS "Suppliers" (
  "_row" INTEGER PRIMARY KEY,
  "id" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL DEFAULT '',
  "products" TEXT NOT NULL DEFAULT '',
  "contact" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "address" TEXT NOT NULL DEFAULT '',
  "terms" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "isDemo" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Suppliers_id_key" ON "Suppliers" ("id");

CREATE TABLE IF NOT EXISTS "Products" (
  "_row" INTEGER PRIMARY KEY,
  "code" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL DEFAULT '',
  "unit" TEXT NOT NULL DEFAULT '',
  "supplier" TEXT NOT NULL DEFAULT '',
  "cost" REAL NOT NULL DEFAULT 0,
  "price" REAL NOT NULL DEFAULT 0,
  "vat" TEXT NOT NULL DEFAULT '',
  "reorderLevel" REAL NOT NULL DEFAULT 0,
  "active" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Products_code_key" ON "Products" ("code");

CREATE TABLE IF NOT EXISTS "Invoices" (
  "_row" INTEGER PRIMARY KEY,
  "invoiceNo" TEXT NOT NULL DEFAULT '',
  "date" TEXT NOT NULL DEFAULT '',
  "customerId" TEXT NOT NULL DEFAULT '',
  "customerName" TEXT NOT NULL DEFAULT '',
  "vatApplied" TEXT NOT NULL DEFAULT '',
  "subtotal" REAL NOT NULL DEFAULT 0,
  "vat" REAL NOT NULL DEFAULT 0,
  "total" REAL NOT NULL DEFAULT 0,
  "paidAtInvoice" REAL NOT NULL DEFAULT 0,
  "payMethod" TEXT NOT NULL DEFAULT '',
  "dueDate" TEXT NOT NULL DEFAULT '',
  "nextStep" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdBy" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "isDemo" TEXT NOT NULL DEFAULT '',
  "emailedAt" TEXT NOT NULL DEFAULT '',
  "emailedTo" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Invoices_invoiceNo_key" ON "Invoices" ("invoiceNo");

CREATE TABLE IF NOT EXISTS "InvoiceLines" (
  "_row" INTEGER PRIMARY KEY,
  "invoiceNo" TEXT NOT NULL DEFAULT '',
  "date" TEXT NOT NULL DEFAULT '',
  "customerName" TEXT NOT NULL DEFAULT '',
  "productCode" TEXT NOT NULL DEFAULT '',
  "productName" TEXT NOT NULL DEFAULT '',
  "unit" TEXT NOT NULL DEFAULT '',
  "qty" REAL NOT NULL DEFAULT 0,
  "unitPrice" REAL NOT NULL DEFAULT 0,
  "lineTotal" REAL NOT NULL DEFAULT 0,
  "unitCost" REAL NOT NULL DEFAULT 0,
  "isDemo" TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS "Receipts" (
  "_row" INTEGER PRIMARY KEY,
  "receiptNo" TEXT NOT NULL DEFAULT '',
  "date" TEXT NOT NULL DEFAULT '',
  "customerName" TEXT NOT NULL DEFAULT '',
  "invoiceNo" TEXT NOT NULL DEFAULT '',
  "amount" REAL NOT NULL DEFAULT 0,
  "method" TEXT NOT NULL DEFAULT '',
  "receivedBy" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT '',
  "createdBy" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "isDemo" TEXT NOT NULL DEFAULT '',
  "emailedAt" TEXT NOT NULL DEFAULT '',
  "emailedTo" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Receipts_receiptNo_key" ON "Receipts" ("receiptNo");

CREATE TABLE IF NOT EXISTS "Purchases" (
  "_row" INTEGER PRIMARY KEY,
  "purchaseNo" TEXT NOT NULL DEFAULT '',
  "date" TEXT NOT NULL DEFAULT '',
  "supplier" TEXT NOT NULL DEFAULT '',
  "productCode" TEXT NOT NULL DEFAULT '',
  "productName" TEXT NOT NULL DEFAULT '',
  "qty" REAL NOT NULL DEFAULT 0,
  "unitCost" REAL NOT NULL DEFAULT 0,
  "total" REAL NOT NULL DEFAULT 0,
  "method" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdBy" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "isDemo" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Purchases_purchaseNo_key" ON "Purchases" ("purchaseNo");

CREATE TABLE IF NOT EXISTS "Expenses" (
  "_row" INTEGER PRIMARY KEY,
  "expenseNo" TEXT NOT NULL DEFAULT '',
  "date" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "amount" REAL NOT NULL DEFAULT 0,
  "method" TEXT NOT NULL DEFAULT '',
  "createdBy" TEXT NOT NULL DEFAULT '',
  "createdAt" TEXT NOT NULL DEFAULT '',
  "isDemo" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Expenses_expenseNo_key" ON "Expenses" ("expenseNo");

CREATE TABLE IF NOT EXISTS "Accounts" (
  "_row" INTEGER PRIMARY KEY,
  "code" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL DEFAULT '',
  "type" TEXT NOT NULL DEFAULT '',
  "normal" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS "Accounts_code_key" ON "Accounts" ("code");

CREATE TABLE IF NOT EXISTS "Journal" (
  "_row" INTEGER PRIMARY KEY,
  "entryNo" REAL NOT NULL DEFAULT 0,
  "date" TEXT NOT NULL DEFAULT '',
  "ref" TEXT NOT NULL DEFAULT '',
  "acct" TEXT NOT NULL DEFAULT '',
  "acctName" TEXT NOT NULL DEFAULT '',
  "debit" REAL NOT NULL DEFAULT 0,
  "credit" REAL NOT NULL DEFAULT 0,
  "description" TEXT NOT NULL DEFAULT '',
  "source" TEXT NOT NULL DEFAULT '',
  "createdBy" TEXT NOT NULL DEFAULT '',
  "isDemo" TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS "Audit" (
  "_row" INTEGER PRIMARY KEY,
  "ts" TEXT NOT NULL DEFAULT '',
  "user" TEXT NOT NULL DEFAULT '',
  "action" TEXT NOT NULL DEFAULT '',
  "detail" TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "InvoiceLines_invoiceNo_idx" ON "InvoiceLines" ("invoiceNo");
CREATE INDEX IF NOT EXISTS "Journal_ref_idx" ON "Journal" ("ref");

-- CacheService replacement: failed-login counters and 2-step challenges (expires = ms since epoch)
CREATE TABLE IF NOT EXISTS "Cache" (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL);

-- Optimistic concurrency: every committing write bumps Meta.v; a write whose snapshot is stale
-- inserts NULL into Guard (NOT NULL), which aborts its whole batch so the request is retried.
CREATE TABLE IF NOT EXISTS "Meta" (id INTEGER PRIMARY KEY, v INTEGER NOT NULL);
INSERT OR IGNORE INTO "Meta" (id, v) VALUES (1, 0);
CREATE TABLE IF NOT EXISTS "Guard" (ok INTEGER NOT NULL);
