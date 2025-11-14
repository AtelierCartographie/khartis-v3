import type { IValidator } from '../../contracts/validator';
import type { RawDataset } from '../../models/raw-dataset';
import type { ValidationResult } from '../../models/validation-result';
import { mergeValidationResults } from '../../models/validation-result';
import { QualityValidator } from './quality.validator';
import { SchemaValidator } from './schema.validator';
import { SizeValidator } from './size.validator';

export type ValidatorList = ReadonlyArray<IValidator>;

export function createValidatorList(overrides?: ValidatorList): IValidator[] {
  if (overrides) {
    return [...overrides];
  }

  return [new SizeValidator(), new SchemaValidator(), new QualityValidator()];
}

export function runValidators(
  dataset: RawDataset,
  validators: ValidatorList,
  stopOnFirstError = false
): ValidationResult {
  const results: ValidationResult[] = [];

  for (const validator of validators) {
    const result = validator.validate(dataset);
    results.push(result);

    if (stopOnFirstError && !result.isValid) {
      break;
    }
  }

  return mergeValidationResults(results);
}
