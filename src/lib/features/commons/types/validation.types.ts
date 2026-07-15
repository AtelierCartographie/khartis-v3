export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validationSuccess(warnings: string[] = []): ValidationResult {
  return { isValid: true, errors: [], warnings };
}

export function validationFailure(
  errors: string[],
  warnings: string[] = []
): ValidationResult {
  return { isValid: false, errors, warnings };
}
