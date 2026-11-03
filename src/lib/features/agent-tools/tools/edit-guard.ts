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

export const STALE_FAILURE = failure(
  'conflict',
  'The map changed while this change was prepared: call inspect_project again before retrying.'
);

/**
 * Writes only if the map is still as the tool last saw it, so that a change
 * the user makes while the tool awaits is never overwritten. Returns false,
 * without writing, when the map changed in between.
 */
export type Commit = (write: () => void) => boolean;

/**
 * Parses the input, refuses a change made on a stale reading of the map,
 * applies the change and returns the revision right after the tool's own
 * writes: a later change by the user makes that revision stale.
 */
export async function runEdit<T>(
  input: unknown,
  parse: (input: unknown) => Parsed<T>,
  apply: (
    change: T,
    commit: Commit
  ) => AgentToolResult | Promise<AgentToolResult>
): Promise<AgentToolResult> {
  const split = splitExpectedRevision(input);
  if (!split.ok) return split;
  const parsed = parse(split.value.input);
  if (!parsed.ok) return parsed;

  let known = readProjectSnapshot().revision;
  const { expectedRevision } = split.value;
  if (expectedRevision !== undefined && expectedRevision !== known) {
    return failure(
      'conflict',
      'The map changed since this revision was read: call inspect_project again before retrying.'
    );
  }

  let committed = false;
  const commit: Commit = (write) => {
    if (readProjectSnapshot().revision !== known) return false;
    write();
    known = readProjectSnapshot().revision;
    committed = true;
    return true;
  };

  const result = await apply(parsed.value, commit);
  return result.ok
    ? {
        ok: true,
        data: {
          ...result.data,
          revision: committed ? known : readProjectSnapshot().revision
        }
      }
    : result;
}
