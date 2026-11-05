import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set in .env.");

const sql = neon(databaseUrl);

await sql`
  CREATE TABLE IF NOT EXISTS app_users (
    clerk_user_id text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS monthly_budgets (
    clerk_user_id text NOT NULL REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,
    month_start date NOT NULL,
    amount numeric(14, 2) NOT NULL CHECK (amount > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (clerk_user_id, month_start)
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS budget_expenses (
    clerk_user_id text NOT NULL REFERENCES app_users (clerk_user_id) ON DELETE CASCADE,
    expense_id text NOT NULL,
    month_start date NOT NULL,
    title text NOT NULL,
    amount numeric(14, 2) NOT NULL CHECK (amount > 0),
    category text NOT NULL DEFAULT 'Other',
    spent_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (clerk_user_id, expense_id)
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS budget_expenses_user_month_spent_idx
  ON budget_expenses (clerk_user_id, month_start, spent_at DESC)
`;

console.log("Created or verified the monthly_budgets and budget_expenses tables.");
