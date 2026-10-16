import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export function isMailConfigured(): boolean {
  return Boolean(env.smtp.host && env.smtp.user);
}

const transport = nodemailer.createTransport({
  host: env.smtp.host || 'localhost',
  port: env.smtp.port,
  secure: env.smtp.secure,
  auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
});

export async function sendMail(options: { to: string; subject: string; text: string }): Promise<void> {
  await transport.sendMail({ from: env.smtp.from, ...options });
}
