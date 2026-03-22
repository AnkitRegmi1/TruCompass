export class SupabaseOAuthStateStore {
  constructor({ client, tableName = "google_oauth_states" } = {}) {
    this.client = client;
    this.tableName = tableName;
  }

  async saveState(state, { userId, createdAt }) {
    const { error } = await this.client
      .from(this.tableName)
      .upsert({
        state,
        user_id: userId,
        created_at: new Date(createdAt).toISOString(),
      });

    if (error) {
      throw error;
    }
  }

  async getState(state) {
    const { data, error } = await this.client
      .from(this.tableName)
      .select("state, user_id, created_at")
      .eq("state", state)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    return {
      userId: data.user_id,
      createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
    };
  }

  async deleteState(state) {
    const { error } = await this.client
      .from(this.tableName)
      .delete()
      .eq("state", state);

    if (error) {
      throw error;
    }
  }
}

export class SupabaseGoogleTokenStore {
  constructor({ client, tableName = "google_calendar_tokens" } = {}) {
    this.client = client;
    this.tableName = tableName;
  }

  async getTokens(userId) {
    const { data, error } = await this.client
      .from(this.tableName)
      .select("tokens_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.tokens_json ?? null;
  }

  async saveTokens(userId, tokens) {
    const { error } = await this.client.from(this.tableName).upsert({
      user_id: userId,
      tokens_json: tokens,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }
  }
}

export class SupabasePlannerPreferencesStore {
  constructor({ client, tableName = "planner_preferences" } = {}) {
    this.client = client;
    this.tableName = tableName;
  }

  async getPreferences(userId) {
    const { data, error } = await this.client
      .from(this.tableName)
      .select("preferences_json")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.preferences_json ?? null;
  }

  async savePreferences(userId, preferences) {
    const { error } = await this.client.from(this.tableName).upsert({
      user_id: userId,
      preferences_json: preferences,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }
  }
}

export class SupabaseConversationStore {
  constructor({ client, tableName = "conversations" } = {}) {
    this.client = client;
    this.tableName = tableName;
  }

  async getConversation(conversationId) {
    const { data, error } = await this.client
      .from(this.tableName)
      .select("conversation_json")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.conversation_json ?? null;
  }

  async saveConversation(conversationId, userId, conversation) {
    const { error } = await this.client.from(this.tableName).upsert({
      conversation_id: conversationId,
      user_id: userId ?? null,
      conversation_json: conversation,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }
  }
}
