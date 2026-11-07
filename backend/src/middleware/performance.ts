import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { createPerformanceTrace, finishPerformanceTrace, withPerformanceTrace } from '../lib/performance.js';

export function performanceDiagnostics(enabled: boolean): RequestHandler {
  return (req, res, next) => {
    if (!enabled || req.method !== 'GET') return next();
    const endpoint = req.path === '/api/calendar' || req.path === '/api/calendar/' ? '/api/calendar'
      : /^\/api\/public\/availability\/[^/]+\/?$/.test(req.path) ? '/api/public/availability/:slug'
      : /^\/api\/public\/availability\/[^/]+\/config\/?$/.test(req.path) ? '/api/public/availability/:slug/config'
      : /^\/api\/public\/availability\/[^/]+\/calendar\/?$/.test(req.path) ? '/api/public/availability/:slug/calendar'
      : null;
    if (!endpoint) return next();
    const trace = createPerformanceTrace();
    const requestId = randomUUID();
    res.setHeader('X-Diagnostic-Id', requestId);
    let logged = false;
    const log = (aborted: boolean) => {
      if (logged) return;
      logged = true;
      console.info('[perf]', JSON.stringify({ requestId, endpoint, status: res.statusCode, aborted, ...finishPerformanceTrace(trace) }));
    };
    res.once('finish', () => log(false));
    res.once('close', () => log(!res.writableFinished));
    withPerformanceTrace(trace, next);
  };
}
