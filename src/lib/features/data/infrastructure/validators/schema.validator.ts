import type { IValidator } from '../../domain/interfaces/validator.interface';
import type { RawDataset } from '../../domain/entities/raw-dataset.entity';
import type { ValidationResult } from '../../domain/value-objects/validation-result.vo';
import {
  validationSuccess,
  validationFailure
} from '../../domain/value-objects/validation-result.vo';

/**
 * Schema Validator - Validates dataset schema consistency
 *
 * Checks:
 * - Column names are unique
 * - Column names are not empty
 * - Row length matches header length
 *
 * @example
 * ```typescript
 * const validator = new SchemaValidator();
 * const result = validator.validate(dataset);
 * ```
 */
export class SchemaValidator implements IValidator {
  validate(data: RawDataset): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for duplicate column names
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

    // Check for empty column names
    const emptyNames = data.headers.filter(
      (name) => !name || name.trim() === ''
    );
    if (emptyNames.length > 0) {
      errors.push(`${emptyNames.length} column(s) have empty names`);
    }

    // Check for inconsistent row lengths
    const expectedLength = data.headers.length;
    const inconsistentRows = data.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.length !== expectedLength);

    if (inconsistentRows.length > 0) {
      errors.push(
        `${inconsistentRows.length} row(s) have inconsistent length (expected: ${expectedLength})`
      );

      // Show first few problematic rows
      const sample = inconsistentRows.slice(0, 3);
      sample.forEach(({ index, row }) => {
        errors.push(`  Row ${index + 1}: ${row.length} columns`);
      });
    }

    // Check for columns with all null values
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
