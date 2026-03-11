import { asset } from '$app/paths';
import type { Asset } from '$app/types';

const LEADING_SLASH = '/';

export function resolveStaticAssetUrl(path: `/${string}` | string): string {
  const normalizedPath = path.startsWith(LEADING_SLASH)
    ? path
    : `${LEADING_SLASH}${path}`;

  if (typeof document !== 'undefined' && document.baseURI) {
    return new URL(normalizedPath.slice(1), document.baseURI).toString();
  }

  return asset(normalizedPath as Asset);
}
