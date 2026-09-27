-- Myka Quad ERP schema (Supabase Postgres). One table per former Google Sheet tab.
-- Column names keep the original camelCase so the API logic is unchanged.
-- Only the API (Vercel function, connecting as the myka_api role) can touch these tables: RLS is on and the
-- only policies are for myka_api; the public anon/authenticated roles have no grants (Supabase REST sees nothing).

create table if not exists "Settings" (
  "_row" bigint generated always as identity primary key,
  "key" text not null default '',
  "value" text not null default ''
);
create unique index if not exists "Settings_key_key" on "Settings" ("key");
alter table "Settings" enable row level security;

create table if not exists "Users" (
  "_row" bigint generated always as identity primary key,
  "id" text not null default '',
  "username" text not null default '',
  "name" text not null default '',
  "email" text not null default '',
  "role" text not null default '',
  "modules" text not null default '',
  "passHash" text not null default '',
  "salt" text not null default '',
  "active" text not null default '',
  "mustChange" text not null default '',
  "createdAt" text not null default '',
  "lastLogin" text not null default '',
  "totpSecret" text not null default '',
  "totpEnabled" text not null default '',
  "totpLastStep" numeric(18,2) not null default 0,
  "recoveryHashes" text not null default ''
);
create unique index if not exists "Users_id_key" on "Users" ("id");
alter table "Users" enable row level security;

create table if not exists "Sessions" (
  "_row" bigint generated always as identity primary key,
  "token" text not null default '',
  "userId" text not null default '',
  "expires" text not null default '',
  "mfa" text not null default ''
);
create unique index if not exists "Sessions_token_key" on "Sessions" ("token");
alter table "Sessions" enable row level security;

create table if not exists "Customers" (
  "_row" bigint generated always as identity primary key,
  "id" text not null default '',
  "name" text not null default '',
  "contact" text not null default '',
  "phone" text not null default '',
  "email" text not null default '',
  "address" text not null default '',
  "type" text not null default '',
  "vatStatus" text not null default '',
  "tin" text not null default '',
  "openingBalance" numeric(18,2) not null default 0,
  "notes" text not null default '',
  "createdAt" text not null default '',
  "isDemo" text not null default ''
);
create unique index if not exists "Customers_id_key" on "Customers" ("id");
alter table "Customers" enable row level security;

create table if not exists "Suppliers" (
  "_row" bigint generated always as identity primary key,
  "id" text not null default '',
  "name" text not null default '',
  "products" text not null default '',
  "contact" text not null default '',
  "phone" text not null default '',
  "email" text not null default '',
  "address" text not null default '',
  "terms" text not null default '',
  "notes" text not null default '',
  "isDemo" text not null default ''
);
create unique index if not exists "Suppliers_id_key" on "Suppliers" ("id");
alter table "Suppliers" enable row level security;

create table if not exists "Products" (
  "_row" bigint generated always as identity primary key,
  "code" text not null default '',
  "category" text not null default '',
  "name" text not null default '',
  "unit" text not null default '',
  "supplier" text not null default '',
  "cost" numeric(18,2) not null default 0,
  "price" numeric(18,2) not null default 0,
  "vat" text not null default '',
  "reorderLevel" numeric(18,2) not null default 0,
  "active" text not null default '',
  "notes" text not null default ''
);
create unique index if not exists "Products_code_key" on "Products" ("code");
alter table "Products" enable row level security;

create table if not exists "Invoices" (
  "_row" bigint generated always as identity primary key,
  "invoiceNo" text not null default '',
  "date" text not null default '',
  "customerId" text not null default '',
  "customerName" text not null default '',
  "vatApplied" text not null default '',
  "subtotal" numeric(18,2) not null default 0,
  "vat" numeric(18,2) not null default 0,
  "total" numeric(18,2) not null default 0,
  "paidAtInvoice" numeric(18,2) not null default 0,
  "payMethod" text not null default '',
  "dueDate" text not null default '',
  "nextStep" text not null default '',
  "status" text not null default '',
  "notes" text not null default '',
  "createdBy" text not null default '',
  "createdAt" text not null default '',
  "isDemo" text not null default '',
  "emailedAt" text not null default '',
  "emailedTo" text not null default ''
);
create unique index if not exists "Invoices_invoiceNo_key" on "Invoices" ("invoiceNo");
alter table "Invoices" enable row level security;

create table if not exists "InvoiceLines" (
  "_row" bigint generated always as identity primary key,
  "invoiceNo" text not null default '',
  "date" text not null default '',
  "customerName" text not null default '',
  "productCode" text not null default '',
  "productName" text not null default '',
  "unit" text not null default '',
  "qty" numeric(18,2) not null default 0,
  "unitPrice" numeric(18,2) not null default 0,
  "lineTotal" numeric(18,2) not null default 0,
  "unitCost" numeric(18,2) not null default 0,
  "isDemo" text not null default ''
);
alter table "InvoiceLines" enable row level security;

