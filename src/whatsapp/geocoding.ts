import {normalizeSearchText} from "../utils/normalize-text.js";
import {redactLogText,safeErrorLog} from '../lib/safe-logging.js';
import {randomUUID} from 'node:crypto';
export type GeocodeResult={status:"OK";latitude:number;longitude:number;label:string}|{status:"AMBIGUOUS"|"NOT_FOUND"|"UNAVAILABLE"};
type GeorefReason='OK'|'AMBIGUOUS'|'NOT_FOUND'|'NO_COORDS'|'HTTP_ERROR';
type GeorefDiagnostic=(reason:GeorefReason,detail:string)=>void;
// Conservar calle/localidad para diagnosticar sin volcar altura, CP, GPS ni secretos.
const safeAddressLog=(value:unknown)=>typeof value==='string'?redactLogText(value).replace(/\d+/g,'[NÚMERO]').slice(0,240):null;
export type PendingLocation={originalInput:string;street:string;number:string;locality?:string;city?:string;municipality?:string;province?:string;postalCode?:string};
const clean=(value:string)=>value.trim().replace(/\s+/g,' ');
const isCaba=(value:string)=>/^(caba|c a b a|capital federal|ciudad (?:autonoma )?de buenos aires)$/.test(normalizeSearchText(value).replace(/\./g,'').trim());
const provinceName=(value:string)=>isCaba(value)?'Ciudad Autónoma de Buenos Aires':/^(bs\.?\s*as\.?|pcia\.? de buenos aires)$/i.test(value)?'Buenos Aires':value.replace(/^provincia\s+(?:de\s+)?/i,'');
export function parseAddress(input:string):PendingLocation {
  const postal=input.match(/\b(?:CP|C\.P\.|c[oó]digo postal)\s*:?\s*([A-Z]?\d{4}[A-Z]{0,3})\b/i)?.[1];
  const value=clean(input.replace(/\b(?:CP|C\.P\.|c[oó]digo postal)\s*:?\s*[A-Z]?\d{4}[A-Z]{0,3}\b/i,'').replace(/[,;\s]+$/,''));
  const parts=value.split(/[,;]/).map(clean).filter(Boolean);
  const head=parts.shift()??'';
  const match=head.match(/^(.+)\s+(?:n(?:ro|[°º])\.?\s*)?(\d{1,5})(?:\s+(.+))?$/iu);
  const street=clean(match?.[1]??head).replace(/\s+n(?:ro|[°º])\.?$/i,'').replace(/^av\.\s*/i,'Avenida ').replace(/^avda\.?\s+/i,'Avenida ');
  const context=[...(match?.[3]?[clean(match[3])]:[]),...parts];
  const address:PendingLocation={originalInput:input,street,number:match?.[2]??'',...(postal?{postalCode:postal.toUpperCase()}:{})};
  for(const part of context){
    if(isCaba(part)||/^provincia\b/i.test(part)){address.province=provinceName(part);continue;}
    if(/^municipio\s+/i.test(part)){address.municipality=part.replace(/^municipio\s+(?:de\s+)?/i,'');continue;}
    if(!address.locality){address.locality=part.replace(/^(?:localidad|ciudad)\s+(?:de\s+)?/i,'');address.city=address.locality;}
    else if(!address.province)address.province=provinceName(part);
  }
  return address;
}
export function formatAddress(address:PendingLocation):string {
  return [[address.street,address.number].filter(Boolean).join(' '),address.locality,address.municipality?`municipio de ${address.municipality}`:undefined,address.province,address.postalCode?`CP ${address.postalCode}`:undefined].filter(Boolean).join(', ');
}
export function completeAddress(prior:PendingLocation,input:string,question?:'city'|'province'):PendingLocation {
  const value=clean(input.replace(/^(?:en|es en|la localidad es|la ciudad es|la provincia es)\s+/i,''));
  const extra=parseAddress(`${prior.street} ${prior.number}, ${question==='province'?'provincia de ':''}${value}`);
  return {...prior,...(extra.locality?{locality:extra.locality,city:extra.locality}:{}),...(extra.province?{province:extra.province}:{}),...(extra.municipality?{municipality:extra.municipality}:{}),...(extra.postalCode?{postalCode:extra.postalCode}:{})};
}
export const changeLocation=(text:string)=>/^(?:(?:(?:quiero|puedo) )?(?:cambiar|actualizar) (?:de |mi |la )?ubicacion|(?:me voy a otra zona\s*)?(?:quiero )?actualizar (?:mi |la )?ubicacion|quiero probar en otra ubicacion|no me actualizaste (?:la ultima |mi )?(?:ubicacion|direccion)(?: que te pase)?)$/.test(normalizeSearchText(text).replace(/[¿¡.,!?]/g,"").trim());
export function writtenAddress(text:string):string|undefined {
  const explicit=text.match(/^(?:mi ubicaci[oó]n es|cambiar (?:mi |la )?ubicaci[oó]n a|mi direcci[oó]n es|(?:ahora )?estoy en)\s+(.+)$/i);
  if(explicit&&!/^(?:otra|nueva)\s+(?:direccion|ubicacion|zona)$/.test(normalizeSearchText(explicit[1]!)))return explicit[1]!.trim();
  const normalized=normalizeSearchText(text);
  if(/\b(buscame|quiero|comprar|arroz|coca|detergente|oreo|playadito|magistral|litros?|ml|kg|gramos?|precio)\b/.test(normalized))return undefined;
  if(/[\r\n]/.test(text)||/\b(unidades?|de \d+ a \d+)\b/.test(normalized))return undefined;
  const address=parseAddress(text);
  return address.number&&/\p{L}/u.test(address.street)&&!/\b\d+(?:[.,]\d+)?\s*(?:lts?|litros?|l|ml|cc|kg|kilos?|g|grs?|gramos?)\b/i.test(text)?text.trim():undefined;
}
export function addressParts(address:string){
  const parsed=parseAddress(address);
  return {street:[parsed.street,parsed.number].filter(Boolean).join(' '),locality:parsed.locality??'',province:parsed.province??''};
}
export function parseGeoref(raw:unknown,number:string,street?:string,diagnose?:GeorefDiagnostic):GeocodeResult {
  const finish=(result:GeocodeResult,reason:GeorefReason,detail:string)=>{diagnose?.(reason,detail);return result;};
  const body=raw as {total?:number;direcciones?:Array<{calle?:{nombre?:string};altura?:{valor?:number};ubicacion?:{lat?:number;lon?:number};nomenclatura?:string}>};
  if(!body||!Array.isArray(body.direcciones))return finish({status:"UNAVAILABLE"},'HTTP_ERROR','INVALID_RESPONSE');
  if((body.total??body.direcciones.length)>1||body.direcciones.length>1)return finish({status:"AMBIGUOUS"},'AMBIGUOUS','MULTIPLE_CANDIDATES');
  const result=body.direcciones[0],lat=result?.ubicacion?.lat,lon=result?.ubicacion?.lon;
  const streetKey=(s:string)=>normalizeSearchText(s).replace(/^(?:av\.?|avda\.?|avenida|calle)\s+/,'');
  if(street&&result?.calle?.nombre&&streetKey(street)!==streetKey(result.calle.nombre))return finish({status:'NOT_FOUND'},'NOT_FOUND','STREET_MISMATCH');
  if(!result)return finish({status:'NOT_FOUND'},'NOT_FOUND','NO_CANDIDATES');
  if(String(result.altura?.valor)!==number)return finish({status:'NOT_FOUND'},'NOT_FOUND','HEIGHT_MISMATCH');
  if(typeof lat!=="number"||typeof lon!=="number"||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||(lat===0&&lon===0))return finish({status:"NOT_FOUND"},'NO_COORDS','MISSING_OR_INVALID_COORDINATES');
  return finish({status:"OK",latitude:lat,longitude:lon,label:result.nomenclatura??"Dirección encontrada"},'OK','UNIQUE_VALID_CANDIDATE');
}
export async function geocodeAddress(address:string,fetcher:typeof fetch=fetch):Promise<GeocodeResult>{
  const parsed=parseAddress(address),{number,province}=parsed,street=[parsed.street,number].join(' '),city=parsed.locality;
  const url=new URL("https://apis.datos.gob.ar/georef/api/v2.0/direcciones");
  const attemptId=randomUUID(),started=Date.now();
  let httpStatus:number|null=null,requestSent=false,raw:unknown;
  const diagnose=(reason:GeorefReason,detail:string,error?:unknown)=>{
    const body=raw as {cantidad?:unknown;total?:unknown;direcciones?:unknown}|null;
    const candidates=Array.isArray(body?.direcciones)?body.direcciones:null;
    const count=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0?value:null;
    const err=error===undefined?undefined:safeErrorLog(error);
    // Una línea JSON por intento; no registrar querystring, headers ni respuesta completa.
    console.info(JSON.stringify({level:reason==='HTTP_ERROR'?50:30,event:'georef.attempt',attemptId,time:new Date().toISOString(),
      intent:'SET_LOCATION',provider:'GEOREF',stage:'georef.resolve',addressSent:safeAddressLog(street),
      locality:safeAddressLog(city),province:safeAddressLog(province),url:url.origin+url.pathname,requestSent,httpStatus,
      cantidad:count(body?.cantidad),total:count(body?.total),candidateCount:candidates?.length??null,
      nomenclaturas:candidates?.slice(0,5).map(candidate=>safeAddressLog(candidate?.nomenclatura))??[],
      nomenclaturasOmitted:Math.max(0,(candidates?.length??0)-5),reason,detail,durationMs:Date.now()-started,
      ...(err?{err:JSON.parse(JSON.stringify(err,(_key,value)=>typeof value==='string'?safeAddressLog(value):value))}:{}),
    }));
  };
  if(!number||address.length>200){diagnose('NOT_FOUND',!number?'MISSING_STREET_NUMBER':'ADDRESS_TOO_LONG');return {status:"NOT_FOUND"};}
  url.search=new URLSearchParams({direccion:street!,max:"5"}).toString();
  if(city)url.searchParams.set("localidad_censal",city);
  if(province)url.searchParams.set("provincia",province);
  // /direcciones acepta localidad_censal y provincia; municipio NO es un filtro de este endpoint.
  // https://www.argentina.gob.ar/node/473623
  try{
    requestSent=true;
    const response=await fetcher(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(8000)});
    httpStatus=response.status;
    if(!response.ok){diagnose('HTTP_ERROR','NON_SUCCESS_STATUS');return {status:"UNAVAILABLE"};}
    raw=await response.json();
    return parseGeoref(raw,number,parsed.street,diagnose);
  }catch(error){diagnose('HTTP_ERROR',httpStatus===null?'REQUEST_FAILED':'INVALID_RESPONSE',error);return {status:"UNAVAILABLE"};}
}
