import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getConfig } from '../lib/config-store.js';
import type { GeneratedEmail, EmailSendResult } from '../models/schemas.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export function getSmtpConfig(): SmtpConfig {
  const config = getConfig();
  const { host, port, secure, user, pass } = config.smtp;

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP not configured. Run "gtm config init" or set SMTP_HOST, SMTP_USER, SMTP_PASS env vars.',
    );
  }

  return { host, port, secure, user, pass };
}

export function createTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export async function sendEmail(
  transporter: Transporter,
  from: string,
  email: GeneratedEmail,
): Promise<EmailSendResult> {
  try {
    const info = await transporter.sendMail({
      from,
      to: email.to,
      subject: email.subject,
      text: email.body,
    });

    return {
      leadId: email.leadId,
      to: email.to,
      status: 'sent',
      messageId: info.messageId,
      error: null,
      sentAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      leadId: email.leadId,
      to: email.to,
      status: 'failed',
      messageId: null,
      error: (err as Error).message,
      sentAt: null,
    };
  }
}

export async function sendBatch(
  transporter: Transporter,
  from: string,
  emails: GeneratedEmail[],
  options: {
    delayMs: number;
    batchSize: number;
    onProgress: (sent: number, total: number, result: EmailSendResult) => void;
  },
): Promise<EmailSendResult[]> {
  const results: EmailSendResult[] = [];

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]!;
    const result = await sendEmail(transporter, from, email);
    results.push(result);

    options.onProgress(i + 1, emails.length, result);

    // Delay between sends (skip after last email)
    if (i < emails.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
  }

  return results;
}
