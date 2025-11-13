import type { IValidator } from '../../domain/interfaces/validator.interface';
import type { RawDataset } from '../../domain/entities/raw-dataset.entity';
import type { ValidationResult } from '../../domain/value-objects/validation-result.vo';
import { mergeValidationResults } from '../../domain/value-objects/validation-result.vo';
import { SizeValidator } from './size.validator';
import { SchemaValidator } from './schema.validator';
import { QualityValidator } from './quality.validator';
/**
 * Validation Chain - Runs validators in sequence
 *
 * Implements Chain of Responsibility pattern.
 * Each validator checks one aspect, results are merged.
 *
 * @example
 * ```typescript
 * const chain = new ValidationChain();
 * const result = chain.validate(dataset);
 *
 * if (!result.isValid) {
 logger.error('Operation', LogCategory.DATA);
 * }
 *
 * if (result.warnings.length > 0) {
 logger.warn('Operation', LogCategory.DATA);
 * }
 * ```
 */
export class ValidationChain {
  private validators: IValidator[] = [];

  private stopOnFirstError: boolean;

  /**
   * Create validation chain
   *
   * @param stopOnFirstError - If true, stop on first error (faster but less info)
   */
  constructor(stopOnFirstError = false) {
    this.stopOnFirstError = stopOnFirstError;
    this.registerDefaults();
  }

  /**
   * Register default validators (Size, Schema, Quality)
   */
  private registerDefaults(): void {
    this.register(new SizeValidator());
    this.register(new SchemaValidator());
    this.register(new QualityValidator());
  }

  /**
   * Register a validator
   *
   * Validators are run in registration order.
   *
   * @param validator - Validator to register
   */
  register(validator: IValidator): void {
    this.validators.push(validator);
  }

  /**
   * Validate dataset through all validators
   *
   * @param data - RawDataset to validate
   * @returns Merged ValidationResult
   */
  validate(data: RawDataset): ValidationResult {
    const results: ValidationResult[] = [];

    for (const validator of this.validators) {
      const result = validator.validate(data);
      results.push(result);

      // Stop on first error if configured
      if (this.stopOnFirstError && !result.isValid) {
        break;
      }
    }

    return mergeValidationResults(results);
  }

  /**
   * Get all registered validators
   *
   * @returns Array of validators
   */
  getValidators(): IValidator[] {
    return [...this.validators];
  }

  /**
   * Clear all validators
   */
  clear(): void {
    this.validators = [];
  }
}
