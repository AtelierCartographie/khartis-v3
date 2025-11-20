import type { IValidator } from '../../contracts/validator';
import type { RawDataset } from '../../models/raw-dataset';
import type { ValidationResult } from '../../models/validation-result';
import {
  validationSuccess,
  validationFailure
} from '../../models/validation-result';

/**
 * Validates structural consistency between headers, rows, and column names.
 */
export class SchemaValidator implements IValidator {
  validate(data: RawDataset): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const columnNames = new Set<string>();
    const duplicates = new Set<string>();

    data.headers.forEach((name) => {
      if (columnNames.has(name)) {
        duplicates.add(name);
      }
      columnNames.add(name);
    });

    if (duplicates.size > 0) {
      errors.push(
        `Duplicate column names found: ${Array.from(duplicates).join(', ')}`
      );
    }

    const emptyNames = data.headers.filter(
      (name) => !name || name.trim() === ''
    );
    if (emptyNames.length > 0) {
      errors.push(`${emptyNames.length} column(s) have empty names`);
    }

    const expectedLength = data.headers.length;
    const inconsistentRows = data.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.length !== expectedLength);

    if (inconsistentRows.length > 0) {
      errors.push(
        `${inconsistentRows.length} row(s) have inconsistent length (expected: ${expectedLength})`
      );

      const sample = inconsistentRows.slice(0, 3);
      sample.forEach(({ index, row }) => {
        errors.push(`  Row ${index + 1}: ${row.length} columns`);
      });
    }

    const allNullColumns = data.columns.filter((col) =>
      col.values.every((v) => v === null || v === undefined)
    );

    if (allNullColumns.length > 0) {
      warnings.push(
        `${allNullColumns.length} column(s) contain only null values: ${allNullColumns.map((c) => c.name).join(', ')}`
      );
    }

    return errors.length > 0
      ? validationFailure(errors, warnings)
      : validationSuccess(warnings);
  }
}
