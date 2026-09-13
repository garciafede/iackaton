import "dotenv/config";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import {join,resolve} from "node:path";
import {prisma} from "../src/lib/prisma.js";
import {priceConfig} from "../src/prices/config.js";
import {copyZipEntry,listZipEntries,openZipEntry} from "../src/prices/zip.js";
import {readPipeRecords} from "../src/prices/csv.js";
import {parseSepaStore} from "../src/prices/providers/sepa.provider.js";

// Solo directorio de sucursales; no importa precios con fechas antiguas.
const args=process.argv.slice(2),file=args.find(a=>a.startsWith("--file="))?.slice(7);
const key=args.find(a=>a.startsWith("--chain="))?.slice(8)??"changomas";
const apply=args.includes("--apply");
if(!file||args.some(a=>!/^--(?:file=.+|chain=.+|apply|dry-run)$/.test(a))||(apply&&args.includes("--dry-run")))throw new Error("Usar --file=ZIP --chain=changomas [--dry-run | --apply]");
const chain=priceConfig.chains.find(c=>c.key===key);
if(!chain)throw new Error("Cadena no configurada");
const cacheRoot=resolve(priceConfig.cacheDirectory);
await mkdir(cacheRoot,{recursive:true});
const directory=await mkdtemp(join(cacheRoot,"stores-"));
try {
  const entry=(await listZipEntries(file)).find(e=>e.name.includes(`comercio-sepa-${chain.commerceId}_`)&&e.name.endsWith(".zip"));
  if(!entry)throw new Error("No hay paquete para la cadena");
  const inner=join(directory,"chain.zip");await copyZipEntry(file,entry,inner);
  const csv=(await listZipEntries(inner)).find(e=>e.name==="sucursales.csv");
  if(!csv)throw new Error("No hay sucursales.csv");
  const stores:NonNullable<ReturnType<typeof parseSepaStore>>[]=[];
  for await(const row of readPipeRecords(await openZipEntry(inner,csv),["id_comercio","id_bandera","id_sucursal","sucursales_nombre","sucursales_calle","sucursales_provincia","sucursales_latitud","sucursales_longitud"])) {
    if(row.id_comercio!==chain.commerceId||!chain.flags.includes(row.id_bandera!)||!priceConfig.provinces.includes(row.sucursales_provincia!))continue;
    const store=parseSepaStore(row,chain.name);if(store)stores.push(store);
  }
  const selected=priceConfig.provinces.flatMap(province=>stores.filter(s=>s.province===province).sort((a,b)=>a.externalKey.localeCompare(b.externalKey,undefined,{numeric:true})).slice(0,priceConfig.maxStoresPerChainProvince));
  let created=0;
  if(apply)await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731204)::text AS locked`;
    for(const s of selected) {
      const identity={chain:s.chain,name:s.name,address:s.address};
      const matches=await tx.store.findMany({where:identity,take:2,select:{id:true}});
      if(matches.length>1)throw new Error("Sucursal ambigua");
      if(matches.length)continue;
      await tx.store.create({data:{...identity,latitude:s.latitude,longitude:s.longitude,source:"REAL:SEPA:STORES"}});created++;
    }
  },{maxWait:3000,timeout:30000});
  console.log(JSON.stringify({chain:chain.name,dryRun:!apply,selected:selected.length,created,priceOffersWritten:0,stores:selected.map(s=>({name:s.name,address:s.address,latitude:s.latitude,longitude:s.longitude,source:"REAL:SEPA:STORES"}))},null,2));
} finally {
  if(resolve(directory).startsWith(cacheRoot+"\\")||resolve(directory).startsWith(cacheRoot+"/"))await rm(directory,{recursive:true,force:true});
  await prisma.$disconnect();
}
