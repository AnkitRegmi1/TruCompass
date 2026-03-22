import express from "express";
import { resolve } from "node:path";
import { getEnv } from "./config/env.js";
import { FileCache } from "./lib/cache/fileCache.js";
import { GoogleCalendarClient } from "./integrations/google/calendarClient.js";
import { GoogleOAuthClient } from "./integrations/google/oauthClient.js";
import { OpenAiClient } from "./integrations/openai/client.js";
import { TrumanApiClient } from "./integrations/truman/client.js";
import { createCalendarRouter } from "./routes/calendar.js";
import { createConciergeRouter } from "./routes/concierge.js";
import { createDiningRouter } from "./routes/dining.js";
import { createEventsRouter } from "./routes/events.js";
import { createNewsletterRouter } from "./routes/newsletter.js";
import { createPlannerRouter } from "./routes/planner.js";
import { createRecRouter } from "./routes/rec.js";
import { createTruViewRouter } from "./routes/truview.js";
import { createSupportRouter } from "./routes/support.js";
import { AcademicCalendarService } from "./services/academic/academicCalendarService.js";
import { FreeTimeService } from "./services/calendar/freeTimeService.js";
import { GoogleCalendarAuthService } from "./services/calendar/googleCalendarAuthService.js";
import { GoogleCalendarService } from "./services/calendar/googleCalendarService.js";
import { AudioService } from "./services/concierge/audioService.js";
import { ConciergeService } from "./services/concierge/conciergeService.js";
import { ConversationStoreService } from "./services/concierge/conversationStoreService.js";
import { EventMatchService } from "./services/concierge/eventMatchService.js";
import { IntentService } from "./services/concierge/intentService.js";
import { MeetingDraftService } from "./services/concierge/meetingDraftService.js";
import { ResponseService } from "./services/concierge/responseService.js";
import { TrumanEventsService } from "./services/events/trumanEventsService.js";
import { LibraryService } from "./services/library/libraryService.js";
import { CampusKnowledgeService } from "./services/planner/campusKnowledgeService.js";
import { UserPreferencesService } from "./services/planner/userPreferencesService.js";
import { WeekPlannerService } from "./services/planner/weekPlannerService.js";
import { CampusRecService } from "./services/rec/campusRecService.js";
import { DiningService } from "./services/dining/diningService.js";
import { NewsletterService } from "./services/newsletter/newsletterService.js";
import { TruViewService } from "./services/truview/truviewService.js";
import { StudentSupportService } from "./services/support/studentSupportService.js";

