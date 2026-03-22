const DEFAULT_PORT = 3000;
const DEFAULT_EVENTS_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_WAKE_START_HOUR = 8;
const DEFAULT_WAKE_END_HOUR = 22;
const DEFAULT_TIME_ZONE = "America/Chicago";

export function getEnv() {
  return {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    trumanApiBaseUrl: process.env.TRUMAN_API_BASE_URL ?? "https://api.truman.edu/v1",
    trumanOnCampusEventsPath:
      process.env.TRUMAN_ON_CAMPUS_EVENTS_PATH ?? "/truman/events/on-campus",
    trumanAthleticsEventsPath:
      process.env.TRUMAN_ATHLETICS_EVENTS_PATH ?? "/truman/events/athletics",
    trumanFeedsPath: process.env.TRUMAN_FEEDS_PATH ?? "/feeds-list",
    eventsCacheTtlMs: Number(
      process.env.EVENTS_CACHE_TTL_MS ?? DEFAULT_EVENTS_CACHE_TTL_MS,
    ),
    defaultTimeZone: process.env.DEFAULT_TIME_ZONE ?? DEFAULT_TIME_ZONE,
    wakeStartHour: Number(
      process.env.WAKE_START_HOUR ?? DEFAULT_WAKE_START_HOUR,
    ),
    wakeEndHour: Number(process.env.WAKE_END_HOUR ?? DEFAULT_WAKE_END_HOUR),
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
    upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
    redisKeyPrefix: process.env.REDIS_KEY_PREFIX ?? "trucompass",
    redisCacheTtlSeconds: Number(process.env.REDIS_CACHE_TTL_SECONDS ?? 7 * 24 * 60 * 60),
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    openAiApiKey: process.env.OPENAI_API_KEY ?? "",
    openAiIntentModel: process.env.OPENAI_INTENT_MODEL ?? "gpt-5",
    openAiResponseModel: process.env.OPENAI_RESPONSE_MODEL ?? "gpt-5",
    openAiTtsModel: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
    openAiTtsVoice: process.env.OPENAI_TTS_VOICE ?? "coral",
    sodexoApiKey: process.env.SODEXO_API_KEY ?? "",
  };
}
