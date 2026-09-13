import assert from "node:assert/strict";
import test from "node:test";
import { checkEnvironment, checkExitCode } from "../scripts/demo-check.js";

test("pre-check: una cadena caída no bloquea con servicios principales OK", () => {
  assert.equal(checkExitCode([
    { name: "Neon", status: "OK", detail: "lectura verificada" },
    { name: "ofertas reales", status: "OK", detail: "datos válidos" },
    { name: "Carrefour provider", status: "WARN", detail: "sitio caído" },
  ]), 0);
  assert.equal(checkExitCode([{ name: "Neon", status: "ERROR", detail: "sin conexión" }]), 1);
});

test("pre-check: variables inválidas informan nombres sin exponer sus valores", () => {
  const secrets = ["key-private-fixture", "secret-private-fixture", "token-private-fixture", "postgres-password-private", "5493810000000"];
  const result = checkEnvironment({
    DATABASE_URL: `invalid://${secrets[3]}@host`, OPENAI_API_KEY: secrets[0],
    WHATSAPP_APP_SECRET: secrets[1], WHATSAPP_ACCESS_TOKEN: secrets[2],
    WHATSAPP_PHONE_NUMBER_ID: `invalid-${secrets[4]}`, NODE_ENV: "development",
  });
  assert.equal(result.status, "ERROR");
  assert.match(result.detail, /DATABASE_URL/);
  for (const secret of secrets) assert.ok(!JSON.stringify(result).includes(secret));
});
