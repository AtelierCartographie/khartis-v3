import { deepClone } from '$lib/features/commons/utils/clone.utils';
import { sanitizeProjectName } from '$lib/features/commons/utils/sanitize.utils';
import { PROJECT_CONST } from '../constants';
import type { KhartisProject } from '../types';

export function duplicateProject(
  original: KhartisProject,
  name: string
): KhartisProject {
  const clone = deepClone(original);
  const now = new Date();
  const sanitizedName = sanitizeProjectName(name);

  return {
    ...clone,
    id: crypto.randomUUID(),
    manifest: {
      ...clone.manifest,
      version: PROJECT_CONST.APP_VERSION,
      name: sanitizedName,
      createdAt: now,
      updatedAt: now
    }
  };
}
