import { Router } from 'express';
import { serve, setup } from 'swagger-ui-express';
import { openApiDocument } from './openapi.js';

const router = Router();

// Toda la UI y la spec son públicas a propósito: /api/docs no tiene requireAuth
// (ni en dev ni detrás de la Lambda). Es la misma política que /health.
router.get('/api/docs.json', (_req, res) => {
  res.json(openApiDocument);
});

router.use('/api/docs', serve);
router.get(
  '/api/docs',
  setup(openApiDocument, {
    customSiteTitle: 'API Gestión Hotel — Documentación',
    explorer: true,
  }),
);

export default router;