import {normalizeSearchText} from "../utils/normalize-text.js";
export type GeocodeResult={status:"OK";latitude:number;longitude:number;label:string}|{status:"AMBIGUOUS"|"NOT_FOUND"|"UNAVAILABLE"};
export const changeLocation=(text:string)=>/^(?:(?:(?:quiero|puedo) )?(?:cambiar|actualizar) (?:de |mi |la )?ubicacion|(?:me voy a otra zona\s*)?(?:quiero )?actualizar (?:mi |la )?ubicacion|quiero probar en otra ubicacion|no me actualizaste (?:la ultima |mi )?(?:ubicacion|direccion)(?: que te pase)?)$/.test(normalizeSearchText(text).replace(/[¿¡.,!?]/g,"").trim());
export function writtenAddress(text:string):string|undefined {
  const explicit=text.match(/^(?:mi ubicaci[oó]n es|cambiar (?:mi |la )?ubicaci[oó]n a|mi direcci[oó]n es)\s+(.+)$/i);
  if(explicit)return explicit[1]!.trim();
  const normalized=normalizeSearchText(text);
  if(/\b(buscame|quiero|comprar|arroz|coca|detergente|oreo|playadito|magistral|litros?|ml|kg|gramos?|precio)\b/.test(normalized))return undefined;
  return /^[\p{L} .'-]+\s+\d{1,5}(?:\s*,\s*[\p{L}\d ,.'-]+)?$/u.test(text.trim())?text.trim():undefined;
}
export function addressParts(address:string){
  const [street="",locality="",province=""]=address.split(",").map(part=>part.trim()).filter(part=>!/^CP\b/i.test(part));
  return {street,locality,province};
}
export function parseGeoref(raw:unknown,number:string):GeocodeResult {
  const body=raw as {total?:number;direcciones?:Array<{altura?:{valor?:number};ubicacion?:{lat?:number;lon?:number};nomenclatura?:string}>};
  if(!body||!Array.isArray(body.direcciones))return {status:"UNAVAILABLE"};
  if((body.total??body.direcciones.length)>1||body.direcciones.length>1)return {status:"AMBIGUOUS"};
  const result=body.direcciones[0],lat=result?.ubicacion?.lat,lon=result?.ubicacion?.lon;
  if(!result||String(result.altura?.valor)!==number||typeof lat!=="number"||typeof lon!=="number"||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||(lat===0&&lon===0))return {status:"NOT_FOUND"};
  return {status:"OK",latitude:lat,longitude:lon,label:result.nomenclatura??"Dirección encontrada"};
}
export async function geocodeAddress(address:string,fetcher:typeof fetch=fetch):Promise<GeocodeResult>{
  const {street,locality:city,province}=addressParts(address);
  const number=street?.match(/\b(\d{1,5})\s*$/)?.[1];
  if(!number||address.length>200)return {status:"NOT_FOUND"};
  const url=new URL("https://apis.datos.gob.ar/georef/api/direcciones");
  url.search=new URLSearchParams({direccion:street!,max:"5"}).toString();
  if(city)url.searchParams.set("localidad_censal",city);
  if(province)url.searchParams.set("provincia",province);
  try{const response=await fetcher(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(8000)});if(!response.ok)return {status:"UNAVAILABLE"};return parseGeoref(await response.json(),number);}catch{return {status:"UNAVAILABLE"};}
}
