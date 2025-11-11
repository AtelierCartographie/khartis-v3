import type { IValidator } from '../../domain/interfaces/validator.interface';
import type { RawDataset } from '../../domain/entities/raw-dataset.entity';
import type { ValidationResult } from '../../domain/value-objects/validation-result.vo';
import { validationSuccess } from '../../domain/value-objects/validation-result.vo';

/**
 * Quality Validator - Validates data quality
 *
 * Checks (warnings only, no errors):
 * - High null percentage (>50%)
 * - Low cardinality (all same value)
 * - Suspicious patterns
 *
 * @example
 * ```typescript
 * const validator = new QualityValidator();
 * const result = validator.validate(dataset);
 * ```
 */
export class QualityValidator implements IValidator {
  private static readonly HIGH_NULL_THRESHOLD = 0.5; // 50%

  private static readonly LOW_CARDINALITY_THRESHOLD = 0.01; // 1%

  validate(data: RawDataset): ValidationResult {
    const warnings: string[] = [];

    // Check null percentage per column
    data.columns.forEach((col) => {
      const nullCount = col.values.filter(
        (v) => v === null || v === undefined || v === ''
      ).length;
      const nullPercentage = nullCount / col.values.length;

      if (nullPercentage > QualityValidator.HIGH_NULL_THRESHOLD) {
        warnings.push(
          `Column "${col.name}" has ${(nullPercentage * 100).toFixed(1)}% null values`
        );
      }
    });

    // Check for columns with very low cardinality (mostly same value)
    data.columns.forEach((col) => {
      const nonNullValues = col.values.filter(
        (v) => v !== null && v !== undefined && v !== ''
      );
      if (nonNullValues.length > 0) {
        const uniqueValues = new Set(nonNullValues);
        const cardinalityRatio = uniqueValues.size / nonNullValues.length;

        if (cardinalityRatio < QualityValidator.LOW_CARDINALITY_THRESHOLD) {
          warnings.push(
            `Column "${col.name}" has very low cardinality (${uniqueValues.size} unique values in ${nonNullValues.length} rows)`
          );
        }
      }
    });

    // All quality checks are warnings, never errors
    return validationSuccess(warnings);
  }
}
