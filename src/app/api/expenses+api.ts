import { neon } from "@neondatabase/serverless";
import { getAuthenticatedClerkUserId } from "../../lib/server-auth";

const CATEGORIES = new Set(["Food", "Groceries", "Transport", "Bills", "Other"]);

export async function POST(request: Request) {
  const clerkUserId = await getAuthenticatedClerkUserId(request);
  if (!clerkUserId) return Response.json({ error: "Authentication required." }, { status: 401 });

  let body: { id?: unknown; title?: unknown; amount?: unknown; category?: unknown; date?: unknown; month?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (
    typeof body.id !== "string" || !body.id || body.id.length > 80 ||
    typeof body.title !== "string" || !body.title.trim() || body.title.length > 120 ||
    typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 ||
    typeof body.category !== "string" || !CATEGORIES.has(body.category) ||
    typeof body.date !== "string" || Number.isNaN(Date.parse(body.date)) ||
    typeof body.month !== "string" || !/^\d{4}-\d{2}-01$/.test(body.month)
  ) {
    return Response.json({ error: "Enter a valid expense." }, { status: 400 });
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
      INSERT INTO budget_expenses (clerk_user_id, expense_id, month_start, title, amount, category, spent_at)
      VALUES (${clerkUserId}, ${body.id}, ${body.month}::date, ${body.title.trim()}, ${body.amount}, ${body.category}, ${body.date}::timestamptz)
      ON CONFLICT (clerk_user_id, expense_id) DO NOTHING
    `;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("POST /api/expenses error:", error);
    return Response.json({ error: "Unable to save your expense to Neon." }, { status: 500 });
  }
}
