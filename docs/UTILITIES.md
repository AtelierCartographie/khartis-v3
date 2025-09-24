# Utilities

## Categories

Logger, validation, sanitization, pipeline helpers, caching, error classes.

## Logger

Dev-only (import.meta.env.DEV). Levels: DEBUG/INFO/WARN/ERROR. No console.log in production code.

## Validation & Sanitization

| Function             | Purpose                      |
| -------------------- | ---------------------------- |
| validateProjectName  | Name constraints             |
| checkStorageQuota    | Estimate remaining storage   |
| sanitizeFileName     | Safe portable filename       |
| sanitizeCSVCell      | Neutralize formula injection |
| sanitizeNumericInput | Replace NaN/Infinity         |
| sanitizeTextInput    | Trim + collapse whitespace   |

## Pipeline Helpers

Type detection, stats accumulation, geometry bounds, filtering, derived column expressions (safe evaluation), aggregation.

## Caching Pattern

Map keyed by deterministic hash of config; TTL optional; clear on invalidation (e.g., dataset mutation).

## Error Classes

DataValidationError, ExpressionError (planned). Always surface to UI boundary; do not swallow silently.

## Limits (Defaults)

Max file 50MB (warn 25MB); max project size 100MB; max project count 50 (warn 40).

## Guidelines

- Keep helpers pure
- Promote to commons only after reuse
- Avoid DOM + data mixing in same util

Quick reference: pure, typed, minimal, focused.
