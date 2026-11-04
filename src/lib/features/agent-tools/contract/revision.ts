import { invalidInput, isRecord, type Parsed } from './types';

export const REVISION_PATTERN = /^[0-9a-f]{8}$/;

/**
 * Fingerprint of what the agent read about the map. Moving between steps
 * leaves it unchanged; a change to a visualization, a text or a legend
 * gives a new one.
 */
export function computeRevision(value: unknown): string {
  const text = JSON.stringify(value) ?? '';
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Takes `expected_revision` out of a tool input. Every change needs it: a
 * change prepared without reading the map, or on a stale reading, is refused.
 */
export function splitExpectedRevision(
  input: unknown
): Parsed<{ input: Record<string, unknown>; expectedRevision: string }> {
  if (!isRecord(input)) return invalidInput('Expected an object.');
  const { expected_revision: expectedRevision, ...rest } = input;
  if (expectedRevision === undefined) {
    return invalidInput(
      'expected_revision is required: call inspect_project and pass its revision.'
    );
  }
  if (
    typeof expectedRevision !== 'string' ||
    !REVISION_PATTERN.test(expectedRevision)
  ) {
    return invalidInput(
      'expected_revision must be the revision returned by inspect_project.'
    );
  }
  return { ok: true, value: { input: rest, expectedRevision } };
}
