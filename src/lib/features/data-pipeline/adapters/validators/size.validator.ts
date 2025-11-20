import type { IValidator } from '../../contracts/validator';
import type { RawDataset } from '../../models/raw-dataset';
import type { ValidationResult } from '../../models/validation-result';
import {
  validationSuccess,
  validationFailure
} from '../../models/validation-result';

/**
 * Guards against datasets that are too large to handle comfortably in the browser.
 */
export class SizeValidator implements IValidator {
  private static readonly WARNING_ROWS = 5000;

  private static readonly MAX_ROWS = 10000;

  private static readonly WARNING_COLUMNS = 50;

  private static readonly MAX_COLUMNS = 100;

  validate(data: RawDataset): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

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
