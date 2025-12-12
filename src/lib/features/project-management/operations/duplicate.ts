import { sanitizeProjectName } from '$lib/features/commons/utils/sanitize.utils';
import type { KhartisProject } from '../types';

export function duplicateProject(
  original: KhartisProject,
  name: string
): KhartisProject {
  const clone = structuredClone(original);
  const now = new Date();
  const sanitizedName = sanitizeProjectName(name);

  return {
    ...clone,
    id: crypto.randomUUID(),
    manifest: {
      ...clone.manifest,
      name: sanitizedName,
      createdAt: now,
      updatedAt: now
    }
  };
}
