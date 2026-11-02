import type { Request, Response } from 'express';
import { getCalendar } from './calendar.service.js';

export async function calendar(req: Request, res: Response): Promise<void> {
  const data = await getCalendar({ from: req.query.from, to: req.query.to });
  res.json({ data });
}
