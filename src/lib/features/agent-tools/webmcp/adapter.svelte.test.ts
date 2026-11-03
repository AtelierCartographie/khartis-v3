// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentTool } from '../contract/types';
import { registerAgentTools } from './adapter';

type DocumentWithModelContext = Document & { modelContext?: unknown };

function tool(name: string): AgentTool {
  return {
    name,
    title: name,
    description: `Tool ${name}.`,
    inputSchema: { type: 'object', properties: {} },
    annotations: {},
    execute: async () => ({ ok: true, data: {} })
  };
}

describe('agent tools registration', () => {
  afterEach(() => {
    delete (document as DocumentWithModelContext).modelContext;
  });

  it('should withdraw every tool when the browser refuses one of them', async () => {
    const signals: AbortSignal[] = [];
    (document as DocumentWithModelContext).modelContext = {
      registerTool: (
        descriptor: { name: string },
        options: { signal: AbortSignal }
      ) => {
        signals.push(options.signal);
        return descriptor.name === 'second'
          ? Promise.reject(
              new DOMException('Duplicate tool name', 'InvalidStateError')
            )
          : Promise.resolve();
      }
    };

    const stop = registerAgentTools([tool('first'), tool('second')]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    stop();
  });
});