create table if not exists "Receipts" (
  "_row" bigint generated always as identity primary key,
  "receiptNo" text not null default '',
  "date" text not null default '',
  "customerName" text not null default '',
  "invoiceNo" text not null default '',
  "amount" numeric(18,2) not null default 0,
  "method" text not null default '',
  "receivedBy" text not null default '',
  "notes" text not null default '',
  "status" text not null default '',
  "createdBy" text not null default '',
  "createdAt" text not null default '',
  "isDemo" text not null default '',
  "emailedAt" text not null default '',
  "emailedTo" text not null default ''
);
create unique index if not exists "Receipts_receiptNo_key" on "Receipts" ("receiptNo");
alter table "Receipts" enable row level security;

create table if not exists "Purchases" (
  "_row" bigint generated always as identity primary key,
  "purchaseNo" text not null default '',
  "date" text not null default '',
  "supplier" text not null default '',
  "productCode" text not null default '',
  "productName" text not null default '',
  "qty" numeric(18,2) not null default 0,
  "unitCost" numeric(18,2) not null default 0,
  "total" numeric(18,2) not null default 0,
  "method" text not null default '',
  "notes" text not null default '',
  "createdBy" text not null default '',
  "createdAt" text not null default '',
  "isDemo" text not null default ''
);
create unique index if not exists "Purchases_purchaseNo_key" on "Purchases" ("purchaseNo");
alter table "Purchases" enable row level security;

create table if not exists "Expenses" (
  "_row" bigint generated always as identity primary key,
  "expenseNo" text not null default '',
  "date" text not null default '',
  "category" text not null default '',
  "description" text not null default '',
  "amount" numeric(18,2) not null default 0,
  "method" text not null default '',
  "createdBy" text not null default '',
  "createdAt" text not null default '',
  "isDemo" text not null default ''
);
create unique index if not exists "Expenses_expenseNo_key" on "Expenses" ("expenseNo");
alter table "Expenses" enable row level security;

create table if not exists "Accounts" (
  "_row" bigint generated always as identity primary key,
  "code" text not null default '',
  "name" text not null default '',
  "type" text not null default '',
  "normal" text not null default '',
  "notes" text not null default ''
);
create unique index if not exists "Accounts_code_key" on "Accounts" ("code");
alter table "Accounts" enable row level security;

create table if not exists "Journal" (
  "_row" bigint generated always as identity primary key,
  "entryNo" numeric(18,2) not null default 0,
  "date" text not null default '',
  "ref" text not null default '',
  "acct" text not null default '',
  "acctName" text not null default '',
  "debit" numeric(18,2) not null default 0,
  "credit" numeric(18,2) not null default 0,
  "description" text not null default '',
  "source" text not null default '',
  "createdBy" text not null default '',
  "isDemo" text not null default ''
);
alter table "Journal" enable row level security;

create table if not exists "Audit" (
  "_row" bigint generated always as identity primary key,
  "ts" text not null default '',
  "user" text not null default '',
  "action" text not null default '',
  "detail" text not null default ''
);
alter table "Audit" enable row level security;

create index if not exists "InvoiceLines_invoiceNo_idx" on "InvoiceLines" ("invoiceNo");
create index if not exists "Journal_ref_idx" on "Journal" ("ref");

create table if not exists "Cache" (key text primary key, value text not null, expires bigint not null);
alter table "Cache" enable row level security;

-- ---- access: only the API role may read/write -------------------------------------
-- The role itself is created once, outside migrations, so its password never lands in migration history:
--   create role myka_api login password '<secret>' noinherit;
revoke all on "Settings", "Users", "Sessions", "Customers", "Suppliers", "Products", "Invoices", "InvoiceLines", "Receipts", "Purchases", "Expenses", "Accounts", "Journal", "Audit", "Cache" from anon, authenticated;
grant usage on schema public to myka_api;
grant select, insert, update, delete on "Settings", "Users", "Sessions", "Customers", "Suppliers", "Products", "Invoices", "InvoiceLines", "Receipts", "Purchases", "Expenses", "Accounts", "Journal", "Audit", "Cache" to myka_api;
grant usage, select on all sequences in schema public to myka_api;
create policy "api_all" on "Settings" for all to myka_api using (true) with check (true);
create policy "api_all" on "Users" for all to myka_api using (true) with check (true);
create policy "api_all" on "Sessions" for all to myka_api using (true) with check (true);
create policy "api_all" on "Customers" for all to myka_api using (true) with check (true);
create policy "api_all" on "Suppliers" for all to myka_api using (true) with check (true);
create policy "api_all" on "Products" for all to myka_api using (true) with check (true);
create policy "api_all" on "Invoices" for all to myka_api using (true) with check (true);
create policy "api_all" on "InvoiceLines" for all to myka_api using (true) with check (true);
create policy "api_all" on "Receipts" for all to myka_api using (true) with check (true);
create policy "api_all" on "Purchases" for all to myka_api using (true) with check (true);
create policy "api_all" on "Expenses" for all to myka_api using (true) with check (true);
create policy "api_all" on "Accounts" for all to myka_api using (true) with check (true);
create policy "api_all" on "Journal" for all to myka_api using (true) with check (true);
create policy "api_all" on "Audit" for all to myka_api using (true) with check (true);
create policy "api_all" on "Cache" for all to myka_api using (true) with check (true);
