import { Router } from "express";

export function createConciergeRouter({ conciergeService, defaultTimeZone }) {
  const router = Router();

  router.post("/respond", async (request, response, next) => {
    try {
      const {
        conversationId,
        userId,
        question,
        date,
        timeZone = defaultTimeZone,
        includeAudio = false,
        forceRefreshEvents = false,
      } = request.body ?? {};

      if (!question) {
        response.status(400).json({ error: "question is required." });
        return;
      }

      const result = await conciergeService.respond({
        conversationId,
        userId,
        question,
        date,
        timeZone,
        includeAudio,
        forceRefreshEvents,
      });

      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/respond/stream", async (request, response, next) => {
    const {
      conversationId,
      userId,
      question,
      date,
      timeZone = defaultTimeZone,
      forceRefreshEvents = false,
    } = request.body ?? {};

    if (!question) {
      response.status(400).json({ error: "question is required." });
      return;
    }

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();

    const sendEvent = (data) => response.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      for await (const event of conciergeService.respondStream({
        conversationId,
        userId,
        question,
        date,
        timeZone,
        forceRefreshEvents,
      })) {
        sendEvent(event);
      }
    } catch (error) {
      sendEvent({ type: "error", message: error.message ?? "Unexpected server error." });
    } finally {
      response.end();
    }
  });

  return router;
}
