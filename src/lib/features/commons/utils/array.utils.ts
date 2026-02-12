/**
 * Array utility functions
 *
 * Common operations for working with typed arrays and collections.
 */

/**
 * Combines multiple Uint8Array chunks into a single contiguous Uint8Array
 *
 * @param chunks - Array of Uint8Array chunks to combine
 * @returns Single Uint8Array containing all chunks concatenated
 */
export function combineUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
