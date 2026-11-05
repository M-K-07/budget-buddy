import { neon } from "@neondatabase/serverless";
import { getAuthenticatedClerkUserId } from "../../lib/server-auth";

export async function POST(request: Request) {
  const clerkUserId = await getAuthenticatedClerkUserId(request);
  if (!clerkUserId) return Response.json({ error: "Authentication required." }, { status: 401 });

  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.NEON_DB_URL;
  if (!databaseUrl) {
    return Response.json({ error: "Database is not configured on the server." }, { status: 503 });
  }

  try {
    const sql = neon(databaseUrl);
    await sql`
      INSERT INTO app_users (clerk_user_id, last_seen_at)
      VALUES (${clerkUserId}, now())
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET last_seen_at = now()
    `;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("POST /api/users error:", error);
    return Response.json({ error: "Unable to sync the account right now." }, { status: 500 });
  }
}
