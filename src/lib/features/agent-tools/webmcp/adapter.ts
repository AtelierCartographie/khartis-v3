import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { AgentTool, AgentToolResult } from '../contract/types';

/**
 * WebMCP (W3C community group draft, Chrome behind `--enable-features=WebMCP`)
 * lets the agent driving the browser call these tools. The browser
 * serializes what `execute` returns to JSON for the agent.
 */
interface WebMcpToolDescriptor {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: AgentTool['annotations'];
  execute: (input: unknown) => Promise<AgentToolResult>;
}

interface ModelContext {
  // A promise in the current draft, rejected for a duplicate or invalid tool.
  registerTool: (
    tool: WebMcpToolDescriptor,
    options: { signal: AbortSignal }
  ) => Promise<void> | void;
}

function getModelContext(): ModelContext | null {
  const candidate: unknown = (document as Document & { modelContext?: unknown })
    .modelContext;
  if (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as Partial<ModelContext>).registerTool === 'function'
  ) {
    return candidate as ModelContext;
  }
  return null;
}

async function runTool(
  tool: AgentTool,
  input: unknown
): Promise<AgentToolResult> {
  try {
    const result = await tool.execute(input ?? {});
    if (!result.ok) {
      logger.warn('Agent tool refused a call', LogCategory.SYSTEM, {
        tool: tool.name,
        code: result.error.code
      });
    }
    return result;
  } catch (error) {
    logger.error('Agent tool failed', LogCategory.SYSTEM, error);
    return {
      ok: false,
      error: {
        code: 'unavailable',
        message: 'Khartis could not run this tool.'
      }
    };
  }
}

/** Registers the tools; the returned function unregisters them. */
export function registerAgentTools(tools: readonly AgentTool[]): () => void {
  const controller = new AbortController();
  const modelContext = getModelContext();

  if (modelContext) {
    const registrations = tools.map(async (tool) =>
      modelContext.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: (input) => runTool(tool, input)
        },
        { signal: controller.signal }
      )
    );
    // All the tools or none, as Chrome advises: a partial set misleads agents.
    void Promise.allSettled(registrations).then((results) => {
      const refused = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected'
      );
      if (refused.length === 0) return;
      controller.abort();
      logger.warn('WebMCP refused the agent tools', LogCategory.SYSTEM, {
        refused: refused.length,
        error: refused[0].reason
      });
    });
  }

  if (import.meta.env.DEV) {
    window.__khartisAgentTools = {
      list: () => tools.map((tool) => tool.name),
      call: (name, input) => {
        const tool = tools.find((candidate) => candidate.name === name);
        return tool
          ? runTool(tool, input)
          : Promise.resolve({
              ok: false,
              error: { code: 'not_found', message: `No tool named ${name}.` }
            });
      }
    };
  }

  return () => {
    controller.abort();
    if (import.meta.env.DEV) {
      delete window.__khartisAgentTools;
    }
  };
}
