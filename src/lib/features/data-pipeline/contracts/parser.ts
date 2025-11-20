import type { RawDataset } from '../models/raw-dataset';

/**
 * Converts an uploaded file into a raw dataset representation.
 */
export interface IParser {
  readonly supportedExtensions: string[];
  readonly mimeTypes: string[];
  canParse(file: File): boolean;
  parse(file: File): Promise<RawDataset>;
}

export class ParserError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly fileType?: string
  ) {
    super(message);
    this.name = 'ParserError';
  }
}
