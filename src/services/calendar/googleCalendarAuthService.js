import { randomUUID } from "node:crypto";

export class GoogleCalendarAuthService {
  constructor({ oauthClient, stateCache, tokenCache }) {
    this.oauthClient = oauthClient;
    this.stateCache = stateCache;
    this.tokenCache = tokenCache;
  }

  isConfigured() {
    return this.oauthClient.isConfigured();
  }

  async createAuthUrl(userId) {
    if (!this.isConfigured()) {
      throw new Error("Google Calendar OAuth is not configured.");
    }

    const state = randomUUID();
    const states = (await this.stateCache.read()) ?? {};
    states[state] = {
      userId,
      createdAt: Date.now(),
    };
    await this.stateCache.write(states);

    return this.oauthClient.createAuthUrl(state);
  }

  async handleOAuthCallback({ code, state }) {
    const states = (await this.stateCache.read()) ?? {};
    const stateRecord = states[state];

    if (!stateRecord) {
      throw new Error("Google OAuth state is invalid or has expired.");
    }

    const tokenResponse = await this.oauthClient.exchangeCodeForTokens(code);
    const existingTokensByUser = (await this.tokenCache.read()) ?? {};
    const existingTokens = existingTokensByUser[stateRecord.userId] ?? {};

    existingTokensByUser[stateRecord.userId] = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? existingTokens.refreshToken ?? "",
      expiryAt: Date.now() + Number(tokenResponse.expires_in ?? 0) * 1000,
      scope: tokenResponse.scope,
      tokenType: tokenResponse.token_type,
    };

    delete states[state];

    await Promise.all([
      this.stateCache.write(states),
      this.tokenCache.write(existingTokensByUser),
    ]);

    return {
      userId: stateRecord.userId,
      scope: tokenResponse.scope,
    };
  }

  async getValidAccessToken(userId) {
    if (!this.isConfigured()) {
      return null;
    }

    const tokensByUser = (await this.tokenCache.read()) ?? {};
    const userTokens = tokensByUser[userId];

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

    tokensByUser[userId] = {
      ...userTokens,
      accessToken: refreshedTokens.access_token,
      refreshToken: refreshedTokens.refresh_token ?? userTokens.refreshToken,
      expiryAt: Date.now() + Number(refreshedTokens.expires_in ?? 0) * 1000,
      scope: refreshedTokens.scope ?? userTokens.scope,
      tokenType: refreshedTokens.token_type ?? userTokens.tokenType,
    };

    await this.tokenCache.write(tokensByUser);

    return tokensByUser[userId].accessToken;
  }
}
