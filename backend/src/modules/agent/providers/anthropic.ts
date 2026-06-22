/**
 * Proveedor Anthropic (Claude) del Agent Layer.
 *
 * Ejecuta un loop de tool-use: el modelo decide qué herramientas internas
 * usar, el backend las ejecuta y devuelve resultados, hasta la respuesta final.
 * La API key vive solo en el backend (config/env); nunca llega al frontend.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../../config/env';
import { AGENT_FOCUS, SYSTEM_PROMPT } from '../prompt';
import { findTool, getAvailableTools, type ToolContext } from '../tools';
import type { AgentProvider, AgentRunInput, AgentRunResult } from './types';

const MAX_TURNS = 8;

export class AnthropicProvider implements AgentProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.AGENT_API_KEY });
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const ctx: ToolContext = {
      agentType: input.agentType,
      organizationId: input.organizationId,
      projectId: input.projectId,
    };

    const tools = getAvailableTools(input.allowWrite).map((t) => t.def);
    const system = `${SYSTEM_PROMPT}\n\n${AGENT_FOCUS[input.agentType] ?? ''}${
      input.organizationId
        ? `\n\nContexto: la consulta está acotada a la empresa ${input.organizationId}.`
        : ''
    }`;

    const messages: Anthropic.MessageParam[] = [
      ...(input.history ?? []).map((h) => ({
        role: (h.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: input.message },
    ];

    const toolsUsed: string[] = [];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await this.client.messages.create({
        model: env.AGENT_MODEL,
        max_tokens: 4096,
        system,
        tools,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return {
          content: text || 'Sin respuesta del modelo.',
          toolsUsed: [...new Set(toolsUsed)],
          provider: this.name,
        };
      }

      // Ejecuta todas las tools solicitadas y devuelve los resultados juntos.
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        toolsUsed.push(use.name);
        const tool = findTool(use.name);
        try {
          if (!tool) throw new Error(`Tool desconocida: ${use.name}`);
          const data = await tool.handler(
            use.input as Record<string, any>,
            ctx,
          );
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: JSON.stringify(data).slice(0, 60000),
          });
        } catch (err) {
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: true,
            content: err instanceof Error ? err.message : 'Error de herramienta',
          });
        }
      }
      messages.push({ role: 'user', content: results });
    }

    return {
      content:
        'El análisis alcanzó el límite de pasos sin converger. Intenta acotar la consulta.',
      toolsUsed: [...new Set(toolsUsed)],
      provider: this.name,
    };
  }
}
