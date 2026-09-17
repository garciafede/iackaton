import type { PreviousSearch, ProductChoice } from "../ai/conversation.js";
import type {CartItem,CartResult} from "../ai/cart.js";
import type {SearchSort} from "../services/product-search.service.js";
import type {SearchResult} from "../services/product-search.service.js";
import {randomUUID} from "node:crypto";
import type {Coordinates} from "../utils/distance.js";
import type {PendingLocation} from './geocoding.js';

export type PendingAction =
  | {type:"ALTERNATIVE";choices:ProductChoice[]}
  | {type:"LOCATION";street?:string;locality?:string;province?:string;question?:"city"|"province";resume?:"product"|"cart"}
  | {type:"ADD_ITEM";query:string;quantity:number};
export type ConversationState={
  sessionId:string;location?:Coordinates;lastProduct?:PreviousSearch;lastProductResults?:SearchResult[];
  currentCart:CartItem[];cartResults?:CartResult;sortCriterion:SearchSort;
  pendingAction?:PendingAction;activeSubject?:"product"|"cart";lastLocationSimilar?:boolean;updatedAt:number;
  pendingLocation?:PendingLocation;
};

type LegacySession = {
  pendingMessage?: string;
  previousSearch?: PreviousSearch;
  cart?: CartItem[];
  previousCart?: CartItem[];
  previousResults?: SearchResult[];
  cartResult?: CartResult;
  sort?: SearchSort;
  changingLocation?: boolean;
  awaitingLocation?: boolean;
  pendingStreetAddress?: string;
  pendingLocality?: string;
  pendingProvince?: string;
  pendingAddress?: string;
  pendingAddressQuestion?: "city" | "province";
  latitude?: number;
  longitude?: number;
  updatedAt: number;
};
// Compatibilidad de lectura para integraciones/pruebas anteriores. El router usa solo ConversationState.
export type WhatsAppSession=ConversationState&LegacySession;
export function newConversationState():ConversationState{return {sessionId:randomUUID(),currentCart:[],sortCriterion:"distance",updatedAt:Date.now()};}
function legacyView(state:ConversationState):WhatsAppSession{
  const locationPending=()=>state.pendingAction?.type==="LOCATION"?state.pendingAction:undefined;
  const aliases:Record<string,()=>unknown>={latitude:()=>state.location?.latitude,longitude:()=>state.location?.longitude,previousSearch:()=>state.lastProduct,
    previousResults:()=>state.lastProductResults,cart:()=>state.activeSubject==="product"?undefined:state.currentCart.length?state.currentCart:undefined,
    previousCart:()=>state.activeSubject==="product"?state.currentCart:undefined,cartResult:()=>state.cartResults,sort:()=>state.sortCriterion,
    awaitingLocation:()=>!!locationPending(),changingLocation:()=>locationPending()?true:undefined,
    pendingStreetAddress:()=>locationPending()?.street,pendingLocality:()=>locationPending()?.locality,pendingProvince:()=>locationPending()?.province,
    pendingAddressQuestion:()=>locationPending()?.question,pendingAddress:()=>locationPending()?.street?[locationPending()!.street,locationPending()!.locality,locationPending()!.province].filter(Boolean).join(", "):undefined,
    pendingMessage:()=>locationPending()?.resume==="product"?state.lastProduct?.query:undefined};
  for(const [key,get] of Object.entries(aliases))Object.defineProperty(state,key,{get,configurable:true,enumerable:false});
  return state as WhatsAppSession;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;

export class WhatsAppSessionStore {
  private readonly sessions = new Map<string, WhatsAppSession>();

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get(userId: string): WhatsAppSession | undefined {
    const session = this.sessions.get(userId);
    if (!session) return undefined;
    if (this.now() - session.updatedAt >= this.ttlMs) {
      this.sessions.delete(userId);
      return undefined;
    }
    return session;
  }

  update(userId: string, values: Partial<ConversationState>&Partial<LegacySession>): WhatsAppSession {
    const state:ConversationState={...newConversationState(),...values,updatedAt:this.now()};
    if(!state.location&&values.latitude!==undefined&&values.longitude!==undefined)state.location={latitude:values.latitude,longitude:values.longitude};
    if(!state.lastProduct&&values.previousSearch)state.lastProduct=values.previousSearch;
    for(const key of ["latitude","longitude","previousSearch","cart","cartResult","sort","previousCart","previousResults"])delete (state as unknown as Record<string,unknown>)[key];
    const session=legacyView(state);
    this.sessions.set(userId, session);
    return session;
  }
}

export class MessageDeduplicator {
  private readonly messages = new Map<string, number>();

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  hasSeen(messageId: string): boolean {
    const seenAt = this.messages.get(messageId);
    if (seenAt !== undefined && this.now() - seenAt < this.ttlMs) return true;

    this.messages.set(messageId, this.now());
    if (this.messages.size > 1000) this.removeExpired();
    return false;
  }

  private removeExpired(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [messageId, seenAt] of this.messages) {
      if (seenAt < cutoff) this.messages.delete(messageId);
    }
  }
}
