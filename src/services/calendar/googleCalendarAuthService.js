import { randomUUID } from "node:crypto";

export class GoogleCalendarAuthService {
  constructor({ oauthClient, stateCache, tokenCache, stateStore, tokenStore }) {
    this.oauthClient = oauthClient;
    this.stateCache = stateCache;
    this.tokenCache = tokenCache;
    this.stateStore = stateStore;
    this.tokenStore = tokenStore;
  }

  isConfigured() {
    return this.oauthClient.isConfigured();
  }

  async createAuthUrl(userId) {
    if (!this.isConfigured()) {
      throw new Error("Google Calendar OAuth is not configured.");
    }

    const state = randomUUID();
    const stateRecord = {
      userId,
      createdAt: Date.now(),
    };

    if (this.stateStore?.saveState) {
      await this.stateStore.saveState(state, stateRecord);
    } else {
      const states = (await this.stateCache.read()) ?? {};
      states[state] = stateRecord;
      await this.stateCache.write(states);
    }

    return this.oauthClient.createAuthUrl(state);
  }

  async handleOAuthCallback({ code, state }) {
    let stateRecord = null;

    if (this.stateStore?.getState) {
      stateRecord = await this.stateStore.getState(state);
    } else {
      const states = (await this.stateCache.read()) ?? {};
      stateRecord = states[state];
    }

    if (!stateRecord) {
      throw new Error("Google OAuth state is invalid or has expired.");
    }

    const tokenResponse = await this.oauthClient.exchangeCodeForTokens(code);
    const existingTokens =
      (await this.tokenStore?.getTokens?.(stateRecord.userId)) ??
      ((await this.tokenCache.read()) ?? {})[stateRecord.userId] ??
      {};

    const nextTokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? existingTokens.refreshToken ?? "",
      expiryAt: Date.now() + Number(tokenResponse.expires_in ?? 0) * 1000,
      scope: tokenResponse.scope,
      tokenType: tokenResponse.token_type,
    };

    if (this.stateStore?.deleteState) {
      await this.stateStore.deleteState(state);
    } else {
      const states = (await this.stateCache.read()) ?? {};
      delete states[state];
      await this.stateCache.write(states);
    }

    if (this.tokenStore?.saveTokens) {
      await this.tokenStore.saveTokens(stateRecord.userId, nextTokens);
    } else {
      const existingTokensByUser = (await this.tokenCache.read()) ?? {};
      existingTokensByUser[stateRecord.userId] = nextTokens;
      await this.tokenCache.write(existingTokensByUser);
    }

    return {
      userId: stateRecord.userId,
      scope: tokenResponse.scope,
    };
  }

  async getValidAccessToken(userId) {
    if (!this.isConfigured()) {
      return null;
    }

    const tokensByUser = this.tokenStore?.saveTokens ? null : (await this.tokenCache.read()) ?? {};
    const userTokens =
      (await this.tokenStore?.getTokens?.(userId)) ??
      tokensByUser?.[userId] ??
      null;

    if (!userTokens) {
      return null;
    }

    if (userTokens.expiryAt > Date.now() + 60_000) {
      return userTokens.accessToken;
    }

    if (!userTokens.refreshToken) {
      return null;
    }

    const refreshedTokens = await this.oauthClient.refreshAccessToken(
      userTokens.refreshToken,
    );

    const refreshed = {
      ...userTokens,
      accessToken: refreshedTokens.access_token,
      refreshToken: refreshedTokens.refresh_token ?? userTokens.refreshToken,
      expiryAt: Date.now() + Number(refreshedTokens.expires_in ?? 0) * 1000,
      scope: refreshedTokens.scope ?? userTokens.scope,
      tokenType: refreshedTokens.token_type ?? userTokens.tokenType,
    };

    if (this.tokenStore?.saveTokens) {
      await this.tokenStore.saveTokens(userId, refreshed);
    } else {
      tokensByUser[userId] = refreshed;
      await this.tokenCache.write(tokensByUser);
    }

    return refreshed.accessToken;
  }
}
