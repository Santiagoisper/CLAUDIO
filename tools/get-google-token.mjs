#!/usr/bin/env node
/**
 * Genera un Google refresh token con scopes de Calendar + Gmail.
 * Uso: node tools/get-google-token.mjs
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import http from "node:http";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

const rl = readline.createInterface({ input, output });

console.log("\n=== CLAUDIO — Google OAuth Setup ===\n");

const clientId     = await rl.question("Client ID     : ");
const clientSecret = await rl.question("Client Secret : ");
const redirectUri = "http://127.0.0.1:8787/oauth2callback";

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", redirectUri);
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404).end("Not found");
          return;
        }
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(`Google devolvió error: ${error}`);
          server.close();
          reject(new Error(error));
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Falta el parámetro code.");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("CLAUDIO recibió el código. Podés volver a la terminal.");
        server.close();
        resolve(code);
      } catch (error) {
        server.close();
        reject(error);
      }
    });
    server.listen(8787, "127.0.0.1", () => {
      console.log("\nServidor local escuchando en http://127.0.0.1:8787/oauth2callback");
    });
    server.on("error", reject);
  });
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id:     clientId.trim(),
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         SCOPES,
    access_type:   "offline",
    prompt:        "consent",
  }).toString();

console.log("\n1. Abrí este URL en el navegador:\n");
console.log(authUrl);
console.log("\n2. Iniciá sesión con tu cuenta Google y autorizá los permisos.");
console.log("3. Google vuelve a localhost y CLAUDIO captura el código automáticamente.\n");

const code = await waitForCode();

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code:          code.trim(),
    client_id:     clientId.trim(),
    client_secret: clientSecret.trim(),
    redirect_uri:  redirectUri,
    grant_type:    "authorization_code",
  }),
});

const data = await res.json();

if (!res.ok || !data.refresh_token) {
  console.error("\nError al obtener tokens:", JSON.stringify(data, null, 2));
  rl.close();
  process.exit(1);
}

console.log("\n✅ Tokens obtenidos. Guardá estos valores en Railway y en .env:\n");
console.log(`GOOGLE_CLIENT_ID=${clientId.trim()}`);
console.log(`GOOGLE_CLIENT_SECRET=${clientSecret.trim()}`);
console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
console.log("\nComandos Railway:");
console.log(`railway variables set GOOGLE_CLIENT_ID="${clientId.trim()}"`);
console.log(`railway variables set GOOGLE_CLIENT_SECRET="${clientSecret.trim()}"`);
console.log(`railway variables set GOOGLE_REFRESH_TOKEN="${data.refresh_token}"`);

rl.close();
