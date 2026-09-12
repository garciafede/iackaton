import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";
import type OpenAI from "openai";

import { runProductAgent, sourceInstructions } from "../src/ai/agent.js";
import { createChatRoutes } from "../src/routes/chat.js";

const functionCallResponse = (args: object): OpenAI.Responses.Response =>
  ({
    output_text: "",
    output: [
      {
        type: "function_call",
        id: "fc_test",
        call_id: "call_test",
        name: "findProductOffers",
        arguments: JSON.stringify(args),
        status: "completed",
      },
    ],
    usage: { input_tokens: 40, output_tokens: 10, total_tokens: 50 },
  }) as unknown as OpenAI.Responses.Response;

const finalTextResponse = (text: string): OpenAI.Responses.Response =>
  ({
    output_text: text,
    output: [],
    usage: { input_tokens: 80, output_tokens: 20, total_tokens: 100 },
  }) as unknown as OpenAI.Responses.Response;

const demoToolResult = {
  radiusKm: 25 as number | null,
  evaluatedAt: new Date("2026-01-01T01:00:00.000Z"),
  status: "OK" as const,
  outsideRadiusCount: 0,
  canExpandRadius: false,
  suggestedRadiusKm: null as number | null,
  product: {
    id: 1,
    brand: "Coca-Cola",
    name: "Coca-Cola Sin Azúcar",
    variant: "Zero",
    size: "1.5 L",
  },
  totalResults: 1,
  results: [
    {
      store: { id: 1, chain: "Vea Demo", name: "Vea Demo", address: "DEMO" },
      price: 2350,
      distanceKm: 1.24,
      stock: true as const,
      source: "DEMO",
      lastCheckedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
};

test("POST /chat sin mensaje devuelve 400", async () => {
  const app = Fastify({ logger: false });
  await app.register(createChatRoutes());
  const response = await app.inject({ method: "POST", url: "/chat", payload: {} });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test("POST /chat rechaza coordenadas inválidas", async () => {
  const app = Fastify({ logger: false });
  await app.register(createChatRoutes());
  const response = await app.inject({
    method: "POST",
    url: "/chat",
    payload: { message: "coca zero", latitude: -91, longitude: -65.22 },
  });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test("sin ubicación solicita ubicación sin llamar a OpenAI", async () => {
  const result = await runProductAgent({ message: "¿Dónde consigo coca zero?" });
  assert.equal(result.toolUsed, false);
  assert.match(result.message, /ubicación/i);
});

test("OpenAI recibe fuente/stock originales e instrucciones distintas para REAL y DEMO", async () => {
  for (const source of ["REAL:SEPA", "DEMO"]) {
    let calls = 0;
    await runProductAgent({ message: "coca zero", latitude: 0, longitude: 0 }, {
      model: "fixture",
      executeTool: async () => ({ ...demoToolResult, results: [{ ...demoToolResult.results[0]!, stock: null, source }] }),
      createResponse: async (params) => {
        assert.ok(params.instructions?.includes(sourceInstructions));
        assert.match(params.instructions!, /stock null: decí exactamente "disponibilidad no confirmada"/);
        assert.match(params.instructions!, /source igual a DEMO: indicá "Resultado DEMO"/);
        assert.match(params.instructions!, /source que comienza con REAL:.*no lo etiquetes como DEMO/);
        assert.doesNotMatch(params.instructions!, /Los datos actuales son DEMO/);
        if (++calls === 1) return functionCallResponse({ query: "coca zero", latitude: 0, longitude: 0, sort: "price" });
        const output = (params.input as Array<any>).find((p) => p.type === "function_call_output");
        const data = JSON.parse(output.output);
        assert.equal(data.results[0].source, source);
        assert.equal(data.results[0].stock, null);
        return finalTextResponse("Respuesta simulada de test.");
      },
    });
  }
});

test("con ubicación completa tool y segundo turno de Responses API", async () => {
  let responseCalls = 0;
  let receivedSort = "";
  let receivedToolOutput = false;

  const result = await runProductAgent(
    { message: "Buscame coca zero más barata", latitude: -26.82, longitude: -65.22 },
    {
      model: "test-model",
      createResponse: async (params) => {
        responseCalls += 1;
        if (responseCalls === 1) {
          return functionCallResponse({
            query: "coca zero",
            latitude: 0,
            longitude: 0,
            sort: "price",
          });
        }

        receivedToolOutput = JSON.stringify(params.input).includes("function_call_output");
        return finalTextResponse("Opciones DEMO: Vea Demo — $2.350 — 1,24 km");
      },
      executeTool: async (args) => {
        receivedSort = args.sort;
        assert.equal(args.latitude, -26.82);
        assert.equal(args.longitude, -65.22);
        return demoToolResult;
      },
    },
  );

  assert.equal(responseCalls, 2);
  assert.equal(receivedToolOutput, true);
  assert.equal(receivedSort, "price");
  assert.equal(result.toolUsed, true);
  assert.equal(result.toolArguments?.query, "coca zero");
  assert.equal(result.usage?.totalTokens, 150);
  assert.match(result.message, /Vea Demo/);
});

test("un producto inexistente no inventa resultados", async () => {
  let responseCalls = 0;
  const result = await runProductAgent(
    { message: "Buscame algo inexistente", latitude: -26.82, longitude: -65.22 },
    {
      model: "test-model",
      createResponse: async () => {
        responseCalls += 1;
        return functionCallResponse({
          query: "algo inexistente",
          latitude: -26.82,
          longitude: -65.22,
          sort: "distance",
        });
      },
      executeTool: async () => null,
    },
  );

  assert.equal(responseCalls, 1);
  assert.equal(result.toolUsed, true);
  assert.match(result.message, /no encontramos/i);
  assert.doesNotMatch(result.message, /\$|km|Vea|Carrefour|Jumbo/);
});

test("el agente transmite el radio explícito y mantiene el radio por defecto ante null del modelo", async () => {
  for (const [message, expected] of [["Buscame Coca Zero cerca", 25], ["Coca Zero a menos de 5 km", 5], ["Coca Zero sin importar distancia", null]] as const) {
    let calls = 0;
    let toolRadius: number | null | undefined;
    await runProductAgent({ message, latitude: 0, longitude: 0 }, {
      model: "fixture",
      createResponse: async () => ++calls === 1
        ? functionCallResponse({ query: "coca zero", latitude: 0, longitude: 0, sort: "price", radiusKm: null })
        : finalTextResponse("Respuesta simulada"),
      executeTool: async (args) => {
        toolRadius = args.radiusKm;
        return { ...demoToolResult, radiusKm: args.radiusKm! };
      },
    });
    assert.equal(toolRadius, expected);
  }
});

test("sin ofertas en el radio ofrece ampliarlo sin otra llamada OpenAI ni inventar precios", async () => {
  let calls = 0;
  const result = await runProductAgent({ message: "Coca Zero a menos de 5 km", latitude: 0, longitude: 0 }, {
    model: "fixture",
    createResponse: async () => {
      calls++;
      return functionCallResponse({ query: "coca zero", latitude: 0, longitude: 0, sort: "recommended", radiusKm: 5 });
    },
    executeTool: async () => ({ ...demoToolResult, radiusKm: 5, totalResults: 0, results: [], status: "NO_OFFERS_WITHIN_RADIUS", outsideRadiusCount: 2, canExpandRadius: true, suggestedRadiusKm: 25 }),
  });
  assert.equal(calls, 1);
  assert.equal(result.toolArguments?.radiusKm, 5);
  assert.match(result.message, /dentro de 5 km.*ampliar la búsqueda a 25 km/);
  assert.doesNotMatch(result.message, /\$|Carrefour|Vea/);
});

test("radio inválido se informa al usuario sin ejecutar la búsqueda", async () => {
  const result = await runProductAgent({ message: "Coca Zero a menos de 0 km", latitude: 0, longitude: 0 }, {
    model: "fixture",
    createResponse: async () => functionCallResponse({ query: "coca zero", latitude: 0, longitude: 0, sort: "distance", radiusKm: 0 }),
    executeTool: async () => { assert.fail("No debe buscar con un radio inválido"); },
  });
  assert.equal(result.toolUsed, false);
  assert.match(result.message, /radio mayor que 0/);
});
