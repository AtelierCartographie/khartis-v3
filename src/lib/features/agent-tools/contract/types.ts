export type AgentToolErrorCode =
  'invalid_input' | 'not_found' | 'unsupported' | 'unavailable' | 'conflict';

/** What a column measures, in the words the agent reads. */
export type ColumnNature =
  | 'count'
  | 'ratio'
  | 'category'
  | 'ordered_category'
  | 'label'
  | 'place_id'
  | 'latitude'
  | 'longitude';

export interface AgentToolError {
  code: AgentToolErrorCode;
  message: string;
}

export type Parsed<T> =
  { ok: true; value: T } | { ok: false; error: AgentToolError };

export type AgentToolResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: AgentToolError };

export interface AgentToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface AgentTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: AgentToolAnnotations;
  execute: (input: unknown) => Promise<AgentToolResult>;
}

export function invalidInput(message: string): {
  ok: false;
  error: AgentToolError;
} {
  return { ok: false, error: { code: 'invalid_input', message } };
}
