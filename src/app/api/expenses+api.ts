import { neon } from "@neondatabase/serverless";
import { getAuthenticatedClerkUserId } from "../../lib/server-auth";

const ALLOWED_CATEGORIES = new Set([
  "Food",
  "Groceries",
  "Transport",
  "Bills",
  "Other",
  "Salary",
  "Freelance",
  "Gift",
  "Refund",
  "Income",
]);

export async function POST(request: Request) {
  const clerkUserId = await getAuthenticatedClerkUserId(request);
  if (!clerkUserId) return Response.json({ error: "Authentication required." }, { status: 401 });

  let body: {
    id?: unknown;
    title?: unknown;
    amount?: unknown;
    category?: unknown;
    type?: unknown;
    date?: unknown;
    month?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const transactionType = body.type === "income" ? "income" : "expense";
  const category = typeof body.category === "string" && ALLOWED_CATEGORIES.has(body.category)
    ? body.category
    : transactionType === "income"
    ? "Income"
    : "Other";

  if (
    typeof body.id !== "string" || !body.id || body.id.length > 80 ||
    typeof body.title !== "string" || !body.title.trim() || body.title.length > 120 ||
    typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 ||
    typeof body.date !== "string" || Number.isNaN(Date.parse(body.date)) ||
    typeof body.month !== "string" || !/^\d{4}-\d{2}-01$/.test(body.month)
  ) {
    return Response.json({ error: "Enter a valid transaction." }, { status: 400 });
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
      INSERT INTO budget_expenses (clerk_user_id, expense_id, month_start, title, amount, category, transaction_type, spent_at)
      VALUES (${clerkUserId}, ${body.id}, ${body.month}::date, ${body.title.trim()}, ${body.amount}, ${category}, ${transactionType}, ${body.date}::timestamptz)
      ON CONFLICT (clerk_user_id, expense_id) DO NOTHING
    `;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("POST /api/expenses error:", error);
    return Response.json({ error: "Unable to save transaction to Neon." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const clerkUserId = await getAuthenticatedClerkUserId(request);
  if (!clerkUserId) return Response.json({ error: "Authentication required." }, { status: 401 });

  let body: { id?: unknown; title?: unknown; amount?: unknown; category?: unknown; type?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const transactionType = body.type === "income" ? "income" : "expense";
  const category = typeof body.category === "string" && ALLOWED_CATEGORIES.has(body.category)
    ? body.category
    : transactionType === "income"
    ? "Income"
    : "Other";

  if (
    typeof body.id !== "string" || !body.id ||
    typeof body.title !== "string" || !body.title.trim() || body.title.length > 120 ||
    typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0
  ) {
    return Response.json({ error: "Enter a valid transaction to update." }, { status: 400 });
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.NEON_DB_URL;
  if (!databaseUrl) return Response.json({ error: "Database is not configured on the server." }, { status: 503 });

  try {
    const sql = neon(databaseUrl);
    await sql`
      UPDATE budget_expenses
      SET title = ${body.title.trim()},
          amount = ${body.amount},
          category = ${category},
          transaction_type = ${transactionType}
      WHERE clerk_user_id = ${clerkUserId} AND expense_id = ${body.id}
    `;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/expenses error:", error);
    return Response.json({ error: "Unable to update transaction in Neon." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const clerkUserId = await getAuthenticatedClerkUserId(request);
  if (!clerkUserId) return Response.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "Transaction ID is required." }, { status: 400 });

  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.NEON_DB_URL;
  if (!databaseUrl) return Response.json({ error: "Database is not configured on the server." }, { status: 503 });

  try {
    const sql = neon(databaseUrl);
    await sql`
      DELETE FROM budget_expenses
      WHERE clerk_user_id = ${clerkUserId} AND expense_id = ${id}
    `;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/expenses error:", error);
    return Response.json({ error: "Unable to delete transaction from Neon." }, { status: 500 });
  }
}
