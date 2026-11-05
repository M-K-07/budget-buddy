import Constants from "expo-constants";
import { Platform } from "react-native";

function getApiBaseUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  if (configuredUrl) return configuredUrl;

  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }

  // Expo Router API routes run on the Metro host during development.
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split("/")[0]}`;

  throw new Error("Set EXPO_PUBLIC_API_URL to your deployed API server URL.");
}

export async function apiRequest<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

export function currentMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}
