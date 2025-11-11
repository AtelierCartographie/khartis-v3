/**
 * Validation result value object
 *
 * Returned by validators to indicate success/failure and collect messages.
 *
 * @example
 * ```typescript
 * const result: ValidationResult = {
 *   isValid: false,
 *   errors: ['File too large: 60MB (max: 50MB)'],
 *   warnings: ['Large dataset may impact performance']
 * };
 * ```
 */
export interface ValidationResult {
  /**
   * Whether validation passed
   */
  isValid: boolean;

  /**
   * Validation errors (block processing)
   */
  errors: string[];

  /**
   * Validation warnings (allow processing but inform user)
   */
  warnings: string[];
}

/**
 * Create a successful validation result
 *
 * @param warnings - Optional warnings
 * @returns ValidationResult with isValid=true
 */
export function validationSuccess(warnings: string[] = []): ValidationResult {
  return {
    isValid: true,
    errors: [],
    warnings
  };
}

/**
 * Create a failed validation result
 *
 * @param errors - Validation errors
 * @param warnings - Optional warnings
 * @returns ValidationResult with isValid=false
 */
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
 * Merge multiple validation results
 *
 * Result is valid only if ALL inputs are valid.
 * Errors and warnings are concatenated.
 *
 * @param results - Array of ValidationResult
 * @returns Merged ValidationResult
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
