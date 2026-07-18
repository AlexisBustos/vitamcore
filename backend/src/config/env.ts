/**
 * Validación de variables de entorno con Zod.
 * Si falta una variable crítica o tiene un formato inválido,
 * el proceso falla al iniciar con un mensaje claro (fail-fast).
 */
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  // URL pública del frontend, usada para construir enlaces en correos.
  APP_URL: z.string().url().default('http://localhost:5173'),
  // Nivel de logging (pino): trace|debug|info|warn|error|fatal|silent.
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),

  // --- Agent Layer (Sprint 3) ---
  // Proveedor de IA: 'anthropic' usa Claude; 'heuristic' funciona sin API key.
  AGENT_PROVIDER: z.enum(['anthropic', 'heuristic']).default('heuristic'),
  // La clave NUNCA se expone al frontend. Vacía => se fuerza modo heurístico.
  AGENT_API_KEY: z.string().optional().default(''),
  AGENT_MODEL: z.string().default('claude-opus-4-8'),
  AGENT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  AGENT_MAX_CONTEXT_ITEMS: z.coerce.number().int().positive().default(50),
  // Si es false, el agente no puede crear insights/tareas automáticamente.
  AGENT_ALLOW_WRITE_ACTIONS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // --- Informes por correo (Etapa 2) ---
  // API key de Resend. Vacía => el envío se simula (se loguea, no se manda).
  RESEND_API_KEY: z.string().optional().default(''),
  // Remitente (dominio verificado en Resend) y destinatario(s) del informe.
  REPORT_EMAIL_FROM: z.string().default('core@vitam.tech'),
  // Uno o varios correos separados por coma. Vacío => no se envía.
  REPORT_EMAIL_TO: z.string().optional().default(''),
  // Interruptor global del informe semanal automático.
  REPORT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
