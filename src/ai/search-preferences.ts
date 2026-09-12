import { offerQualityConfig, resolveRadiusKm } from "../services/offer-quality.js";

// Respaldo determinístico de los pedidos explícitos de radio. El modelo puede
// interpretar otras frases, pero no desactivar por omisión el radio de seguridad.
export function resolveMessageRadius(message: string, modelRadius?: number | null): number | null {
  const text = message.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const distance = text.match(/(?:menos de|dentro de|hasta|radio(?: de)?|a)\s*(\d+(?:[.,]\d+)?)\s*(?:km|kilometros?)\b/);
  if (distance) return resolveRadiusKm(Number(distance[1]!.replace(",", ".")));
  if (/\b(?:no (?:me )?importa (?:la )?distancia|sin importar (?:la )?distancia|sin limite de distancia|cualquier distancia)\b/.test(text) || /^\s*sin limite\s*[.!]?\s*$/.test(text)) return null;
  if (/\b(?:cerca(?: mio| de mi)?|cercano|cercana)\b/.test(text)) return offerQualityConfig.defaultRadiusKm;
  return resolveRadiusKm(modelRadius === null ? undefined : modelRadius);
}
