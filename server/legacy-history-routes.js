const legacyRouteUnavailable = (_req, res) => {
  return res.status(410).json({ error: 'This endpoint is no longer available.' });
};

export function registerLegacyHistoryRoutes(app) {
  app.get('/api/submissions', legacyRouteUnavailable);
  app.get('/api/dashboard/history', legacyRouteUnavailable);
}