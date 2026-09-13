import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {prisma} from "../lib/prisma.js";
import {normalizeCatalogText} from "../catalog/matching.js";
import {validEan} from "./matching.js";
import {retailers, type Branch, type LiveRequest, type ProviderData, type Retailer} from "./types.js";

export type LiveRepository = {
  read(cacheKey:string,after:Date):Promise<unknown>;
  save(cacheKey:string,data:ProviderData):Promise<void>;
  branches():Promise<Branch[]>;
};
export function liveCacheKey(retailer:Retailer,input:LiveRequest):string {
  // Hash: no se guardan coordenadas personales ni mensajes como clave legible.
  // sort se excluye; ubicación/radio/identidad se incluyen para no reutilizar otro contexto.
  return createHash("sha256").update(JSON.stringify(["v1",retailer,normalizeCatalogText(input.query),input.latitude,input.longitude,input.radiusKm,input.preferredEans??[]])).digest("hex");
}
export const neonLiveRepository: LiveRepository = {
  async read(cacheKey,after) {
    return (await prisma.liveObservation.findFirst({where:{cacheKey,lastCheckedAt:{gte:after,lte:new Date()}},orderBy:{lastCheckedAt:"desc"},select:{payload:true}}))?.payload ?? null;
  },
  async save(cacheKey,data) {
    await prisma.$transaction(async tx=>{
      for(const c of data.candidates) {
        if (!validEan(c.product.ean) || !c.product.size) continue;
        // No se pisa la identidad ni aliases del catálogo validado/SEPA existente.
        // Update no vacío habilita el upsert atómico de PostgreSQL: tres cadenas
        // pueden descubrir simultáneamente el mismo EAN sin carreras de INSERT.
        await tx.product.upsert({where:{ean:c.product.ean},update:{ean:c.product.ean},create:{ean:c.product.ean,brand:c.product.brand,name:c.product.name,size:c.product.size,liveOnly:true}});
      }
      await tx.liveObservation.create({data:{cacheKey,retailer:data.retailer,lastCheckedAt:new Date(data.checkedAt),payload:data as unknown as Prisma.InputJsonValue}});
    },{maxWait:1000,timeout:3000});
  },
  async branches() {
    const rows=await prisma.store.findMany({where:{chain:{in:Object.values(retailers)},AND:[{OR:[{source:{startsWith:"REAL:"}},{offers:{some:{source:{startsWith:"REAL:"}}}}]},{offers:{none:{source:"DEMO"}}}]},
      select:{id:true,chain:true,name:true,address:true,latitude:true,longitude:true,source:true}});
    return rows.map(r=>({...r,latitude:Number(r.latitude),longitude:Number(r.longitude),source:r.source??"REAL:EXISTING_OFFERS"}));
  },
};
