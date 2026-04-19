import { bigIntReplacer } from './clone.utils';

function stripBinaryFields(project: unknown): unknown {
  if (!project || typeof project !== 'object') return project;

  const clone = { ...(project as Record<string, unknown>) };
  const data = clone.data as Record<string, unknown> | undefined;
  if (!data?.sourceFiles || !Array.isArray(data.sourceFiles)) return clone;

  clone.data = {
    ...data,
    sourceFiles: data.sourceFiles.map((file: Record<string, unknown>) => {
      const {
        content: _content,
        relatedFilesData: _relatedFilesData,
        preparedGeoJSON: _preparedGeoJSON,
        originalFile: _originalFile,
        relatedFileObjects: _relatedFileObjects,
        ...rest
      } = file;
      return rest;
    })
  };

  return clone;
}

export function estimateProjectStorageSize(project: unknown): number {
  const stripped = stripBinaryFields(project);
  return new Blob([JSON.stringify(stripped, bigIntReplacer)]).size;
}
