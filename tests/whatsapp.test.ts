import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import Fastify from "fastify";

import { createWhatsAppWebhookRoutes } from "../src/whatsapp/webhook.js";
import { MessageDeduplicator, WhatsAppSessionStore } from "../src/whatsapp/session.js";

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";

type AgentCall = { message: string; latitude?: number; longitude?: number };

const messagePayload = (message: object) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { messages: [message] } }] }],
});

const createHarness = async () => {
  const sent: Array<{ to: string; body: string }> = [];
  const agentCalls: AgentCall[] = [];
  const pendingTasks: Promise<void>[] = [];
  const app = Fastify({ logger: false });

  await app.register(
    createWhatsAppWebhookRoutes({
      agent: async (input) => {
        agentCalls.push(input);
        return {
          message:
            input.latitude === undefined
              ? "Compartime tu ubicación para buscar los puntos de venta cercanos."
              : "Resultados DEMO para el producto.",
          toolUsed: input.latitude !== undefined,
        };
      },
      sendText: async (to, body) => {
        sent.push({ to, body });
      },
      sessions: new WhatsAppSessionStore(),
      deduplicator: new MessageDeduplicator(),
      getVerifyToken: () => VERIFY_TOKEN,
      getAppSecret: () => APP_SECRET,
      schedule: (task) => {
        pendingTasks.push(task());
      },
    }),
  );

  const post = async (payload: object) => {
    const rawPayload = JSON.stringify(payload);
    const signature = `sha256=${createHmac("sha256", APP_SECRET).update(rawPayload).digest("hex")}`;
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/whatsapp",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
      },
      payload: rawPayload,
    });
    await Promise.all(pendingTasks.splice(0));
    return response;
  };

  return { app, post, sent, agentCalls };
};

test("verifica correctamente el webhook", async () => {
  const harness = await createHarness();
  const response = await harness.app.inject({
    method: "GET",
    url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "12345");
  await harness.app.close();
});

test("rechaza un verify token incorrecto", async () => {
  const harness = await createHarness();
  const response = await harness.app.inject({
    method: "GET",
    url: "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=incorrecto&hub.challenge=12345",
  });
  assert.equal(response.statusCode, 403);
  await harness.app.close();
});

test("recibe texto y solicita ubicación", async () => {
  const harness = await createHarness();
  const response = await harness.post(
    messagePayload({ id: "text-1", from: "user-1", type: "text", text: { body: "coca zero" } }),
  );
  assert.equal(response.statusCode, 200);
  assert.equal(harness.agentCalls[0]?.message, "coca zero");
  assert.equal(harness.agentCalls[0]?.latitude, undefined);
  assert.match(harness.sent[0]?.body ?? "", /ubicación/i);
  await harness.app.close();
});

test("texto seguido de ubicación ejecuta el agente con el mensaje pendiente", async () => {
  const harness = await createHarness();
  await harness.post(
    messagePayload({ id: "text-2", from: "user-2", type: "text", text: { body: "oreo cerca" } }),
  );
  await harness.post(
    messagePayload({
      id: "location-2",
      from: "user-2",
      type: "location",
      location: { latitude: -26.82, longitude: -65.22 },
    }),
  );
  assert.deepEqual(harness.agentCalls[1], {
    message: "oreo cerca",
    latitude: -26.82,
    longitude: -65.22,
  });
  assert.match(harness.sent[1]?.body ?? "", /DEMO/);
  await harness.app.close();
});

test("ubicación seguida de texto ejecuta el agente con ubicación guardada", async () => {
  const harness = await createHarness();
  await harness.post(
    messagePayload({
      id: "location-3",
      from: "user-3",
      type: "location",
      location: { latitude: -26.83, longitude: -65.21 },
    }),
  );
  assert.match(harness.sent[0]?.body ?? "", /Ubicación recibida/i);

  await harness.post(
    messagePayload({ id: "text-3", from: "user-3", type: "text", text: { body: "pepsi black" } }),
  );
  assert.deepEqual(harness.agentCalls[0], {
    message: "pepsi black",
    latitude: -26.83,
    longitude: -65.21,
  });
  await harness.app.close();
});

test("deduplica reintentos por message.id", async () => {
  const harness = await createHarness();
  const payload = messagePayload({
    id: "duplicate-1",
    from: "user-4",
    type: "text",
    text: { body: "fernet" },
  });
  await harness.post(payload);
  await harness.post(payload);
  assert.equal(harness.agentCalls.length, 1);
  assert.equal(harness.sent.length, 1);
  await harness.app.close();
});

test("eventos status no generan respuesta", async () => {
  const harness = await createHarness();
  const response = await harness.post({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "status-1" }] } }] }],
  });
  assert.equal(response.statusCode, 200);
  assert.equal(harness.agentCalls.length, 0);
  assert.equal(harness.sent.length, 0);
  await harness.app.close();
});
