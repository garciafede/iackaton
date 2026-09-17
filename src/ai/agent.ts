import type OpenAI from "openai";
import {logError} from '../lib/safe-logging.js';

import { createOpenAIClient, getOpenAIModel } from "../config/openai.js";
import {
  executeFindProductOffers,
  productAgentTools,
  type FindProductOffersArguments,
} from "./tools.js";
import { resolveMessageRadius } from "./search-preferences.js";
import { offerQualityConfig } from "../services/offer-quality.js";
import { formatOffers } from "./format-offers.js";
import { followupSort, isGreeting, requestedSort, wantsDetails, type PreviousSearch } from "./conversation.js";
import { formatCompactOffers } from "./format-compact.js";
import { matchesRequestedPresentation } from "../catalog/matching.js";

type AgentInput = {
  message: string;
  latitude?: number;
  longitude?: number;
  previousSearch?: PreviousSearch;
  compact?: boolean;
  sort?: import("../services/product-search.service.js").SearchSort;
  onEvent?: (event: AgentEvent) => void;
  onSearchResult?: (result:SearchToolResult)=>void;
};

export type AgentEvent =
  | { type: "tool_selected"; tool: "findProductOffers"; arguments: FindProductOffersArguments }
  | { type: "tool_started"; tool: "findProductOffers" }
  | { type: "tool_completed"; tool: "findProductOffers"; totalResults: number }
  | { type: "response_generation_started" }
  | { type: "response_generated"; usage?: AgentUsage };

export type AgentUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AgentResult = {
  message: string;
  toolUsed: boolean;
  toolArguments?: FindProductOffersArguments;
  usage?: AgentUsage;
};

type SearchToolResult = Awaited<ReturnType<typeof executeFindProductOffers>>;

type AgentDependencies = {
  createResponse: (
    params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  ) => Promise<OpenAI.Responses.Response>;
  executeTool: (args: FindProductOffersArguments) => Promise<SearchToolResult>;
  model: string;
};

export const sourceInstructions = `
Usá source y stock de cada oferta para describirla:
- source igual a DEMO: indicá "Resultado DEMO", sin presentarlo como información comercial real.
- source que comienza con REAL: corresponde a datos reales; no lo etiquetes como DEMO.
- stock null: decí exactamente "disponibilidad no confirmada". Nunca equivale a disponible.
- stock true: disponible; stock false: sin stock.
Para datos reales mencioná precio en pesos argentinos, comercio, distancia, disponibilidad,
fecha y hora de lastCheckedAt y fuente (SEPA o la cadena consultada con Playwright).
Mostrá fechas absolutas en horario de Argentina (UTC-03:00); no supongas que es hoy.
Si hay quality.freshnessLabel, usá ese texto para la antigüedad relativa calculada por
la aplicación; incorporá freshnessLabel como una frase completa, sin prefijos repetidos.
quality.confidence y quality.confidenceReasons también vienen calculados:
HIGH = alta, MEDIUM = media, LOW = baja. No inventes ni recalcules la confianza.
Una confianza alta no garantiza disponibilidad actual: stock es del relevamiento.
Para VERY_STALE mencioná que conviene confirmar el precio por su antigüedad.
Decí "precio verificado" y no "en tiempo real". No uses fechas de vencimiento como verificación.
Si el resultado incluye diferentes EAN/empaques, conservá la variante de cada oferta.
`;

export const agentInstructions = `
Sos un asistente breve para consumidores que buscan productos y puntos de venta.
Respondé siempre en español natural y conciso.
Cuando haya una intención de buscar o comparar un producto y se proporcione ubicación,
usá findProductOffers. Elegí sort=price para pedidos de menor precio y sort=distance
para cercanía; por defecto usá distance.
Elegí recommended cuando pida una recomendación o el mejor equilibrio.
El query debe contener solo el producto y su presentación, sin instrucciones de radio u orden.
El radio por defecto es ${offerQualityConfig.defaultRadiusKm} km, también para "cerca mío".
"A menos de 5 km" significa radiusKm=5. "No importa la distancia, quiero el más barato"
significa radiusKm=null y sort=price. null requiere un pedido explícito de ignorar distancia.
No amplíes el radio por tu cuenta. Ante resultados vacíos, ofrecé ampliar la búsqueda.
Usá exactamente las coordenadas proporcionadas por la aplicación. Nunca las inventes.
Nunca inventes precios, stock, comercios, direcciones, distancias ni fechas.
${sourceInstructions}
`;

