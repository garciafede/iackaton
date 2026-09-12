import type OpenAI from "openai";

import {
  searchProductOffers,
  type SearchSort,
} from "../services/product-search.service.js";
import { offerQualityConfig } from "../services/offer-quality.js";

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
      "Busca ofertas previamente verificadas en PostgreSQL: prioriza fuentes reales, incluye disponibilidad desconocida y calcula distancia. DEMO solo como fallback de desarrollo. No consulta ecommerce en vivo.",
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
  return searchProductOffers(args.query, args.latitude, args.longitude, args.sort, args.radiusKm);
};
