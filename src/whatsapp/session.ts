import type { PreviousSearch } from "../ai/conversation.js";

export type WhatsAppSession = {
  pendingMessage?: string;
  previousSearch?: PreviousSearch;
  latitude?: number;
  longitude?: number;
  updatedAt: number;
};

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

  update(userId: string, values: Omit<WhatsAppSession, "updatedAt">): WhatsAppSession {
    const session = { ...values, updatedAt: this.now() };
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
