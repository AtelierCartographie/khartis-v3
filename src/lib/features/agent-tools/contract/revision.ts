import { invalidInput, type Parsed } from './types';

const REVISION_PATTERN = /^[0-9a-f]{8}$/;

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

/** Takes the optional `expected_revision` out of a tool input. */
export function splitExpectedRevision(
  input: unknown
): Parsed<{ input: unknown; expectedRevision?: string }> {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    !('expected_revision' in input)
  ) {
    return { ok: true, value: { input } };
  }
  const { expected_revision: expectedRevision, ...rest } = input as Record<
    string,
    unknown
  >;
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
