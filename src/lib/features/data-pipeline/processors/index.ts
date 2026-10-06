export {
  createCompanionFilesFromUpload,
  createFileFromUpload,
  createFileFromUploadContent,
  processFileInternal,
  readFileIntoTable
} from './file-processor';

export type { FileTableRead } from './file-processor';

export { processRemoteFile, processRemoteZipFile } from './remote-processor';

export { processZipFile } from './zip-processor';

export type { ProcessContext } from './file-processor.interface';

export { getProcessor } from './processor-registry';

export { registerAllProcessors } from './register-processors';
