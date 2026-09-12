import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMetaTestRecipient, sendTextMessage } from "../src/whatsapp/client.js";

test("destinatario de prueba argentino: elimina solo el 9 posterior a 54", () => {
  assert.equal(normalizeMetaTestRecipient("5491199990000"), "541199990000");
});

test("destinatario argentino sin el 9: no cambia", () => {
  assert.equal(normalizeMetaTestRecipient("541199990000"), "541199990000");
});

test("destinatario de otro país: no cambia", () => {
  assert.equal(normalizeMetaTestRecipient("59899990000"), "59899990000");
});

test("normaliza el campo to solo en desarrollo y conserva el destinatario original", async () => {
  const originalEnvironment = process.env.NODE_ENV;
  const recipient = "5491199990000";

  try {
    for (const environment of ["development", "production", "test", undefined]) {
      if (environment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = environment;

      let sentTo: string | undefined;
      await sendTextMessage(recipient, "Prueba", {
        getConfig: () => ({
          accessToken: "test-token",
          phoneNumberId: "test-phone-id",
          graphApiVersion: "v-test",
        }),
        fetch: async (_url, options) => {
          sentTo = JSON.parse(String(options?.body)).to;
          return new Response("{}", { status: 200 });
        },
      });

      assert.equal(sentTo, environment === "development" ? "541199990000" : recipient);
      assert.equal(recipient, "5491199990000");
    }
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  }
});
