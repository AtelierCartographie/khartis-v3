/**
 * Simple CSV Parser Worker for Vite
 * Uses Web Worker API directly without complex abstractions
 */

import Papa from 'papaparse';

// Listen for messages from the main thread
self.addEventListener('message', async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  if (type !== 'parse-csv') {
    self.postMessage({
      id,
      type: 'error',
      error: 'Unknown message type'
    });
    return;
  }

  try {
    const { fileData, options = {} } = payload;

    // Convert ArrayBuffer to string if needed
    let dataToparse: string;
    if (fileData instanceof ArrayBuffer) {
      const decoder = new TextDecoder(options.encoding || 'utf-8');
      dataToparse = decoder.decode(fileData);
    } else {
      dataToparse = fileData;
    }

    // Parse CSV
    const results = Papa.parse(dataToparse, {
      header: false,
      skipEmptyLines: options.skipEmptyLines !== false,
      delimiter: options.delimiter,
      preview: options.preview,
      dynamicTyping: false,
      fastMode: true
    });

    if (results.errors.length > 0) {
      const criticalErrors = results.errors.filter(
        (err: any) => err.type === 'Quotes' || err.type === 'FieldMismatch'
      );

      if (criticalErrors.length > 0) {
        throw new Error(`CSV parsing errors: ${criticalErrors.map((e: any) => e.message).join(', ')}`);
      }
    }

    // Process results
    const allRows = results.data as unknown[][];
    let headers: string[] = [];
    let dataRows: unknown[][] = [];

    if (allRows.length > 0) {
      // Check if first row looks like headers
      const firstRow = allRows[0] as unknown[];
      const hasHeaders = options.header !== false && looksLikeHeaders(firstRow);

      if (hasHeaders) {
        headers = firstRow.map(String);
        dataRows = allRows.slice(1);
      } else {
        headers = firstRow.map((_, index) => `column_${index + 1}`);
        dataRows = allRows;
      }

      // Apply preview limit
      if (options.preview && dataRows.length > options.preview) {
        dataRows = dataRows.slice(0, options.preview);
      }
    }

    // Send success response
    self.postMessage({
      id,
      type: 'success',
      payload: {
        headers,
        rows: dataRows,
        rowCount: dataRows.length,
        metadata: {
          delimiter: results.meta.delimiter || ',',
          linebreak: results.meta.linebreak || '\n',
          aborted: false,
          truncated: false
        }
      }
    });
  } catch (error) {
    // Send error response
    self.postMessage({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Failed to parse CSV'
    });
  }
});

function looksLikeHeaders(row: unknown[]): boolean {
  if (!row || row.length === 0) return false;

  // Check if all values are strings and not numbers
  const allStrings = row.every(val => {
    if (val === null || val === undefined || val === '') return false;
    const str = String(val).trim();
    return isNaN(Number(str)) || str.length === 0;
  });

  return allStrings;
}