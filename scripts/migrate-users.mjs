import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set in .env.");
}

const sql = neon(databaseUrl);

await sql`
  CREATE TABLE IF NOT EXISTS app_users (
    clerk_user_id text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
  )
`;

console.log("Created or verified the app_users table.");
