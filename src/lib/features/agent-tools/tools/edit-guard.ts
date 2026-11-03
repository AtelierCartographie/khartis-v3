import { splitExpectedRevision } from '../contract/revision';
import type {
  AgentToolErrorCode,
  AgentToolResult,
  Parsed
} from '../contract/types';
import { readProjectSnapshot } from './read-tools';

export function failure(
  code: Exclude<AgentToolErrorCode, 'invalid_input'>,
  message: string
): AgentToolResult {
  return { ok: false, error: { code, message } };
}

export const REVISION_PROPERTY = {
  type: 'string',
  pattern: '^[0-9a-f]{8}$',
  description:
    'Revision returned by inspect_project. When given, the change is refused if the map changed since that reading.'
};

/**
 * Parses the input, refuses a change made on a stale reading of the map,
 * applies the change and returns the new revision.
 */
export async function runEdit<T>(
  input: unknown,
  parse: (input: unknown) => Parsed<T>,
  apply: (change: T) => AgentToolResult | Promise<AgentToolResult>
): Promise<AgentToolResult> {
  const split = splitExpectedRevision(input);
  if (!split.ok) return split;
  const parsed = parse(split.value.input);
  if (!parsed.ok) return parsed;

  const { expectedRevision } = split.value;
  if (
    expectedRevision !== undefined &&
    expectedRevision !== readProjectSnapshot().revision
  ) {
    return failure(
      'conflict',
      'The map changed since this revision was read: call inspect_project again before retrying.'
    );
  }

  const result = await apply(parsed.value);
  return result.ok
    ? {
        ok: true,
        data: { ...result.data, revision: readProjectSnapshot().revision }
      }
    : result;
}