export function createApp() {
  const env = getEnv();
  const app = express();
  const publicDir = resolve("public");

  // Build integrations and services here so routes stay thin and easy to extend later.
  const trumanApiClient = new TrumanApiClient({
    baseUrl: env.trumanApiBaseUrl,
    onCampusEventsPath: env.trumanOnCampusEventsPath,
    athleticsEventsPath: env.trumanAthleticsEventsPath,
    feedsPath: env.trumanFeedsPath,
  });

  const trumanEventsCache = new FileCache(
    resolve("data/cache/truman-events.json"),
  );
  const trumanAthleticsCache = new FileCache(
    resolve("data/cache/truman-athletics-events.json"),
  );
  const trumanFeedsCache = new FileCache(
    resolve("data/cache/truman-feeds.json"),
  );
  const trumanFeedUpdatesCache = new FileCache(
    resolve("data/cache/truman-feed-updates.json"),
  );

  const trumanEventsService = new TrumanEventsService({
    client: trumanApiClient,
    cache: trumanEventsCache,
    athleticsCache: trumanAthleticsCache,
    feedsCache: trumanFeedsCache,
    feedUpdatesCache: trumanFeedUpdatesCache,
    cacheTtlMs: env.eventsCacheTtlMs,
    defaultTimeZone: env.defaultTimeZone,
  });

  const googleCalendarAuthService = new GoogleCalendarAuthService({
    oauthClient: new GoogleOAuthClient({
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      redirectUri: env.googleRedirectUri,
    }),
    stateCache: new FileCache(resolve("data/google/oauth-states.json")),
    tokenCache: new FileCache(resolve("data/google/calendar-tokens.json")),
  });

  const googleCalendarService = new GoogleCalendarService({
    authService: googleCalendarAuthService,
    calendarClient: new GoogleCalendarClient(),
    freeTimeService: new FreeTimeService(),
    wakeStartHour: env.wakeStartHour,
    wakeEndHour: env.wakeEndHour,
  });

  const openAiClient = new OpenAiClient({
    apiKey: env.openAiApiKey,
  });

  const campusRecService = new CampusRecService({
    historyCache: new FileCache(resolve("data/cache/rec-history.json")),
  });
  const diningService = new DiningService({
    cache: new FileCache(resolve("data/cache/dining-menus.json")),
    apiKey: env.sodexoApiKey,
  });
  const newsletterService = new NewsletterService({
    cache: new FileCache(resolve("data/cache/newsletter.json")),
  });
  const truViewService = new TruViewService({
    cache: new FileCache(resolve("data/cache/truview.json")),
  });
  const studentSupportService = new StudentSupportService({
    googleCalendarService,
    defaultTimeZone: env.defaultTimeZone,
  });
  const preferencesService = new UserPreferencesService({
    cache: new FileCache(resolve("data/cache/planner-preferences.json")),
  });
  const libraryService = new LibraryService();
  const academicCalendarService = new AcademicCalendarService();
  const eventMatchService = new EventMatchService();
  const weekPlannerService = new WeekPlannerService({
    googleCalendarService,
    trumanEventsService,
    diningService,
    campusRecService,
    newsletterService,
    libraryService,
    academicCalendarService,
    eventMatchService,
    knowledgeService: new CampusKnowledgeService(),
    preferencesService,
    llmClient: openAiClient,
    model: env.openAiResponseModel,
    defaultTimeZone: env.defaultTimeZone,
  });

  const conciergeService = new ConciergeService({
    trumanEventsService,
    googleCalendarService,
    campusRecService,
    diningService,
    newsletterService,
    weekPlannerService,
    intentService: new IntentService({
      llmClient: openAiClient,
      model: env.openAiIntentModel,
    }),
    eventMatchService,
    meetingDraftService: new MeetingDraftService({
      llmClient: openAiClient,
      model: env.openAiResponseModel,
      defaultTimeZone: env.defaultTimeZone,
    }),
    conversationStoreService: new ConversationStoreService({
      cache: new FileCache(resolve("data/cache/conversations.json")),
    }),
    responseService: new ResponseService({
      llmClient: openAiClient,
      model: env.openAiResponseModel,
    }),
    audioService: new AudioService({
      openAiClient,
      model: env.openAiTtsModel,
      voice: env.openAiTtsVoice,
    }),
    defaultTimeZone: env.defaultTimeZone,
  });

  app.use(express.json());
  app.use(express.static(publicDir));
  app.use("/audio", express.static(resolve("data/audio")));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      services: {
        googleCalendarConfigured: googleCalendarAuthService.isConfigured(),
        openAiConfigured: openAiClient.isConfigured(),
        truViewConfigured: true,
      },
    });
  });

  app.use(
    "/api/events",
    createEventsRouter({
      trumanEventsService,
    }),
  );

  app.use(
    "/api/calendar",
    createCalendarRouter({
      googleCalendarAuthService,
      googleCalendarService,
      defaultTimeZone: env.defaultTimeZone,
    }),
  );

  app.use(
    "/api/concierge",
    createConciergeRouter({
      conciergeService,
      defaultTimeZone: env.defaultTimeZone,
    }),
  );

  app.use(
    "/api/dining",
    createDiningRouter({
      diningService,
    }),
  );

  app.use(
    "/api/newsletter",
    createNewsletterRouter({
      newsletterService,
    }),
  );

  app.use(
    "/api/planner",
    createPlannerRouter({
      weekPlannerService,
      preferencesService,
      defaultTimeZone: env.defaultTimeZone,
    }),
  );

  app.use(
    "/api/rec",
    createRecRouter({
      campusRecService,
    }),
  );

  app.use(
    "/api/truview",
    createTruViewRouter({
      truViewService,
    }),
  );

  app.use(
    "/api/support",
    createSupportRouter({
      studentSupportService,
    }),
  );

  app.get("*", (request, response, next) => {
    if (
      request.path.startsWith("/api") ||
      request.path.startsWith("/audio")
    ) {
      next();
      return;
    }

    response.sendFile(resolve(publicDir, "index.html"));
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({
      error: "Something went wrong while loading Truman events.",
      details: error.message,
    });
  });

  return {
    app,
    env,
    services: {
      campusRecService,
      conciergeService,
    },
  };
}
