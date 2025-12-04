import type { KhartisProject } from '../types';
import { PROJECT_CONST } from '../constants';
import { serialize } from '../core/serializer';
import { bigIntReplacer } from '../utils/json-helpers';
import { compressData } from '$lib/features/commons/utils/compression.utils';

export async function exportProject(project: KhartisProject): Promise<Blob> {
  const serialized = await serialize(project);
  const payload = {
    ...serialized,
    exportDate: new Date().toISOString(),
    appVersion: PROJECT_CONST.APP_VERSION
  };

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  });
}

export async function createArchive(project: KhartisProject): Promise<Blob> {
  const serialized = await serialize(project);

  const archive = {
    manifest: {
      ...serialized.manifest,
      format: 'kh' as const,
      exportDate: new Date().toISOString()
    },
    data: serialized.data,
    visualization: serialized.visualization,
    layout: serialized.layout,
    resources: serialized.resources
  };

  const json = JSON.stringify(archive, bigIntReplacer);
  const compressed = await compressData(json);
  return new Blob([compressed], { type: 'application/octet-stream' });
}
