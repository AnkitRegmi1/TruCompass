import { randomUUID } from "node:crypto";
import { requestForm } from "../../lib/http/request.js";

const GOOGLE_OAUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export class GoogleOAuthClient {
  constructor({ clientId, clientSecret, redirectUri }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }

  isConfigured() {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  createAuthUrl(state = randomUUID()) {
    const url = new URL(GOOGLE_OAUTH_BASE_URL);

    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    return url.toString();
  }

  async exchangeCodeForTokens(code) {
    return requestForm(GOOGLE_TOKEN_URL, {
      method: "POST",
      form: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.redirectUri,
      },
      timeoutMs: 20_000,
    });
  }

  async refreshAccessToken(refreshToken) {
    return requestForm(GOOGLE_TOKEN_URL, {
      method: "POST",
      form: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      },
      timeoutMs: 20_000,
    });
  }
}
