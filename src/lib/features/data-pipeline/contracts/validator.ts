import type { RawDataset } from '../models/raw-dataset';
import type { ValidationResult } from '../models/validation-result';

/**
 * Validates a raw dataset against a single concern (size, schema, quality, etc.).
 */
export interface IValidator {
  validate(data: RawDataset): ValidationResult;
}
