/**
 * CSV Worker Service - Vite Compatible
 * Simple service for CSV parsing using Web Workers
 */

import type { RawDataset } from '$lib/features/data-pipeline/models/raw-dataset';
import { ColumnType } from '$lib/features/data-pipeline/models/column-type';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

// Vite-specific worker import
// This will be processed by Vite to create a proper worker
import CSVWorker from './csv-parser-simple.worker?worker';

export interface CSVWorkerOptions {
  delimiter?: string;
  preview?: number;
  encoding?: string;
  header?: boolean;
  skipEmptyLines?: boolean;
  onProgress?: (progress: number) => void;
}

export class CSVWorkerService {
  private static instance: CSVWorkerService;
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    onProgress?: (progress: number) => void;
  }>();

  private constructor() {
    this.initializeWorker();
  }

  public static getInstance(): CSVWorkerService {
    if (!CSVWorkerService.instance) {
      CSVWorkerService.instance = new CSVWorkerService();
    }
    return CSVWorkerService.instance;
  }

  private initializeWorker(): void {
    try {
      // Create worker using Vite's worker import
      this.worker = new CSVWorker();

      // Set up message handler
      this.worker.addEventListener('message', (event: MessageEvent) => {
        this.handleWorkerMessage(event);
      });

      // Set up error handler
      this.worker.addEventListener('error', (error: ErrorEvent) => {
        this.handleWorkerError(error);
      });

      logger.debug('CSV Worker initialized', LogCategory.DATA);
    } catch (error) {
      logger.error('Failed to initialize CSV Worker', LogCategory.DATA, { error });
      this.worker = null;
    }
  }

  private handleWorkerMessage(event: MessageEvent): void {
    const { id, type, payload, error, progress } = event.data;

    const pending = this.pendingRequests.get(id);
    if (!pending) {
      logger.warn('Received response for unknown request', LogCategory.DATA, { id });
      return;
    }

    switch (type) {
      case 'success':
        pending.resolve(payload);
        this.pendingRequests.delete(id);
        break;

      case 'error':
        pending.reject(new Error(error || 'Unknown worker error'));
        this.pendingRequests.delete(id);
        break;

      case 'progress':
        if (pending.onProgress) {
          pending.onProgress(progress);
        }
        break;
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    logger.error('Worker error', LogCategory.DATA, { error: error.message });

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error(`Worker crashed: ${error.message}`));
    }
    this.pendingRequests.clear();

    // Try to restart the worker
    this.worker?.terminate();
    this.worker = null;
    this.initializeWorker();
  }

  /**
   * Parse a CSV file using Web Worker
   */
  public async parseFile(
    file: File,
    options?: CSVWorkerOptions
  ): Promise<RawDataset> {
    // Fallback to main thread if worker is not available
    if (!this.worker) {
      logger.warn('Worker not available, falling back to main thread', LogCategory.DATA);
      return this.parseFileMainThread(file, options);
    }

    const startTime = performance.now();

    try {
      // Read file as ArrayBuffer
      const arrayBuffer = await this.readFileAsArrayBuffer(file);

      // Send to worker
      const result = await this.sendToWorker('parse-csv', {
        fileData: arrayBuffer,
        options: {
          delimiter: options?.delimiter,
          header: options?.header !== false,
          skipEmptyLines: options?.skipEmptyLines !== false,
          preview: options?.preview,
          encoding: options?.encoding || 'utf-8'
        }
      }, [arrayBuffer], options?.onProgress);

      const executionTime = performance.now() - startTime;

      logger.success('CSV parsed in worker', LogCategory.DATA, {
        fileName: file.name,
        rows: result.rowCount,
        columns: result.headers.length,
        executionTimeMs: executionTime.toFixed(2)
      });

      // Convert to RawDataset format
      return this.convertToRawDataset(result);

    } catch (error) {
      logger.warn('Worker parsing failed, falling back to main thread', LogCategory.DATA, { error });
      return this.parseFileMainThread(file, options);
    }
  }

  /**
   * Send a message to the worker and wait for response
   */
  private sendToWorker(
    type: string,
    payload: any,
    transferables?: Transferable[],
    onProgress?: (progress: number) => void
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = `msg_${++this.messageId}_${Date.now()}`;

      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, onProgress });

      // Set timeout
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Worker timeout'));
        }
      }, 30000); // 30 seconds timeout

      // Clear timeout on completion
      const originalResolve = resolve;
      const originalReject = reject;
      resolve = (value) => {
        clearTimeout(timeout);
        originalResolve(value);
      };
      reject = (reason) => {
        clearTimeout(timeout);
        originalReject(reason);
      };

      // Update stored request with wrapped functions
      this.pendingRequests.set(id, { resolve, reject, onProgress });

      // Send message to worker
      const message = { id, type, payload };
      if (transferables && transferables.length > 0) {
        this.worker!.postMessage(message, transferables);
      } else {
        this.worker!.postMessage(message);
      }
    });
  }

  /**
   * Read file as ArrayBuffer
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Convert worker response to RawDataset format
   */
  private convertToRawDataset(response: any): RawDataset {
    const { headers, rows, metadata } = response;

    // Create columns with initial type
    const columns = headers.map((header: string) => ({
      name: header,
      type: ColumnType.TEXT,
      values: [] as unknown[]
    }));

    // Populate column values
    rows.forEach((row: unknown[]) => {
      columns.forEach((col: any, index: number) => {
        col.values.push(row[index] !== undefined ? row[index] : null);
      });
    });

    return {
      headers,
      rows,
      columns,
      metadata: {
        delimiter: metadata?.delimiter || ',',
        linebreak: metadata?.linebreak || '\n',
        rowCount: rows.length,
        columnCount: headers.length,
        fileType: 'csv',
        parsedWithWorker: true
      }
    };
  }

  /**
   * Fallback: Parse file on main thread
   */
  private async parseFileMainThread(
    file: File,
    options?: CSVWorkerOptions
  ): Promise<RawDataset> {
    // Dynamically import PapaParse
    const Papa = (await import('papaparse')).default;

    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        delimiter: options?.delimiter,
        skipEmptyLines: options?.skipEmptyLines !== false,
        preview: options?.preview,
        dynamicTyping: false,
        fastMode: true,
        complete: (results) => {
          const data = results.data as Record<string, unknown>[];
          const headers = results.meta.fields || [];

          // Convert to row-based format
          const rows = data.map(row => headers.map(h => row[h]));

          // Create columns
          const columns = headers.map(header => ({
            name: header,
            type: ColumnType.TEXT,
            values: data.map(row => row[header])
          }));

          resolve({
            headers,
            rows,
            columns,
            metadata: {
              delimiter: results.meta.delimiter || ',',
              linebreak: results.meta.linebreak || '\n',
              rowCount: rows.length,
              columnCount: headers.length,
              fileType: 'csv',
              parsedWithWorker: false
            }
          });
        },
        error: (error) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        }
      });
    });
  }

  /**
   * Destroy the worker
   */
  public destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
  }
}

// Export singleton instance
export const csvWorkerService = CSVWorkerService.getInstance();