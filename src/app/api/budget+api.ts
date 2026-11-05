import { neon } from "@neondatabase/serverless";
import { getAuthenticatedClerkUserId } from "../../lib/server-auth";

function isMonthStart(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-01$/.test(value);
}

export async function GET(request: Request) {
  const clerkUserId = await getAuthenticatedClerkUserId(request);
  if (!clerkUserId) return Response.json({ error: "Authentication required." }, { status: 401 });

  const month = new URL(request.url).searchParams.get("month");
  if (!isMonthStart(month)) return Response.json({ error: "A valid month is required." }, { status: 400 });
  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.NEON_DB_URL;
  if (!databaseUrl) return Response.json({ error: "Database is not configured on the server." }, { status: 503 });

  try {
    const sql = neon(databaseUrl);
    await sql`
      INSERT INTO app_users (clerk_user_id, last_seen_at)
      VALUES (${clerkUserId}, now())
      ON CONFLICT (clerk_user_id) DO UPDATE SET last_seen_at = now()
    `;
    const budgets = await sql`
      SELECT amount::float8 AS amount
      FROM monthly_budgets
      WHERE clerk_user_id = ${clerkUserId} AND month_start = ${month}::date
      LIMIT 1
    `;
    const expenses = await sql`
      SELECT expense_id AS id, title, amount::float8 AS amount, category, spent_at AS date
      FROM budget_expenses
      WHERE clerk_user_id = ${clerkUserId} AND month_start = ${month}::date
      ORDER BY spent_at DESC
      LIMIT 100
    `;
    return Response.json({ budget: budgets[0]?.amount ?? null, expenses });
  } catch (error) {
    console.error("GET /api/budget error:", error);
    return Response.json({ error: "Unable to load your budget from Neon." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const clerkUserId = await getAuthenticatedClerkUserId(request);
  if (!clerkUserId) return Response.json({ error: "Authentication required." }, { status: 401 });

  let body: { month?: unknown; budget?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isMonthStart(body.month) || typeof body.budget !== "number" || !Number.isFinite(body.budget) || body.budget <= 0) {
    return Response.json({ error: "Enter a valid month and budget amount." }, { status: 400 });
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.NEON_DB_URL;
  if (!databaseUrl) return Response.json({ error: "Database is not configured on the server." }, { status: 503 });

  try {
    const sql = neon(databaseUrl);
    await sql`
      INSERT INTO app_users (clerk_user_id, last_seen_at)
      VALUES (${clerkUserId}, now())
      ON CONFLICT (clerk_user_id) DO UPDATE SET last_seen_at = now()
    `;
    await sql`
      INSERT INTO monthly_budgets (clerk_user_id, month_start, amount, updated_at)
      VALUES (${clerkUserId}, ${body.month}::date, ${body.budget}, now())
      ON CONFLICT (clerk_user_id, month_start)
      DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
    `;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("POST /api/budget error:", error);
    return Response.json({ error: "Unable to save your budget to Neon." }, { status: 500 });
  }
}
