import { requestJson, requestText } from "../../lib/http/request.js";

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

function deriveBackendServer(portalUrl) {
  try {
    const url = new URL(portalUrl);
    return `https://api.${url.host}`;
  } catch {
    return "";
  }
}

function mapNotice(notice) {
  return {
    id: notice?.id ?? notice?.uuid ?? Math.random().toString(36).slice(2),
    title: notice?.title || notice?.name || "TruView notice",
    summary:
      notice?.body ||
      notice?.message ||
      notice?.summary ||
      notice?.description ||
      "",
    url: notice?.url || notice?.link || "",
    startsAt: notice?.start_date || notice?.start_day || notice?.published_at || null,
    displayTime:
      notice?.start_date ||
      notice?.start_day ||
      notice?.published_at ||
      "TruView update",
    sourceType: "truview-notice",
  };
}

function mapEvent(event) {
  return {
    id: event?.id ?? event?.uuid ?? Math.random().toString(36).slice(2),
    summary: event?.title || event?.name || "TruView event",
    location: event?.location || event?.room?.name || "",
    startsAt: event?.start_date || event?.start_day || null,
    endsAt: event?.end_date || event?.end_day || null,
    displayTime:
      event?.timeline || event?.display_date || event?.start_date || "TruView event",
    sourceType: "truview-event",
  };
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

  async #requestPublicJson(path, searchParams = {}) {
    const snapshot = await this.getPortalSnapshot();
    const baseUrl = snapshot.backendServer || deriveBackendServer(this.portalUrl);

    if (!baseUrl) {
      return null;
    }

    const url = new URL(path, `${baseUrl.replace(/\/$/, "")}/`);
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }

    try {
      return await requestJson(url.toString());
    } catch {
      return null;
    }
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

  async getPublicNotices({ forceRefresh = false } = {}) {
    const cacheKey = "truview:notices";
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

    const raw = await this.#requestPublicJson("notices/", { paginate: false });
    const notices = Array.isArray(raw?.results)
      ? raw.results.map(mapNotice)
      : Array.isArray(raw)
        ? raw.map(mapNotice)
        : [];

    const payload = {
      fetchedAt: Date.now(),
      count: notices.length,
      notices,
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

  async getPublicEventCalendars({ forceRefresh = false } = {}) {
    const cacheKey = "truview:event-calendars";
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

    const raw = await this.#requestPublicJson("v2/events/unauthenticated/calendars/");
    const calendars = Array.isArray(raw?.results)
      ? raw.results
      : Array.isArray(raw)
        ? raw
        : [];

    const payload = {
      fetchedAt: Date.now(),
      count: calendars.length,
      calendars,
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

  async getPublicEvents({ forceRefresh = false } = {}) {
    const cacheKey = "truview:events";
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

    const raw = await this.#requestPublicJson("v2/events/unauthenticated/", {
      current: true,
      paginate: true,
      published: true,
    });
    const events = Array.isArray(raw?.results)
      ? raw.results.map(mapEvent)
      : Array.isArray(raw)
        ? raw.map(mapEvent)
        : [];

    const payload = {
      fetchedAt: Date.now(),
      count: events.length,
      events,
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

  async getPublicContext({ forceRefresh = false } = {}) {
    const [snapshot, notices, events, eventCalendars] = await Promise.all([
      this.getPortalSnapshot({ forceRefresh }),
      this.getPublicNotices({ forceRefresh }),
      this.getPublicEvents({ forceRefresh }),
      this.getPublicEventCalendars({ forceRefresh }),
    ]);

    return {
      snapshot,
      notices,
      events,
      eventCalendars,
      highlights: [
        ...((events?.events ?? []).slice(0, 4)),
        ...((notices?.notices ?? []).slice(0, 4)),
      ],
    };
  }
}
