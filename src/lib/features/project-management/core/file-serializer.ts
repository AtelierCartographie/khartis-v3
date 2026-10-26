import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import type { SerializedUploadedFile } from '$lib/types/serialization.types';

export function serializeUploadedFile(
  file: UploadedFile
): SerializedUploadedFile {
  const serialized = {
    id: file.id,
    name: file.name,
    size: file.size,
    type: file.type,
    fileType: file.fileType,
    status: file.status,
    errorMessage: file.errorMessage,
    validation: file.validation,
    sourceType: file.sourceType,
    relatedFiles: file.relatedFiles,
    assetRef: file.assetRef,
    companionAssetRefs: file.companionAssetRefs,
    uploadProgress: file.uploadProgress
  } as SerializedUploadedFile;

  if (file.enrichmentSnapshot) {
    serialized.enrichmentSnapshot = file.enrichmentSnapshot;
  }

  if (
    file.joinedColumnOrigins &&
    Object.keys(file.joinedColumnOrigins).length > 0
  ) {
    serialized.joinedColumnOrigins = file.joinedColumnOrigins;
  }

  if (file.attachedTo) {
    serialized.attachedTo = file.attachedTo;
  }

  if (file.statistics) {
    serialized.statistics = file.statistics;
  }

  if (file.columnTransformations && file.columnTransformations.length > 0) {
    serialized.columnTransformations = file.columnTransformations;
  }

  if (file.deletedRowIds && file.deletedRowIds.length > 0) {
    serialized.deletedRowIds = file.deletedRowIds;
  }

  if (file.csvOptions) {
    serialized.csvOptions = file.csvOptions;
  }

  if (file.sourceArchive) {
    serialized.sourceArchive = file.sourceArchive;
  }

  if (file.duckdbTableName) {
    serialized.duckdbTableName = file.duckdbTableName;
  }

  if (file.datasetId) {
    serialized.datasetId = file.datasetId;
  }

  return serialized;
}

function parseJoinedColumnOrigins(
  value: unknown
): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseDatasetAttachment(
  value: unknown
): UploadedFile['attachedTo'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { sourceFileId, datasetName } = value as Record<string, unknown>;
  return typeof sourceFileId === 'string' && typeof datasetName === 'string'
    ? { sourceFileId, datasetName }
    : undefined;
}

export function deserializeUploadedFile(
  data: SerializedUploadedFile
): UploadedFile {
  const file = {
    id: data.id,
    name: data.name,
    size: data.size,
    type: data.type,
    fileType: data.fileType as UploadedFile['fileType'],
    status: data.status as UploadedFile['status'],
    errorMessage: data.errorMessage,
    validation: data.validation as UploadedFile['validation'],
    sourceType: data.sourceType as UploadedFile['sourceType'],
    relatedFiles: data.relatedFiles,
    assetRef: data.assetRef,
    companionAssetRefs: data.companionAssetRefs,
    uploadProgress: data.uploadProgress
  } as UploadedFile;

  if (data.enrichmentSnapshot) {
    file.enrichmentSnapshot = data.enrichmentSnapshot;
  }

  const joinedColumnOrigins = parseJoinedColumnOrigins(
    data.joinedColumnOrigins
  );
  if (joinedColumnOrigins) {
    file.joinedColumnOrigins = joinedColumnOrigins;
  }

  const attachedTo = parseDatasetAttachment(data.attachedTo);
  if (attachedTo) {
    file.attachedTo = attachedTo;
  }

  if (data.statistics) {
    file.statistics = data.statistics as UploadedFile['statistics'];
  }

  if (data.columnTransformations) {
    file.columnTransformations = data.columnTransformations;
  }

  if (data.deletedRowIds) {
    file.deletedRowIds = data.deletedRowIds;
  }

  const csvOptions = parseCsvOptions(data.csvOptions);
  if (csvOptions) {
    file.csvOptions = csvOptions;
  }

  if (data.joinedBasemap) {
    file.joinedBasemap = data.joinedBasemap;
  }
  if (data.geoColumn) {
    file.geoColumn = data.geoColumn;
  }
  if (data.gpsMode) {
    file.gpsMode = data.gpsMode;
  }
  if (data.gpsColumns) {
    file.gpsColumns = data.gpsColumns;
  }
  if (data.joinCorrections) {
    file.joinCorrections = data.joinCorrections;
  }
  if (data.sourceArchive) {
    file.sourceArchive = data.sourceArchive;
  }
  if (data.duckdbTableName) {
    file.duckdbTableName = data.duckdbTableName;
  }
  if (data.datasetId) {
    file.datasetId = data.datasetId;
  }

  return file as UploadedFile;
}

function parseCsvOptions(value: unknown): UploadedFile['csvOptions'] {
  if (!value || typeof value !== 'object') return undefined;
  const { header, decimalSeparator, thousandsSeparator, delimiter } =
    value as Record<string, unknown>;
  if (typeof header !== 'boolean' || typeof decimalSeparator !== 'string') {
    return undefined;
  }
  return {
    header,
    decimalSeparator,
    thousandsSeparator:
      typeof thousandsSeparator === 'string' ? thousandsSeparator : undefined,
    delimiter: typeof delimiter === 'string' ? delimiter : undefined
  };
}
