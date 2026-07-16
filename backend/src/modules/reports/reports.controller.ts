/**
 * Controllers de informes ejecutivos.
 * - preview: compone el informe semanal SIN persistir ni enviar (para revisar).
 * - send: genera, persiste y envía el informe por correo (disparo manual).
 */
import type { Request, Response } from 'express';
import { previewQuerySchema } from './reports.schema';
import {
  buildWeeklyReportData,
  renderHtml,
  renderText,
  reportSubject,
  sendWeeklyReport,
} from './weekly-report.service';

export async function previewWeeklyController(req: Request, res: Response) {
  const { format } = previewQuerySchema.parse(req.query);
  const data = await buildWeeklyReportData(new Date());

  if (format === 'html') {
    res.type('html').send(renderHtml(data));
    return;
  }
  if (format === 'text') {
    res.type('text/plain').send(renderText(data));
    return;
  }
  res.json({
    data: {
      subject: reportSubject(data),
      weekKey: data.weekKey,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      html: renderHtml(data),
      text: renderText(data),
      summary: data,
    },
  });
}

export async function sendWeeklyController(_req: Request, res: Response) {
  const result = await sendWeeklyReport(new Date());
  res.json({ data: result });
}
