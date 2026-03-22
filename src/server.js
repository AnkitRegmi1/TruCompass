import { createServer } from "node:http";
import { createApp } from "./app.js";
import { attachRealtimeRelay } from "./routes/realtimeRelay.js";

const { app, env, services } = createApp();

services?.campusRecService?.startHourlyHistoryCollection();

const httpServer = createServer(app);

attachRealtimeRelay(httpServer, {
  apiKey: env.openAiApiKey,
  conciergeService: services.conciergeService,
  defaultTimeZone: env.defaultTimeZone,
});

httpServer.listen(env.port, () => {
  console.log(
    `Truman State Campus Concierge backend listening on port ${env.port}`,
  );
});