export const finalResponseInstructions = `
Respondé en español, breve y útil, usando exclusivamente el resultado de la herramienta.
No agregues, estimes ni modifiques precios, stock, comercios, direcciones, distancias o fechas.
${sourceInstructions}
Conservá el orden recibido. Mencioná el radio aplicado y si está ordenado por precio,
distancia o recomendación. Para recommended, explicá la elección usando las diferencias
calculadas en recommendation.comparisonToCheapest. priceDifference positivo es el costo
adicional, distanceSavedKm positivo es cuánto más cerca está. No inventes diferencias.
Solo digas que cuesta más y está más cerca cuando AMBAS diferencias sean positivas.
No muestres score, pesos, componentes numéricos ni nombres de campos internos.
Explicá la recomendación en términos de precio, cercanía, antigüedad y disponibilidad.
Mostrá hasta tres opciones, salvo que el usuario pida más. Si las opciones están lejos,
mostrá igualmente su distancia real, sin calificarlas como cercanas.
`;

const addUsage = (...responses: Array<OpenAI.Responses.Response | undefined>): AgentUsage | undefined => {
  const usages = responses.map((response) => response?.usage).filter((usage) => usage !== undefined);
  if (usages.length === 0) return undefined;

  return usages.reduce<AgentUsage>(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.input_tokens,
      outputTokens: total.outputTokens + usage.output_tokens,
      totalTokens: total.totalTokens + usage.total_tokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
};

const defaultDependencies = (): AgentDependencies => {
  const client = createOpenAIClient();
  return {
    createResponse: (params) => client.responses.create(params),
    executeTool: executeFindProductOffers,
    model: getOpenAIModel(),
  };
};

// Cada ítem del carrito interpreta el producto con el mismo agente que una búsqueda individual.
export async function searchCartProduct(args:FindProductOffersArguments,dependencies?:AgentDependencies):Promise<SearchToolResult>{
  const agent=dependencies??defaultDependencies();
  let found:SearchToolResult=null;
  await runProductAgent({message:args.query,latitude:args.latitude,longitude:args.longitude,sort:args.sort,compact:true},{
    ...agent,
    executeTool:async selected=>{
      found=await agent.executeTool({...selected,latitude:args.latitude,longitude:args.longitude,sort:args.sort,...(args.radiusKm!==undefined?{radiusKm:args.radiusKm}:{})});
      return found;
    },
  });
  return found;
}

export const runProductAgent = async (
  input: AgentInput,
  dependencies?: AgentDependencies,
): Promise<AgentResult> => {
  let stage='agent.input',query=input.previousSearch?.query??input.message;
  try {
  if (isGreeting(input.message)) return { message: input.latitude === undefined ? "¡Hola! Decime qué producto querés buscar y compartime tu ubicación." : "¡Hola! Ya tengo tu ubicación. Decime qué producto querés buscar.", toolUsed: false };
  const reorder = followupSort(input.message) ?? (wantsDetails(input.message) && !/\b(buscame|buscar|comprar)\b/i.test(input.message) && input.previousSearch ? input.previousSearch.sort : undefined);
  if (reorder && !input.previousSearch) return { message: "Decime qué producto querés comparar.", toolUsed: false };
  if (input.latitude === undefined || input.longitude === undefined) {
    return {
      message: "Compartime tu ubicación para buscar los comercios más cercanos.",
      toolUsed: false,
    };
  }

  stage='openai.configuration';
  const agent = dependencies ?? defaultDependencies();
  const conversation: OpenAI.Responses.ResponseInput = [
    { role: "user", content: input.message },
    {
      role: "user",
      content: `Ubicación provista por la aplicación: latitude=${input.latitude}, longitude=${input.longitude}`,
    },
  ];

  stage='openai.responses';
  const toolDecisionResponse = reorder && input.previousSearch ? undefined : await agent.createResponse({
    model: agent.model,
    instructions: agentInstructions,
    tools: productAgentTools,
    input: conversation,
  });

  const toolCall = toolDecisionResponse?.output.find(
    (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
      item.type === "function_call" && item.name === "findProductOffers",
  );

  if (!toolCall && !reorder) {
    const usage = addUsage(toolDecisionResponse);
    return {
      message: "Decime qué producto querés buscar.",
      toolUsed: false,
      ...(usage ? { usage } : {}),
    };
  }

  let toolArguments: FindProductOffersArguments;
  try {
    toolArguments = reorder && input.previousSearch
      ? { ...input.previousSearch, sort: reorder, latitude: input.latitude, longitude: input.longitude }
      : JSON.parse(toolCall!.arguments) as FindProductOffersArguments;
    if (!toolArguments || typeof toolArguments.query !== "string" || !toolArguments.query.trim() || toolArguments.query.length > 200 || !["price", "distance", "recommended"].includes(toolArguments.sort)) throw new Error("Invalid tool arguments");
    if (!reorder && !matchesRequestedPresentation(input.message, toolArguments.query)) throw new Error("Tool arguments changed the requested presentation");
  } catch(error) {
    logError(error,{intent:'SEARCH_PRODUCT',query,provider:'OPENAI',stage:'tool.arguments'});
    return { message: "No pude interpretar la búsqueda. Decime el nombre del producto e intentamos de nuevo.", toolUsed: false };
  }
  toolArguments.latitude = input.latitude;
  toolArguments.longitude = input.longitude;
  toolArguments.sort = requestedSort(input.message) ?? input.sort ?? input.previousSearch?.sort ?? toolArguments.sort;
  try { if (!reorder) toolArguments.radiusKm = resolveMessageRadius(input.message, toolArguments.radiusKm); }
  catch(error) {
    logError(error,{intent:'SEARCH_PRODUCT',query:toolArguments.query,stage:'tool.radius'});
    const usage = addUsage(toolDecisionResponse);
    return { message: `Indicá un radio mayor que 0 y hasta ${offerQualityConfig.maxRadiusKm} km, o pedime buscar sin límite de distancia.`, toolUsed: false, ...(usage ? { usage } : {}) };
  }

  input.onEvent?.({
    type: "tool_selected",
    tool: "findProductOffers",
    arguments: toolArguments,
  });
  input.onEvent?.({ type: "tool_started", tool: "findProductOffers" });
  stage='findProductOffers';query=toolArguments.query;
  const toolResult = await agent.executeTool(toolArguments);
  input.onSearchResult?.(toolResult);
  input.onEvent?.({
    type: "tool_completed",
    tool: "findProductOffers",
    totalResults: toolResult?.totalResults ?? 0,
  });
  stage='response.format';
  if (!toolResult) {
    const usage = addUsage(toolDecisionResponse);
    return {
      message: "No encontramos un producto compatible con tu búsqueda. Probá reformulando el nombre.",
      toolUsed: true,
      toolArguments,
      ...(usage ? { usage } : {}),
    };
  }

  if (toolResult.totalResults === 0) {
    const productName = [toolResult.product.name, toolResult.product.size].filter(Boolean).join(" ");
    const radiusText = toolResult.radiusKm === null ? "" : ` dentro de ${toolResult.radiusKm} km`;
    const expansion = toolResult.canExpandRadius
      ? toolResult.suggestedRadiusKm === null ? " ¿Querés ampliar la búsqueda sin límite de distancia?" : ` ¿Querés ampliar la búsqueda a ${toolResult.suggestedRadiusKm} km?`
      : " No hay ofertas elegibles en los datos disponibles para ampliar la búsqueda.";
    const usage = addUsage(toolDecisionResponse);
    return { message: [`No encontré ofertas de ${productName}${radiusText}.${expansion}`,...(toolResult.notices??[])].join("\n"), toolUsed: true, toolArguments, ...(usage ? { usage } : {}) };
  }

  input.onEvent?.({ type: "response_generation_started" });
  // El criterio explícito manda incluso si el modelo o un adaptador devolvió otro orden.
  if (toolArguments.sort === "price") toolResult.results.sort((a,b)=>a.price-b.price || a.distanceKm-b.distanceKm);
  const message = input.compact && !wantsDetails(input.message) ? formatCompactOffers(toolResult, toolArguments.sort) : formatOffers(toolResult, toolArguments.sort);
  const usage = addUsage(toolDecisionResponse);
  input.onEvent?.({
    type: "response_generated",
    ...(usage ? { usage } : {}),
  });
  return {
    message,
    toolUsed: true,
    toolArguments,
    ...(usage ? { usage } : {}),
  };
  } catch(error) {
    logError(error,{intent:'SEARCH_PRODUCT',query,stage,...(stage.startsWith('openai.')?{provider:'OPENAI'}:{})});
    throw error;
  }
};
