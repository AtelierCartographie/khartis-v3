import { MIME } from '$lib/features/commons/constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';
import { isGeospatialFile } from '../constants';
import { detectFileFormat, generateTableName } from '../core/format-detector';
import { buildDatasetFromDuckTable } from '../operations/analysis';
import type {
  DatasetResult,
  PipelineContext,
  ZipDatasetResult
} from '../types';
import { processZipFile } from './zip-processor';

export async function processRemoteFile(
  ctx: PipelineContext,
  url: string,
  options: { tableName?: string; decimalSeparator?: string } = {}
): Promise<DatasetResult | ZipDatasetResult> {
  const { tableName: providedTableName, decimalSeparator } = options;
  let filename: string;
  try {
    filename = new URL(url).pathname.split('/').pop() || 'remote_file';
  } catch {
    filename = url.split('/').pop() || 'remote_file';
  }

  if (filename.toLowerCase().endsWith('.zip')) {
    return processRemoteZipFile(ctx, url);
  }

  if (filename.toLowerCase().endsWith('.shp')) {
    throw new Error(m.pipeline_error_shp_standalone());
  }

  const tableName = providedTableName ?? generateTableName(filename);
  await Duck.read_link(url, {
    tablename: tableName,
    decimal_separator: decimalSeparator
  });

  const dataset = await buildDatasetFromDuckTable(ctx, {
    file: { name: filename, size: 0, type: MIME.BINARY },
    tableName,
    isGeoFile: isGeospatialFile(filename),
    format: detectFileFormat(filename)
  });

  dataset.sourceFileId = url;
  dataset.name = filename;
  return dataset;
}

export async function processRemoteZipFile(
  ctx: PipelineContext,
  url: string
): Promise<DatasetResult | ZipDatasetResult> {
  const start = performance.now();

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        m.pipeline_error_fetch_failed({
          status: String(response.status),
          statusText: response.statusText
        })
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const filename = url.split('/').pop() || 'remote.zip';
    const file = new File([arrayBuffer], filename, { type: MIME.ZIP });
    const result = await processZipFile(ctx, file);

    if ('datasets' in result) {
      for (const dataset of result.datasets) {
        dataset.sourceFileId = url;
      }
      logger.success(
        'Remote MIME.ZIP archive processed (multi)',
        LogCategory.DATA,
        {
          url,
          datasetCount: result.datasets.length,
          durationMs: (performance.now() - start).toFixed(2)
        }
      );
      return result;
    }

    result.sourceFileId = url;
    logger.success('Remote MIME.ZIP archive processed', LogCategory.DATA, {
      url,
      datasetId: result.id,
      durationMs: (performance.now() - start).toFixed(2)
    });
    return result;
  } catch (error) {
    logger.error(
      'Failed to process remote MIME.ZIP archive',
      LogCategory.DATA,
      {
        url,
        error
      }
    );
    throw error;
  }
}
