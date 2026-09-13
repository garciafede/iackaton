import type OpenAI from "openai";

import {
  type SearchSort,
} from "../services/product-search.service.js";
import { offerQualityConfig } from "../services/offer-quality.js";
import {searchWithLiveOffers} from "../live/orchestrator.js";

export type FindProductOffersArguments = {
  query: string;
  latitude: number;
  longitude: number;
  sort: SearchSort;
  radiusKm?: number | null;
};

export const productAgentTools: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "findProductOffers",
    description:
      "Busca productos y ofertas con distancia y fuentes verificables. Distingue precio online de cadena, precio de sucursal y retiro; la disponibilidad física puede no estar confirmada. Usa el backend como fuente de verdad.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Nombre coloquial del producto pedido por el usuario.",
        },
        latitude: {
          type: "number",
          description: "Latitud exacta proporcionada por la aplicación.",
        },
        longitude: {
          type: "number",
          description: "Longitud exacta proporcionada por la aplicación.",
        },
        sort: {
          type: "string",
          enum: ["distance", "price", "recommended"],
          description: "price para el más barato; distance para el más cercano; recommended para equilibrar precio, distancia, frescura y disponibilidad.",
        },
        radiusKm: {
          type: ["number", "null"],
          description: `Radio en kilómetros: por defecto ${offerQualityConfig.defaultRadiusKm}; usar el radio explícito pedido. null solo si pide ignorar la distancia. No ampliar automáticamente si no hay ofertas.`,
        },
      },
      required: ["query", "latitude", "longitude", "sort", "radiusKm"],
      additionalProperties: false,
    },
  },
];

export const executeFindProductOffers = (args: FindProductOffersArguments) => {
  return searchWithLiveOffers(args.query, args.latitude, args.longitude, args.sort, args.radiusKm);
};
