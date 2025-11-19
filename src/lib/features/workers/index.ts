/**
 * Web Workers Module - Performance Optimization for Heavy Computations
 *
 * This module provides Web Worker-based optimizations for CPU-intensive operations,
 * significantly improving UI responsiveness and application performance.
 *
 * Compatible with Vite + PWA configuration.
 */

// Worker Service (Vite-compatible)
export { csvWorkerService, CSVWorkerService } from './csv-worker.service';

// Worker Message Types
export type {
  WorkerRequest,
  WorkerResponse,
  CSVParseRequest,
  CSVParseResponse
} from './types/worker-messages';

/**
 * Quick Start Guide
 *
 * CSV Parsing with Worker:
 * ```typescript
 * import { csvWorkerService } from '$lib/features/workers';
 * const dataset = await csvWorkerService.parseFile(file);
 * ```
 *
 * The worker will automatically:
 * - Parse CSV/TSV files in a background thread
 * - Keep the UI responsive during parsing
 * - Fall back to main thread if workers are unavailable
 * - Report progress for large files
 *
 * For detailed documentation, see README.md and VITE-COMPATIBILITY.md
 */