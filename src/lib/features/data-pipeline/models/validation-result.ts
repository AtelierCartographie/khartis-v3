/**
 * Outcome of a validation run.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validationSuccess(warnings: string[] = []): ValidationResult {
  return {
    isValid: true,
    errors: [],
    warnings
  };
}

export function validationFailure(
  errors: string[],
  warnings: string[] = []
): ValidationResult {
  return {
    isValid: false,
    errors,
    warnings
  };
}

/**
 * Merge multiple validation results; all must be valid for the aggregate to pass.
 */
export function mergeValidationResults(
  results: ValidationResult[]
): ValidationResult {
  return {
    isValid: results.every((r) => r.isValid),
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings)
  };
}
