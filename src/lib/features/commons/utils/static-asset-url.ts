import { asset } from '$app/paths';
import type { AssetPath } from '$app/types';

export function resolveStaticAssetUrl(path: string): string {
  const relativePath = path.replace(/^\/+/, '');

  if (typeof document !== 'undefined' && document.baseURI) {
    return new URL(relativePath, document.baseURI).toString();
  }

  return asset(relativePath as AssetPath);
}
