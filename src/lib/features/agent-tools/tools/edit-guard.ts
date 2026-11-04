import { tick } from 'svelte';
import { REVISION_PATTERN, splitExpectedRevision } from '../contract/revision';
import { failure, type AgentToolResult, type Parsed } from '../contract/types';
import { readProjectSnapshot } from './read-tools';

export const REVISION_PROPERTY = {
  type: 'string',
  pattern: REVISION_PATTERN.source,
  description:
    'Revision returned by inspect_project: the change is refused if the map changed since that reading.'
};

export const STALE_FAILURE = failure(
  'conflict',
  'The map changed while this change was prepared: call inspect_project again before retrying.'
);

/**
 * Writes only if the map is still as the agent read it, so that a change the
 * user makes while the tool awaits is never overwritten. Resolves to null,
 * without writing, when the map changed in between. A tool commits once,
 * after its last computation.
 */
export type Commit = <T>(write: () => T) => Promise<{ value: T } | null>;

/**
 * Parses the input, refuses a change made on a stale reading of the map,
 * applies the change and returns the new revision. What Khartis derives on
 * its own from the tool's writes, such as an automatic legend title or the
 * classes of an applied suggestion, belongs to that revision.
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

  const { expectedRevision } = split.value;
  if (readProjectSnapshot().revision !== expectedRevision) {
    return failure(
      'conflict',
      'The map changed since this revision was read: call inspect_project again before retrying.'
    );
  }
  const commit: Commit = async (write) => {
    if (readProjectSnapshot().revision !== expectedRevision) return null;
    const value = write();
    await tick();
    return { value };
  };

  const result = await apply(parsed.value, commit);
  if (!result.ok) return result;
  await tick();
  return {
    ok: true,
    data: { ...result.data, revision: readProjectSnapshot().revision }
  };
}
