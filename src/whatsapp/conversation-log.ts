import {prisma} from '../lib/prisma.js';
import type {ConversationState} from './session.js';
import type {IntentName} from './intents.js';

export type ConversationEvent={sessionId:string;direction:'IN'|'OUT';messageType:string;text?:string;location?:{latitude:number;longitude:number};detectedIntent:IntentName;sortCriterion:string;state:ConversationState;latencyMs?:number;error?:string};
export function redactConversationText(text:string):string{
  let clean=text;
  for(const key of ['WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','DATABASE_URL','DATABASE_URL_UNPOOLED','OPENAI_API_KEY','WHATSAPP_VERIFY_TOKEN']){
    const secret=process.env[key];if(secret&&secret.length>5)clean=clean.split(secret).join('[REDACTADO]');
  }
  return clean.replace(/(?:postgres(?:ql)?:\/\/|sk-(?:proj-)?)[^\s"']+/gi,'[REDACTADO]')
    .replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTADO]')
    .replace(/((?:ACCESS_TOKEN|APP_SECRET|API_KEY|DATABASE_URL|VERIFY_TOKEN)\s*[=:]\s*)[^\s,;]+/gi,'$1[REDACTADO]')
    .replace(/\+?\b\d{10,15}\b/g,'[NÚMERO REDACTADO]').slice(0,12000);
}
export function conversationRecord(event:ConversationEvent){
  return {sessionId:event.sessionId,direction:event.direction,messageType:event.messageType,detectedIntent:event.detectedIntent,sortCriterion:event.sortCriterion,
    ...(event.messageType==='text'&&event.text?{text:redactConversationText(event.text)}:{}),
    ...(event.messageType==='location'&&event.location?{location:{latitude:event.location.latitude,longitude:event.location.longitude}}:{}),
    stateSummary:{hasLocation:!!event.state.location,lastProduct:event.state.lastProduct?redactConversationText(event.state.lastProduct.query):null,
      currentCart:event.state.currentCart.map(i=>({query:redactConversationText(i.query),quantity:i.quantity})),
      productResults:event.state.lastProductResults?.length??0,cartComplete:event.state.cartResults?.winner!==null&&!!event.state.cartResults,
      activeSubject:event.state.activeSubject??null,pendingAction:event.state.pendingAction?.type??null},
    ...(event.latencyMs!==undefined?{latencyMs:Math.max(0,Math.round(event.latencyMs))}:{}),...(event.error?{error:redactConversationText(event.error)}:{})};
}
export async function logConversation(event:ConversationEvent){
  const record=conversationRecord(event);
  console.info(JSON.stringify({event:'conversation.turn',sessionId:record.sessionId,direction:record.direction,messageType:record.messageType,intent:record.detectedIntent,sort:record.sortCriterion,
    hasLocation:record.stateSummary.hasLocation,cartItems:record.stateSummary.currentCart.length,latencyMs:record.latencyMs,error:record.error}));
  await prisma.conversationLog.create({data:record,select:{id:true}});
}
