import rateLimit from "express-rate-limit";
import { rateLimitExceeded } from "../lib/AppError.js";

export const rateLimiter = (limit: number, windowMs: number) => {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: () => {
      throw rateLimitExceeded();
    },
  });
};

export const writeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) =>
    req.method === "GET" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS" ||
    // Los webhooks llegan en ráfaga y MP/Meta reintentan si reciben 429.
    req.path.endsWith("/webhook"),
  handler: () => {
    throw rateLimitExceeded();
  },
});