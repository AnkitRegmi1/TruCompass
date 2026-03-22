import { randomUUID } from "node:crypto";

const MAX_TURNS = 16;

export class ConversationStoreService {
  constructor({ cache }) {
    this.cache = cache;
  }

  async getConversation(conversationId) {
    if (!conversationId) {
      return {
        conversationId: randomUUID(),
        messages: [],
      };
    }

    const conversations = (await this.cache.read()) ?? {};

    return {
      conversationId,
      messages: conversations[conversationId]?.messages ?? [],
    };
  }

  async appendTurn(conversationId, userText, assistantText) {
    const conversations = (await this.cache.read()) ?? {};
    const existingMessages = conversations[conversationId]?.messages ?? [];
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

    conversations[conversationId] = {
      messages: nextMessages,
      updatedAt: Date.now(),
    };

    await this.cache.write(conversations);

    return nextMessages;
  }
}
