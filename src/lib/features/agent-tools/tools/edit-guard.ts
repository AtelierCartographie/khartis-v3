import { tick } from 'svelte';
import { splitExpectedRevision } from '../contract/revision';
import {
  invalidInput,
  type AgentToolErrorCode,
  type AgentToolResult,
  type Parsed
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
    'Revision returned by inspect_project: the change is refused if the map changed since that reading.'
};

export const STALE_FAILURE = failure(
  'conflict',
  'The map changed while this change was prepared: call inspect_project again before retrying.'
);

/**
 * Writes only if the map is still as the tool last saw it, so that a change
 * the user makes while the tool awaits is never overwritten. Resolves to
 * false, without writing, when the map changed in between. What Khartis
 * updates on its own right after the write, such as an automatic legend
 * title, belongs to the tool's change.
 */
export type Commit = (write: () => void) => Promise<boolean>;

/**
 * Takes into the tool's reading the work Khartis finishes on its own after
 * the tool's last write, such as the classes the panel computes for an
 * applied suggestion, so that the returned revision is not already stale.
 */
export type Settle = () => Promise<void>;

/**
 * Parses the input, refuses a change made without a reading of the map or
 * on a stale one, applies the change and returns the revision right after
 * the tool's own work: a later change by the user makes that revision stale.
 */
export async function runEdit<T>(
  input: unknown,
  parse: (input: unknown) => Parsed<T>,
  apply: (
    change: T,
    commit: Commit,
    settle: Settle
  ) => AgentToolResult | Promise<AgentToolResult>
): Promise<AgentToolResult> {
  const split = splitExpectedRevision(input);
  if (!split.ok) return split;
  const parsed = parse(split.value.input);
  if (!parsed.ok) return parsed;

  const { expectedRevision } = split.value;
  if (expectedRevision === undefined) {
    return invalidInput(
      'expected_revision is required: call inspect_project and pass its revision.'
    );
  }
  let known = readProjectSnapshot().revision;
  if (expectedRevision !== known) {
    return failure(
      'conflict',
      'The map changed since this revision was read: call inspect_project again before retrying.'
    );
  }

  let committed = false;
  const commit: Commit = async (write) => {
    if (readProjectSnapshot().revision !== known) return false;
    write();
    await tick();
    known = readProjectSnapshot().revision;
    committed = true;
    return true;
  };
  const settle: Settle = async () => {
    await tick();
    if (committed) known = readProjectSnapshot().revision;
  };

  const result = await apply(parsed.value, commit, settle);
  if (!result.ok) return result;
  if (!committed) await tick();
  return {
    ok: true,
    data: {
      ...result.data,
      revision: committed ? known : readProjectSnapshot().revision
    }
  };
}
