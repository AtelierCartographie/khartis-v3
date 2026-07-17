import * as m from '$lib/paraglide/messages';
import type { DatasetResult, ZipDatasetResult } from '../types';
import { processFileInternal } from './file-processor';
import { processZipFile } from './zip-processor';
import { isZipArchiveName } from '../utils/zip-handler';
import { MIME } from '$lib/features/commons/constants';
import { FileType } from '$lib/features/commons/utils/file-import.utils';
import {
  ParseError,
  PipelineError
} from '$lib/features/commons/pipeline.errors';
import {
  FetchTimeoutError,
  REMOTE_FILE_FETCH_TIMEOUT_MS,
  fetchWithTimeout
} from '$lib/features/commons/utils/fetch-with-timeout';

const REMOTE_FILE_FETCH_ERROR_CODE = 'REMOTE_FILE_FETCH_FAILED';
const REMOTE_FILE_DOWNLOAD_TIMEOUT_ERROR_CODE = 'REMOTE_FILE_DOWNLOAD_TIMEOUT';

async function downloadRemoteFile(
  url: string,
  filename: string,
  fallbackMimeType: string
): Promise<File> {
  try {
    return await fetchWithTimeout(
      url,
      async (response) => {
        if (!response.ok) {
          throw new PipelineError(
            m.pipeline_error_fetch_failed({
              status: String(response.status),
              statusText: response.statusText
            }),
            REMOTE_FILE_FETCH_ERROR_CODE,
            {
              status: response.status,
              statusText: response.statusText,
              url
            }
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        return new File([arrayBuffer], filename, {
          type: response.headers.get('content-type') ?? fallbackMimeType
        });
      },
      REMOTE_FILE_FETCH_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      throw new PipelineError(
        m.error_download_timeout(),
        REMOTE_FILE_DOWNLOAD_TIMEOUT_ERROR_CODE,
        {
          timeoutMs: error.timeoutMs,
          url
        }
      );
    }

    throw error;
  }
}

export async function processRemoteFile(
  url: string
): Promise<DatasetResult | ZipDatasetResult> {
  let filename: string;
  try {
    filename =
      new URL(url).pathname.split('/').pop() || m.remote_file_default_name();
  } catch {
    filename = url.split('/').pop() || m.remote_file_default_name();
  }

  if (isZipArchiveName(filename)) {
    return processRemoteZipFile(url);
  }

  if (filename.toLowerCase().endsWith('.shp')) {
    throw new ParseError(
      m.pipeline_error_shp_standalone(),
      FileType.SHAPEFILE,
      {
        fileName: filename,
        url
      }
    );
  }

  const file = await downloadRemoteFile(url, filename, MIME.BINARY);
  const dataset = await processFileInternal(file, { originalName: filename });

  dataset.sourceFileId = url;
  dataset.name = filename;
  return dataset;
}

export async function processRemoteZipFile(
  url: string
): Promise<DatasetResult | ZipDatasetResult> {
  const filename = url.split('/').pop() || m.remote_zip_default_name();
  const file = await downloadRemoteFile(url, filename, MIME.ZIP);
  const result = await processZipFile(file);

  if ('datasets' in result) {
    for (const dataset of result.datasets) {
      dataset.sourceFileId = url;
    }
    return result;
  }

  result.sourceFileId = url;
  return result;
}
