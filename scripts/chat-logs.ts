import {prisma} from '../src/lib/prisma.js';
import {redactConversationText} from '../src/whatsapp/conversation-log.js';

export function parseLogArgs(args:string[]){
  let limit=100,sessionId:string|undefined;
  for(let i=0;i<args.length;i++){
    const [key,inline]=args[i]!.split('=');
    if(key==='--limit'){limit=Number(inline??args[++i]);if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('--limit debe estar entre 1 y 1000');}
    else if(key==='--session'){sessionId=inline??args[++i];if(!sessionId||!/^[\w-]{1,100}$/.test(sessionId))throw new Error('--session inválida');}
    else throw new Error('Usá --limit 100 y opcionalmente --session ID');
  }
  return {limit,sessionId};
}
export async function main(args:string[]){
  const {limit,sessionId}=parseLogArgs(args);
  const rows=await prisma.conversationLog.findMany({where:sessionId?{sessionId}:{},orderBy:[{createdAt:'desc'},{id:'desc'}],take:limit});
  for(const row of rows.reverse()){
    console.log(`[${row.createdAt.toISOString()}] sesión ${row.sessionId}`);
    console.log(`${row.direction==='IN'?'usuario':'bot'} > ${row.text?redactConversationText(row.text):row.messageType==='location'?'[GPS recibido; coordenadas guardadas]':`[${row.messageType}]`}`);
    console.log(`intent > ${row.detectedIntent}; criterio ${row.sortCriterion}${row.error?`; error ${redactConversationText(row.error)}`:''}`);
  }
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/chat-logs.ts')){
  main(process.argv.slice(2)).catch(error=>{console.error(error instanceof Error&&error.message.startsWith('--')?error.message:'No pude consultar el historial. Revisá conexión y migraciones.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
}
