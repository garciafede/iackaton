export function safeRequestLog(request: { method?: string; url?: string }) {
  return { method: request.method ?? "UNKNOWN", url: request.url?.split("?")[0] ?? "/" };
}

export function redactLogText(value:string):string {
  let text=value;
  for(const [key,secret] of Object.entries(process.env)) {
    if(/TOKEN|SECRET|API_KEY|DATABASE_URL|DIRECT_URL|PASSWORD/i.test(key)&&secret)text=text.split(secret).join('[REDACTADO]');
  }
  return text.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi,'[DATABASE_URL REDACTADA]')
    .replace(/Bearer\s+[^\s"',;]+/gi,'Bearer [REDACTADO]')
    .replace(/\bsk-[\w-]+/g,'[REDACTADO]')
    .replace(/((?:[\w-]*(?:token|secret|api[_-]?key|password)|authorization)\s*[=:]\s*)[^\s,;]+/gi,'$1[REDACTADO]')
    .replace(/https?:\/\/[^\s"'<>]+/gi,url=>url.replace(/\/\/[^/@\s]+:[^/@\s]+@/,'//[REDACTADO]@').split('?')[0]!)
    .replace(/\{[\s\S]*\}/g,'[payload omitido]')
    .replace(/\+?\b\d{10,15}\b/g,'[TELÉFONO REDACTADO]')
    .replace(/-?\b\d{1,3}\.\d{4,}\b/g,'[COORDENADA REDACTADA]').slice(0,8000);
}

type SafeError={type:string;name:string;message:string;stack:string;cause?:SafeError;status?:number;code?:string};
// Selección explícita: nunca serializar headers, request, body ni propiedades arbitrarias del SDK.
export function safeErrorLog(error: unknown,depth=0):SafeError {
  const candidate = error as { name?: unknown; message?:unknown; stack?:unknown; cause?:unknown; status?: unknown; statusCode?: unknown; code?: unknown } | null;
  const name = typeof candidate?.name === 'string' ? redactLogText(candidate.name) : 'Error';
  const message=redactLogText(typeof candidate?.message==='string'?candidate.message:typeof error==='string'?error:'Error sin mensaje');
  const stack=typeof candidate?.stack==='string'?redactLogText(candidate.stack):'';
  const status = candidate?.status ?? candidate?.statusCode;
  const code = typeof candidate?.code === "string" && /^(P\d{4}|EADDRINUSE|ECONNREFUSED|ETIMEDOUT)$/.test(candidate.code) ? candidate.code : undefined;
  return { type:name,name,message,stack,...(candidate?.cause!==undefined&&depth<3?{cause:safeErrorLog(candidate.cause,depth+1)}:{}), ...(typeof status === "number" ? { status } : {}), ...(code ? { code } : {}) };
}

export function logError(error:unknown,context:{intent:string;stage:string;query?:string|undefined;provider?:string}) {
  // Una línea JSON en stdout: Railway conserva el detalle sin fragmentarlo en líneas [err].
  console.info(JSON.stringify({level:50,event:'operation.error',err:safeErrorLog(error),intent:context.intent,stage:context.stage,
    ...(context.query?{query:redactLogText(context.query).slice(0,200)}:{}),...(context.provider?{provider:context.provider}:{})}));
}
