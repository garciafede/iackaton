import { createReadStream, createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { createInflateRaw } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// ZIP32, métodos stored/deflate, tal como se observaron en SEPA.
// No extrae rutas del ZIP al disco. Cada destino lo decide nuestro importador.
export type ZipEntry = { name: string; method: number; size: number; compressedSize: number; offset: number };

export async function listZipEntries(file: string): Promise<ZipEntry[]> {
  const handle = await open(file, "r");
  try {
    const size = (await handle.stat()).size;
    const tail = Buffer.alloc(Math.min(size, 65557));
    await handle.read(tail, 0, tail.length, size - tail.length);
    let end = tail.length - 22;
    while (end >= 0 && (tail.readUInt32LE(end) !== 0x06054b50 || end + 22 + tail.readUInt16LE(end + 20) !== tail.length)) end -= 1;
    if (end < 0) throw new Error("SEPA: ZIP incompleto o inválido.");
    const count = tail.readUInt16LE(end + 10);
    const length = tail.readUInt32LE(end + 12);
    const offset = tail.readUInt32LE(end + 16);
    if (count === 65535 || offset === 0xffffffff || length > 16 * 1024 * 1024 || tail.readUInt16LE(end + 4) !== 0) {
      throw new Error("SEPA: ZIP64 o multipart no admitido; revisar formato publicado.");
    }
    const directory = Buffer.alloc(length);
    if ((await handle.read(directory, 0, length, offset)).bytesRead !== length) throw new Error("SEPA: directorio ZIP truncado.");
    const entries: ZipEntry[] = [];
    let position = 0;
    for (let n = 0; n < count; n += 1) {
      if (position + 46 > directory.length || directory.readUInt32LE(position) !== 0x02014b50) throw new Error("SEPA: entrada ZIP inválida.");
      const nameLength = directory.readUInt16LE(position + 28);
      const method = directory.readUInt16LE(position + 10);
      if ((directory.readUInt16LE(position + 8) & 1) || ![0, 8].includes(method)) throw new Error("SEPA: compresión/cifrado no admitido.");
      entries.push({
        name: directory.toString("utf8", position + 46, position + 46 + nameLength), method,
        compressedSize: directory.readUInt32LE(position + 20), size: directory.readUInt32LE(position + 24),
        offset: directory.readUInt32LE(position + 42),
      });
      position += 46 + nameLength + directory.readUInt16LE(position + 30) + directory.readUInt16LE(position + 32);
    }
    return entries;
  } finally { await handle.close(); }
}

export async function openZipEntry(file: string, entry: ZipEntry): Promise<Readable> {
  if (entry.size > 2 * 1024 * 1024 * 1024) throw new Error("SEPA: entrada excede el límite de 2 GB.");
  if (!entry.compressedSize) return Readable.from([]);
  const handle = await open(file, "r");
  let start: number;
  try {
    const header = Buffer.alloc(30);
    await handle.read(header, 0, header.length, entry.offset);
    if (header.readUInt32LE(0) !== 0x04034b50) throw new Error("SEPA: cabecera ZIP inválida.");
    start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  } finally { await handle.close(); }
  const raw = createReadStream(file, { start, end: start + entry.compressedSize - 1 });
  if (entry.method === 0) return raw;
  const inflate = createInflateRaw();
  raw.on("error", (error) => inflate.destroy(error));
  inflate.on("close", () => raw.destroy());
  return raw.pipe(inflate);
}

export async function copyZipEntry(file: string, entry: ZipEntry, destination: string) {
  await pipeline(await openZipEntry(file, entry), createWriteStream(destination));
}
