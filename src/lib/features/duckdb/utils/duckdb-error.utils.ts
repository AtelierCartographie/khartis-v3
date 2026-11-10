export function isMissingDuckTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Catalog Error:\s*Table with name .*?(does not exist|not found)/i.test(
      error.message
    )
  );
}

export function isOutOfMemoryError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes('Out of Memory');
}
