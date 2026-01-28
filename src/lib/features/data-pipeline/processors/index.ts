export {
  createCompanionFilesFromUpload,
  createFileFromUpload,
  createFileFromUploadContent,
  processFileInternal
} from './file-processor';
export type { ProcessFileOptions } from './file-processor';

export { processRemoteFile, processRemoteZipFile } from './remote-processor';

export { processZipFile } from './zip-processor';

export type {
  AnalysisResultForProcessor,
  DuckDBClient,
  FileProcessor,
  FileProcessorRegistration,
  ProcessContext,
  ProcessorCallbacks,
  ProcessorDataset
} from './file-processor.interface';

export {
  getProcessor,
  hasProcessor,
  registerProcessor
} from './processor-registry';

export { registerAllProcessors } from './register-processors';

export {
  csvProcessor,
  geojsonProcessor,
  geopackageProcessor,
  geoparquetProcessor,
  shapefileProcessor
} from './strategies';
