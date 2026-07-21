#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = "http://127.0.0.1:8787/oauth2callback";
const envPath = path.resolve(process.cwd(), ".env");

const scopes = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

if (!clientId || !clientSecret) {
  console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
  process.exit(1);
}

function upsertEnv(raw, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (pattern.test(raw)) return raw.replace(pattern, line);
  return `${raw.replace(/\s*$/, "")}\n${line}\n`;
}

async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.refresh_token) {
    throw new Error(`Google token error ${res.status}: ${JSON.stringify(data)}`);
  }
  return data.refresh_token;
}

function saveEnv(refreshToken) {
  let raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  raw = upsertEnv(raw, "GOOGLE_CLIENT_ID", clientId);
  raw = upsertEnv(raw, "GOOGLE_CLIENT_SECRET", clientSecret);
  raw = upsertEnv(raw, "GOOGLE_REDIRECT_URI", redirectUri);
  raw = upsertEnv(raw, "GOOGLE_REFRESH_TOKEN", refreshToken);
  fs.writeFileSync(envPath, raw, "utf8");
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
  }).toString();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", redirectUri);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end("Not found");
      return;
    }
    const error = url.searchParams.get("error");
    if (error) throw new Error(error);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Missing code");
    const refreshToken = await exchangeCode(code);
    saveEnv(refreshToken);
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("CLAUDIO ya quedó autorizado con Google. Podés cerrar esta pestaña.");
    server.close(() => process.exit(0));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Error autorizando CLAUDIO: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(8787, "127.0.0.1", () => {
  console.log("OPEN_URL_START");
  console.log(authUrl);
  console.log("OPEN_URL_END");
});
