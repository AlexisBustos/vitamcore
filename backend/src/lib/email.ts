/**
 * Envío de correo vía Resend (API HTTP, sin dependencia extra: usa fetch nativo).
 *
 * Degradación elegante: si no hay RESEND_API_KEY, no falla — loguea el correo
 * como "simulado" y devuelve `sent:false`. Así el resto del sistema (informe
 * semanal) funciona y es testeable sin la key, igual que el agente cae a
 * heurístico cuando falta la key de IA.
 */
import { env } from '../config/env';
import { logger } from './logger';

export type SendEmailInput = {
  to?: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

export type SendEmailResult = {
  sent: boolean;
  id?: string;
  /** Motivo por el que NO se envió (cuando sent=false). */
  skipped?: 'no-api-key' | 'no-recipient';
};

/** Normaliza `to`: acepta string (con comas), array o env REPORT_EMAIL_TO. */
function resolveRecipients(to?: string | string[]): string[] {
  const raw = to ?? env.REPORT_EMAIL_TO;
  const list = Array.isArray(raw) ? raw : raw.split(',');
  return list.map((t) => t.trim()).filter(Boolean);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const to = resolveRecipients(input.to);
  const from = input.from ?? env.REPORT_EMAIL_FROM;

  if (!env.RESEND_API_KEY) {
    logger.warn(
      { to, subject: input.subject },
      'RESEND_API_KEY ausente: correo NO enviado (modo simulación)',
    );
    return { sent: false, skipped: 'no-api-key' };
  }
  if (to.length === 0) {
    logger.warn(
      { subject: input.subject },
      'Sin destinatario (REPORT_EMAIL_TO vacío): correo NO enviado',
    );
    return { sent: false, skipped: 'no-recipient' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logger.error(
      { status: res.status, body },
      'Resend devolvió error al enviar el correo',
    );
    throw new Error(`Resend error ${res.status}: ${body}`);
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  logger.info({ id: data.id, to, subject: input.subject }, 'Correo enviado por Resend');
  return { sent: true, id: data.id };
}
