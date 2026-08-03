export const GOOGLE_ACCOUNTS = ["personal", "cinme"] as const;
export type GoogleAccount = (typeof GOOGLE_ACCOUNTS)[number];

function refreshTokenFor(account: GoogleAccount): string | undefined {
  return account === "cinme"
    ? process.env.CINME_GOOGLE_REFRESH_TOKEN?.trim()
    : process.env.GOOGLE_REFRESH_TOKEN?.trim();
}

export function hasGoogleAccount(account: GoogleAccount): boolean {
  return Boolean(refreshTokenFor(account));
}

export async function getGoogleAccessToken(
  account: GoogleAccount = "personal",
): Promise<string> {
  const refreshToken = refreshTokenFor(account);
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`La cuenta Google '${account}' no esta configurada.`);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok)
    throw new Error(`Google OAuth error para '${account}' (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token)
    throw new Error(`Google OAuth no devolvio token para '${account}'.`);
  return data.access_token;
}
