import { sanitizeProjectName } from '$lib/features/commons/utils/sanitize.utils';
import type { SerializedProject } from '$lib/types/serialization.types';
import { PROJECT_CONST } from '../constants';

export function duplicateProject(
  original: SerializedProject,
  name: string
): SerializedProject {
  const clone = structuredClone(original);
  const now = new Date().toISOString();
  const sanitizedName = sanitizeProjectName(name);

  return {
    ...clone,
    id: crypto.randomUUID(),
    manifest: {
      ...clone.manifest,
      version: PROJECT_CONST.SCHEMA_VERSION,
      name: sanitizedName,
      createdAt: now,
      updatedAt: now
    }
  };
}
