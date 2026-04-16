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
        ...rest
      } = file;
      return rest;
    })
  };

  return clone;
}

export function estimateProjectStorageSize(project: unknown): number {
  let binarySize = 0;

  if (project && typeof project === 'object') {
    const data = (project as Record<string, unknown>).data as
      | Record<string, unknown>
      | undefined;
    const sourceFiles = data?.sourceFiles;
    if (Array.isArray(sourceFiles)) {
      for (const file of sourceFiles) {
        if (file.content instanceof ArrayBuffer) {
          binarySize += file.content.byteLength;
        } else if (typeof file.content === 'string') {
          binarySize += file.content.length * 2;
        }

        if (
          file.relatedFilesData &&
          typeof file.relatedFilesData === 'object'
        ) {
          for (const buffer of Object.values(
            file.relatedFilesData as Record<string, unknown>
          )) {
            if (buffer instanceof ArrayBuffer) {
              binarySize += (buffer as ArrayBuffer).byteLength;
            }
          }
        }

        if (typeof file.preparedGeoJSON === 'string') {
          binarySize += (file.preparedGeoJSON as string).length * 2;
        }
      }
    }
  }

  const stripped = stripBinaryFields(project);
  const metadataSize = new Blob([JSON.stringify(stripped, bigIntReplacer)])
    .size;

  return binarySize + metadataSize;
}
