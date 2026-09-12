import type { Readable } from "node:stream";

// Parser incremental del CSV pipe observado; admite comillas escapadas y saltos
// dentro de un campo. Mantiene en memoria solo una fila, no el catálogo completo.
export async function* readPipeRows(stream: Readable): AsyncGenerator<string[]> {
  const decoder = new TextDecoder("utf-8");
  let field = "", row: string[] = [], quoted = false, afterQuote = false;
  const consume = function* (text: string): Generator<string[]> {
    for (const char of text) {
      if (quoted) {
        if (char === '"') { quoted = false; afterQuote = true; }
        else field += char;
      } else if (afterQuote && char === '"') {
        field += '"'; quoted = true; afterQuote = false;
      } else {
        afterQuote = false;
        if (char === '"' && field.length === 0) quoted = true;
        else if (char === "|") { row.push(field); field = ""; }
        else if (char === "\n" || char === "\r") {
          if (field.length || row.length) { row.push(field); yield row; row = []; field = ""; }
        } else field += char;
      }
      if (field.length > 1024 * 1024 || row.length > 128) throw new Error("SEPA: fila CSV fuera de límites.");
    }
  };
  for await (const chunk of stream) yield* consume(decoder.decode(typeof chunk === "string" ? Buffer.from(chunk) : chunk as Buffer, { stream: true }));
  yield* consume(decoder.decode());
  if (quoted) throw new Error("SEPA: campo CSV sin cerrar.");
  if (field.length || row.length) yield [...row, field];
}

export async function* readPipeRecords(stream: Readable, required: string[]): AsyncGenerator<Record<string, string>> {
  let headers: string[] | undefined;
  for await (const row of readPipeRows(stream)) {
    if (!headers) {
      headers = row.map((value) => value.replace(/^\uFEFF/, "").trim());
      if (required.some((name) => !headers!.includes(name))) throw new Error("SEPA: cambió el esquema CSV; faltan columnas requeridas.");
    } else if (row.length === headers.length && /^\d+$/.test(row[0] ?? "")) {
      yield Object.fromEntries(headers.map((header, index) => [header, (row[index] ?? "").trim()]));
    }
    // Los archivos observados contienen líneas de pie "Última actualización".
  }
}
