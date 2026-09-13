import "dotenv/config";
import {prisma} from "../src/lib/prisma.js";
import {ProductSearchOrchestrator} from "../src/live/orchestrator.js";
import {defaultLiveProviders} from "../src/live/providers.js";
import {neonLiveRepository} from "../src/live/repository.js";
import {formatOffers} from "../src/ai/format-offers.js";
import type {ProviderReport} from "../src/live/types.js";

const args=process.argv.slice(2);
if(args.some(a=>!/^--(?:query=.+|lat=.+|lng=.+|radius=.+)$/.test(a)))throw new Error("Opciones: --query=producto --lat=n --lng=n --radius=km");
const value=(name:string)=>args.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
try {
  const query=value("query")??"detergente Magistral ultra limon 500 ml";
  const branches=await neonLiveRepository.branches();
  const reference=branches.find(b=>b.chain==="Carrefour"&&/Catamarca.*1116/i.test(b.address));
  if((value("lat")===undefined)!==(value("lng")===undefined))throw new Error("Proveer lat y lng juntos");
  const latitude=value("lat")!==undefined?Number(value("lat")):reference?.latitude;
  const longitude=value("lng")!==undefined?Number(value("lng")):reference?.longitude;
  if(latitude===undefined||longitude===undefined)throw new Error("Falta referencia pública; indicar --lat y --lng");
  const reports:ProviderReport[]=[];
  const orchestrator=new ProductSearchOrchestrator({providers:defaultLiveProviders(),repository:neonLiveRepository,fallback:async()=>null,now:()=>new Date()});
  const result=await orchestrator.search(query,latitude,longitude,"price",Number(value("radius")??25),{enabled:true,cache:false,persist:false,onReport:r=>reports.push(r)});
  console.log(JSON.stringify({query,readOnly:true,reference:value("lat")===undefined?"Sucursal pública Carrefour Catamarca 1116":"Coordenadas provistas (no se imprimen)",
    providers:reports,offers:result?.results.map(r=>({chain:r.store.chain,ean:r.product?.ean,price:r.price,mapping:r.live?.storeMappingMethod,confidence:r.live?.availabilityConfidence,priceScope:r.live?.priceScope,store:r.store.name,distanceKm:Number(r.distanceKm.toFixed(2))}))??[],notices:result?.notices??[]},null,2));
  if(result?.results.length)console.log("\nEjemplo determinístico:\n"+formatOffers(result,"price"));
  // WARN externo no debe romper el cierre de demo.
} finally {await prisma.$disconnect();}
