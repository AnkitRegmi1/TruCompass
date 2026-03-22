import { randomUUID } from "node:crypto";

const MAX_TURNS = 16;

export class ConversationStoreService {
  constructor({ cache, store = null }) {
    this.cache = cache;
    this.store = store;
  }

  async getConversation(conversationId) {
    if (!conversationId) {
      return {
        conversationId: randomUUID(),
        messages: [],
      };
    }

    if (this.store?.getConversation) {
      const storedConversation = await this.store.getConversation(conversationId);

      return {
        conversationId,
        messages: storedConversation?.messages ?? [],
      };
    }

    const conversations = (await this.cache.read()) ?? {};

    return {
      conversationId,
      messages: conversations[conversationId]?.messages ?? [],
    };
  }

  async appendTurn(conversationId, userText, assistantText) {
    let existingMessages = [];

    if (this.store?.getConversation) {
      existingMessages =
        (await this.store.getConversation(conversationId))?.messages ?? [];
    } else {
      const conversations = (await this.cache.read()) ?? {};
      existingMessages = conversations[conversationId]?.messages ?? [];
    }

    const nextMessages = [
      ...existingMessages,
      {
        role: "user",
        text: userText,
        createdAt: Date.now(),
      },
      {
        role: "assistant",
        text: assistantText,
        createdAt: Date.now(),
      },
    ].slice(-MAX_TURNS);

    const conversationPayload = {
      messages: nextMessages,
      updatedAt: Date.now(),
    };

    if (this.store?.saveConversation) {
      await this.store.saveConversation(conversationId, null, conversationPayload);
    } else {
      const conversations = (await this.cache.read()) ?? {};
      conversations[conversationId] = conversationPayload;
      await this.cache.write(conversations);
    }

    return nextMessages;
  }
}
