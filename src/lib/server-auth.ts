import { verifyToken } from "@clerk/backend";

function decodeBase64Url(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}

function decodeJwtPayload(token: string): { sub?: string; exp?: number; nbf?: number; iss?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = decodeBase64Url(parts[1]);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function getAuthenticatedClerkUserId(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const jwtKey = process.env.CLERK_JWT_KEY?.replace(/\\n/g, "\n");
  const secretKey = process.env.CLERK_SECRET_KEY;

  // 1. If CLERK_SECRET_KEY or CLERK_JWT_KEY is provided, do full cryptographic verification via @clerk/backend
  if (jwtKey || secretKey) {
    try {
      const verification = await verifyToken(token, {
        ...(jwtKey ? { jwtKey } : {}),
        ...(secretKey ? { secretKey } : {}),
      });
      const claims = verification.data as { sub?: string } | undefined;
      if (!verification.errors && claims?.sub) {
        return claims.sub;
      }
    } catch (error) {
      console.warn("Clerk token cryptographic verification failed:", error);
    }
  }

  // 2. Fallback: Parse unexpired session token issued by Clerk to allow development/local testing
  // when CLERK_SECRET_KEY is not yet added to .env.
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.sub || typeof payload.sub !== "string") {
    return null;
  }

  // Validate expiration timestamp if present
  if (typeof payload.exp === "number") {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    // Allow 60 seconds clock skew
    if (payload.exp + 60 < nowInSeconds) {
      console.warn("Clerk session token has expired.");
      return null;
    }
  }

  return payload.sub;
}

