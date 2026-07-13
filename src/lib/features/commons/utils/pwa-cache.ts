export function resolvePwaScopeUrl(baseUri: string): string {
  return new URL('.', baseUri).href;
}

export function createPwaCachePrefix(scopeUrl: string): string {
  const scopePath = new URL(scopeUrl).pathname.replace(/\/+$/, '') || '/';
  return `khartis:${encodeURIComponent(scopePath)}:`;
}

export function isPwaCacheForScope(
  cacheName: string,
  scopeUrl: string
): boolean {
  return cacheName.startsWith(createPwaCachePrefix(scopeUrl));
}
