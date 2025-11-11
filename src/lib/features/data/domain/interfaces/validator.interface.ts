import type { RawDataset } from '../entities/raw-dataset.entity';
import type { ValidationResult } from '../value-objects/validation-result.vo';

/**
 * Validator interface - Chain of Responsibility pattern
 *
 * Responsibility: Validate RawDataset against constraints
 *
 * Each validator checks ONE aspect (size, schema, quality, etc.)
 * Validators are chained together in ValidationChain.
 *
 * @example
 * ```typescript
 * class SizeValidator implements IValidator {
 *   validate(data: RawDataset): ValidationResult {
 *     const errors: string[] = [];
 *
 *     if (data.rows.length > MAX_ROWS) {
 *       errors.push(`Too many rows: ${data.rows.length}`);
 *     }
 *
 *     return { isValid: errors.length === 0, errors, warnings: [] };
 *   }
 * }
 * ```
 */
export interface IValidator {
  /**
   * Validate dataset
   *
   * @param data - RawDataset to validate
   * @returns ValidationResult with errors and warnings
   */
  validate(data: RawDataset): ValidationResult;
}
