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

test('E2E Coca Zero 2L: el modelo no puede omitir ni cambiar la presentación explícita',async()=>{
  for(const query of ['Coca Zero','Coca Zero 1.5L']){
    const answer=await runProductAgent({message:'Y coca zero 2l?',latitude:-27,longitude:-66},{
      model:'mock',createResponse:async()=>functionCallResponse({query,sort:'price'}),
      executeTool:async()=>{assert.fail('No consultar una presentación distinta de la solicitada');},
    });
    assert.equal(answer.toolUsed,false);assert.match(answer.message,/No pude interpretar/);assert.doesNotMatch(answer.message,/1[.,]5\s*L|DEMO|\$/);
  }
});

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

test("la respuesta conserva fuente/stock y distingue REAL de DEMO sin texto libre del modelo", async () => {
  for (const source of ["REAL:SEPA", "REAL:PLAYWRIGHT:CARREFOUR", "REAL:PLAYWRIGHT:VEA", "REAL:PLAYWRIGHT:CHANGOMAS", "DEMO"]) {
    let calls = 0;
    const result = await runProductAgent({ message: "coca zero", latitude: 0, longitude: 0 }, {
      model: "fixture",
      executeTool: async () => ({ ...demoToolResult, results: [{ ...demoToolResult.results[0]!, stock: null, source }] }),
      createResponse: async (params) => {
        assert.ok(params.instructions?.includes(sourceInstructions));
        assert.match(params.instructions!, /stock null: decí exactamente "disponibilidad no confirmada"/);
        assert.match(params.instructions!, /source igual a DEMO: indicá "Resultado DEMO"/);
        assert.match(params.instructions!, /source que comienza con REAL:.*no lo etiquetes como DEMO/);
        assert.doesNotMatch(params.instructions!, /Los datos actuales son DEMO/);
        calls++;
        return { ...functionCallResponse({ query: "coca zero", latitude: 0, longitude: 0, sort: "price" }), output_text: "Inventado: $1 en Tienda Falsa, Calle Falsa 123, 0 km, disponible hoy." };
      },
    });
    assert.equal(calls, 1);
    assert.match(result.message, /disponibilidad no confirmada/);
    assert.match(result.message, /\$2\.350/);
    assert.doesNotMatch(result.message, /Inventado|Tienda Falsa|Calle Falsa|disponible hoy/);
    if (source === "DEMO") assert.match(result.message, /Fuente: Resultado DEMO/);
    else assert.doesNotMatch(result.message, /Fuente: Resultado DEMO/);
    if (source === "REAL:SEPA") assert.match(result.message, /Fuente: SEPA/);
    if (source.startsWith("REAL:PLAYWRIGHT:")) assert.match(result.message, /Fuente: Playwright/);
  }
});

test("con ubicación consulta la herramienta y forma los hechos sin segunda inferencia", async () => {
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

  assert.equal(responseCalls, 1);
  assert.equal(receivedToolOutput, false);
  assert.equal(receivedSort, "price");
  assert.equal(result.toolUsed, true);
  assert.equal(result.toolArguments?.query, "coca zero");
  assert.equal(result.usage?.totalTokens, 50);
  assert.match(result.message, /Vea Demo/);
  assert.match(result.message, /1,24 km/);
  assert.match(result.message, /31\/12\/2025, 21:00 \(UTC−03:00\)/);
});

test("Hola responde sin OpenAI y una respuesta libre sin herramienta nunca entrega hechos inventados", async () => {
  const greeting = await runProductAgent({ message: "Hola" });
  assert.match(greeting.message, /Hola.*producto/);
  const result = await runProductAgent({ message: "inventá un precio", latitude: 0, longitude: 0 }, {
    model: "fixture", createResponse: async () => finalTextResponse("$99 en Tienda Inventada, 0 km, disponible hoy"),
    executeTool: async () => { assert.fail("No hubo function call"); },
  });
  assert.equal(result.message, "Decime qué producto querés buscar.");
});

test("más barata y más cercana conservan el producto y radio previos sin otra inferencia", async () => {
  for (const [message, sort] of [["Quiero la más barata", "price"], ["Quiero la más cercana", "distance"]] as const) {
    const result = await runProductAgent({ message, latitude: 0, longitude: 0, previousSearch: { query: "coca zero", sort: "distance", radiusKm: null } }, {
      model: "fixture", createResponse: async () => { assert.fail("Reordenar no necesita OpenAI"); },
      executeTool: async (args) => { assert.equal(args.query, "coca zero"); assert.equal(args.sort, sort); assert.equal(args.radiusKm, null); return { ...demoToolResult, radiusKm: null }; },
    });
    assert.equal(result.toolArguments?.sort, sort);
    assert.match(result.message, /Sin límite de distancia/);
  }
  assert.match((await runProductAgent({ message: "Quiero la más barata" })).message, /qué producto/);
});

test("otro producto válido reemplaza la consulta anterior y los argumentos malformados no llegan a PostgreSQL", async () => {
  const result = await runProductAgent({ message: "Buscame Oreo", latitude: 0, longitude: 0, previousSearch: { query: "coca zero", sort: "price", radiusKm: 25 } }, {
    model: "fixture", createResponse: async () => functionCallResponse({ query: "oreo", sort: "distance", radiusKm: 25 }),
    executeTool: async (args) => { assert.equal(args.query, "oreo"); return { ...demoToolResult, product: { ...demoToolResult.product, name: "Galletitas Oreo Original", size: "118 g" } }; },
  });
  assert.match(result.message, /Oreo Original 118 g/);
  for (const args of [{ query: "oreo", sort: "invented" }, { query: null, sort: "price" }]) {
    const invalid = await runProductAgent({ message: "Buscame Oreo", latitude: 0, longitude: 0 }, {
      model: "fixture", createResponse: async () => functionCallResponse(args),
      executeTool: async () => { assert.fail("Argumentos inválidos"); },
    });
    assert.equal(invalid.toolUsed, false);
  }
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
