export function safeRequestLog(request: { method?: string; url?: string }) {
  return { method: request.method ?? "UNKNOWN", url: request.url?.split("?")[0] ?? "/" };
}

// Los errores de SDK/Prisma pueden incluir credenciales, cabeceras o parámetros.
// El cliente Meta ya registra status/code/subcode y detalles saneados por separado.
export function safeErrorLog(error: unknown) {
  const candidate = error as { name?: unknown; status?: unknown; statusCode?: unknown; code?: unknown } | null;
  const names = ["Error", "TypeError", "SyntaxError", "APIError", "AuthenticationError", "RateLimitError", "APIConnectionError", "APIConnectionTimeoutError", "PrismaClientKnownRequestError", "PrismaClientInitializationError"];
  const name = typeof candidate?.name === "string" && names.includes(candidate.name) ? candidate.name : "Error";
  const status = candidate?.status ?? candidate?.statusCode;
  const code = typeof candidate?.code === "string" && /^(P\d{4}|EADDRINUSE|ECONNREFUSED|ETIMEDOUT)$/.test(candidate.code) ? candidate.code : undefined;
  return { name, ...(typeof status === "number" ? { status } : {}), ...(code ? { code } : {}) };
}
