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

type Refusal = { ok: false; error: AgentToolError };

export type Parsed<T> = { ok: true; value: T } | Refusal;

export type AgentToolResult =
  { ok: true; data: Record<string, unknown> } | Refusal;

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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function invalidInput(message: string): Refusal {
  return { ok: false, error: { code: 'invalid_input', message } };
}

export function failure(
  code: Exclude<AgentToolErrorCode, 'invalid_input'>,
  message: string
): Refusal {
  return { ok: false, error: { code, message } };
}

export const NO_PROJECT = failure('unavailable', 'No project is open.');
