import type { IValidator } from '../../contracts/validator';
import type { RawDataset } from '../../models/raw-dataset';
import type { ValidationResult } from '../../models/validation-result';
import { validationSuccess } from '../../models/validation-result';

/**
 * Flags columns with high null ratios or suspiciously low cardinality.
 */
export class QualityValidator implements IValidator {
  private static readonly HIGH_NULL_THRESHOLD = 0.5;

  private static readonly LOW_CARDINALITY_THRESHOLD = 0.01;

  validate(data: RawDataset): ValidationResult {
    const warnings: string[] = [];

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

    return validationSuccess(warnings);
  }
}
