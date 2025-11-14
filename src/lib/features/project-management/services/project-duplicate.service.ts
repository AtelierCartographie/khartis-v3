import type { KhartisProject } from '../models/project';
import { ProjectValidator } from '$lib/features/commons/utils/validation.utils';

export function duplicateProject(
  original: KhartisProject,
  name: string
): KhartisProject {
  const clone = structuredClone(original);
  const now = new Date();
  const sanitizedName = ProjectValidator.sanitizeProjectName(name);

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
