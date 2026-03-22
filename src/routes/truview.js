import { Router } from "express";

export function createTruViewRouter({ truViewService }) {
  const router = Router();

  router.get("/portal", async (request, response, next) => {
    try {
      const forceRefresh = request.query.refresh === "true";
      const snapshot = await truViewService.getPortalSnapshot({
        forceRefresh,
      });
      response.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
