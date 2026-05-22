import { Duck } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';
import { isGeospatialFile } from '../constants';
import { detectFileFormat, generateTableName } from '../core/format-detector';
import { buildDatasetFromDuckTable } from '../operations/analysis';
import { normalizeFormattedNumericColumns } from '../operations/tabular-numeric-normalization';
import { applyTabularGeoDetection } from './tabular-geo-detection';
import type { DatasetResult, ZipDatasetResult } from '../types';
import { processZipFile } from './zip-processor';
import { isZipArchiveName } from '../utils/zip-handler';
import { MIME } from '$lib/features/commons/constants';

export async function processRemoteFile(
  url: string,
  options: { tableName?: string; decimalSeparator?: string } = {}
): Promise<DatasetResult | ZipDatasetResult> {
  const { tableName: providedTableName, decimalSeparator } = options;
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
    throw new Error(m.pipeline_error_shp_standalone());
  }

  const tableName = providedTableName ?? generateTableName(filename);
  const format = detectFileFormat(filename);
  await Duck.read_link(url, {
    tablename: tableName,
    decimal_separator: decimalSeparator
  });

  if (!isGeospatialFile(filename) && format === 'csv') {
    await normalizeFormattedNumericColumns(tableName, Duck);
  }

  const dataset = await buildDatasetFromDuckTable({
    file: { name: filename, size: 0, type: MIME.BINARY },
    tableName,
    isGeoFile: isGeospatialFile(filename),
    format
  });

  await applyTabularGeoDetection(dataset);

  dataset.sourceFileId = url;
  dataset.name = filename;
  return dataset;
}

export async function processRemoteZipFile(
  url: string
): Promise<DatasetResult | ZipDatasetResult> {
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
  const filename = url.split('/').pop() || m.remote_zip_default_name();
  const file = new File([arrayBuffer], filename, { type: MIME.ZIP });
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
