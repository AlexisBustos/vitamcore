/**
 * Factory del proveedor de agente.
 * Selecciona Anthropic (Claude) o el motor heurístico según la configuración.
 */
import { env } from '../../../config/env';
import { AnthropicProvider } from './anthropic';
import { HeuristicProvider } from './heuristic';
import type { AgentProvider } from './types';

let cached: AgentProvider | null = null;

export function getProvider(): AgentProvider {
  if (cached) return cached;

  // Solo se usa Anthropic si está configurado y hay API key.
  if (env.AGENT_PROVIDER === 'anthropic' && env.AGENT_API_KEY) {
    cached = new AnthropicProvider();
  } else {
    cached = new HeuristicProvider();
  }
  return cached;
}

export function isAgentEnabled(): boolean {
  return env.AGENT_ENABLED;
}

export function providerName(): string {
  return env.AGENT_PROVIDER === 'anthropic' && env.AGENT_API_KEY
    ? 'anthropic'
    : 'heuristic';
}
