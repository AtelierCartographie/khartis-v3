/**
 * Web Workers Module - Performance Optimization for Heavy Computations
 *
 * This module provides Web Worker-based optimizations for CPU-intensive operations,
 * significantly improving UI responsiveness and application performance.
 *
 * Compatible with Vite + PWA configuration.
 */

// Worker Message Types
export type { WorkerRequest, WorkerResponse } from './types/worker-messages';

/**
 * Quick Start Guide
 *
 * Workers are available for CPU-intensive operations that need to run
 * in a background thread to keep the UI responsive.
 *
 * Note: CSV parsing has been migrated to use DuckDB's native read_csv()
 * for better performance and simpler architecture.
 *
 * For detailed documentation, see README.md and VITE-COMPATIBILITY.md
 */
