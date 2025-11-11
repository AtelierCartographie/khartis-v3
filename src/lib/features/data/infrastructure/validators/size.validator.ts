import type { IValidator } from '../../domain/interfaces/validator.interface';
import type { RawDataset } from '../../domain/entities/raw-dataset.entity';
import type { ValidationResult } from '../../domain/value-objects/validation-result.vo';
import {
  validationSuccess,
  validationFailure
} from '../../domain/value-objects/validation-result.vo';

/**
 * Size Validator - Validates dataset size constraints
 *
 * Checks:
 * - Row count (warning at 5k, error at 10k)
 * - Column count (warning at 50, error at 100)
 *
 * @example
 * ```typescript
 * const validator = new SizeValidator();
 * const result = validator.validate(dataset);
 * if (!result.isValid) {
 *   console.error(result.errors);
 * }
 * ```
 */
export class SizeValidator implements IValidator {
  private static readonly WARNING_ROWS = 5000;

  private static readonly MAX_ROWS = 10000;

  private static readonly WARNING_COLUMNS = 50;

  private static readonly MAX_COLUMNS = 100;

  validate(data: RawDataset): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check row count
    const rowCount = data.rows.length;
    if (rowCount > SizeValidator.MAX_ROWS) {
      errors.push(
        `Too many rows: ${rowCount.toLocaleString()} (maximum: ${SizeValidator.MAX_ROWS.toLocaleString()})`
      );
    } else if (rowCount > SizeValidator.WARNING_ROWS) {
      warnings.push(
        `Large dataset: ${rowCount.toLocaleString()} rows may impact performance`
      );
    }

    // Check column count
    const columnCount = data.columns.length;
    if (columnCount > SizeValidator.MAX_COLUMNS) {
      errors.push(
        `Too many columns: ${columnCount} (maximum: ${SizeValidator.MAX_COLUMNS})`
      );
    } else if (columnCount > SizeValidator.WARNING_COLUMNS) {
      warnings.push(
        `Many columns: ${columnCount} columns may impact performance`
      );
    }

    // Check for empty dataset
    if (rowCount === 0) {
      errors.push('Dataset is empty: no rows found');
    }

    if (columnCount === 0) {
      errors.push('Dataset is empty: no columns found');
    }

    return errors.length > 0
      ? validationFailure(errors, warnings)
      : validationSuccess(warnings);
  }
}
