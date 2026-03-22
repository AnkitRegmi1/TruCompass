import { requestText } from "../../lib/http/request.js";

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function extractAssignedJson(html, variableName) {
  const match = String(html ?? "").match(
    new RegExp(`var\\s+${variableName}\\s*=\\s*(\\{[\\s\\S]*?\\});`),
  );

  if (!match) {
    return null;
  }

  return safeJsonParse(match[1], null);
}

function extractAssignedString(html, variableName) {
  const match = String(html ?? "").match(
    new RegExp(`var\\s+${variableName}\\s*=\\s*"([^"]*)";`),
  );

  return match ? match[1] : "";
}

export class TruViewService {
  constructor({
    portalUrl = "https://truview.truman.edu/",
    cache,
    cacheTtlMs = 15 * 60 * 1000,
  } = {}) {
    this.portalUrl = portalUrl;
    this.cache = cache;
    this.cacheTtlMs = cacheTtlMs;
  }

  async getPortalSnapshot({ forceRefresh = false } = {}) {
    const cacheKey = "truview:portal";
    const cachedPayload = (await this.cache?.read?.()) ?? {};
    const cachedEntry = cachedPayload[cacheKey];
    const cacheIsFresh =
      cachedEntry &&
      Number.isFinite(cachedEntry.fetchedAt) &&
      Date.now() - cachedEntry.fetchedAt < this.cacheTtlMs;

    if (!forceRefresh && cacheIsFresh) {
      return {
        ...cachedEntry,
        source: "cache",
      };
    }

    const html = await requestText(this.portalUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    const metadata = extractAssignedJson(html, "METADATA") ?? {};
    const backendServer = extractAssignedString(html, "BACKEND_SERVER");
    const flowIframeUrlTemplate = extractAssignedString(
      html,
      "FLOW_IFRAME_URL_TEMPLATE",
    );

    const payload = {
      fetchedAt: Date.now(),
      portalUrl: this.portalUrl,
      backendServer,
      flowIframeUrlTemplate,
      metadata,
      features: {
        announcements: Boolean(metadata.unauthenticated_view_announcements_enabled),
        events: Boolean(metadata.unauthenticated_view_events_enabled),
        tools: Boolean(metadata.unauthenticated_view_tools_enabled),
        pages: Boolean(metadata.unauthenticated_view_pages_enabled),
        globalEvents: Boolean(metadata.global_events_enabled),
        onboarding: Boolean(metadata.onboarding_enabled),
        discover: Boolean(metadata.discover_enabled),
      },
      authentication: {
        mode: metadata.authentication || "unknown",
        samlBackends: metadata.saml_backends ?? [],
        authRedirectUrl: metadata.auth_redirect_url || "",
        publicViewEnabled: Boolean(metadata.unauthenticated_view_enabled),
        publicAnnouncementsEnabled: Boolean(
          metadata.unauthenticated_view_announcements_enabled,
        ),
        publicEventsEnabled: Boolean(
          metadata.unauthenticated_view_events_enabled,
        ),
        publicToolsEnabled: Boolean(
          metadata.unauthenticated_view_tools_enabled,
        ),
        publicPagesEnabled: Boolean(
          metadata.unauthenticated_view_pages_enabled,
        ),
      },
      planningValue: [
        metadata.unauthenticated_view_announcements_enabled
          ? "Public announcements can help with live weekly updates."
          : null,
        metadata.unauthenticated_view_events_enabled
          ? "Public TruView events can add another event stream."
          : null,
        metadata.unauthenticated_view_tools_enabled
          ? "Public tools can help recommend student resources."
          : null,
        metadata.onboarding_enabled
          ? "TruView onboarding suggests a path to personalized portal setup."
          : null,
      ].filter(Boolean),
      authenticatedSupport: {
        planned: true,
        note:
          "Student-specific TruView content likely requires SAML-authenticated session handling. The service is ready to expand once we target authenticated endpoints or a session flow.",
      },
    };

    if (this.cache?.write) {
      await this.cache.write({
        ...cachedPayload,
        [cacheKey]: payload,
      });
    }

    return {
      ...payload,
      source: "api",
    };
  }
}
