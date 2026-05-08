#!/usr/bin/env node
/**
 * Genera un Google refresh token con scopes de Calendar + Gmail.
 * Uso: node tools/get-google-token.mjs
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

const rl = readline.createInterface({ input, output });

console.log("\n=== CLAUDIO — Google OAuth Setup ===\n");

const clientId     = await rl.question("Client ID     : ");
const clientSecret = await rl.question("Client Secret : ");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id:     clientId.trim(),
    redirect_uri:  "urn:ietf:wg:oauth:2.0:oob",
    response_type: "code",
    scope:         SCOPES,
    access_type:   "offline",
    prompt:        "consent",
  }).toString();

console.log("\n1. Abrí este URL en el navegador:\n");
console.log(authUrl);
console.log("\n2. Iniciá sesión con tu cuenta Google y autorizá los permisos.");
console.log("3. Google te muestra un código. Copialo y pegalo abajo.\n");

const code = await rl.question("Código de autorización: ");

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code:          code.trim(),
    client_id:     clientId.trim(),
    client_secret: clientSecret.trim(),
    redirect_uri:  "urn:ietf:wg:oauth:2.0:oob",
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
