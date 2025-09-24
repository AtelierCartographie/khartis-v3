import { logger, LogCategory } from './logger';

export async function compressData(data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(data);

  if ('CompressionStream' in window) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(uint8Array);
        controller.close();
      }
    });

    const compressedStream = stream.pipeThrough(
      new (window as any).CompressionStream('gzip')
    ) as ReadableStream<Uint8Array>;

    const chunks: Uint8Array[] = [];
    const reader = compressedStream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  return uint8Array.buffer;
}

export async function decompressData(data: ArrayBuffer): Promise<string> {
  if ('DecompressionStream' in window) {
    try {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(data));
          controller.close();
        }
      });

      const decompressedStream = stream.pipeThrough(
        new (window as any).DecompressionStream('gzip')
      ) as ReadableStream<Uint8Array>;

      const chunks: Uint8Array[] = [];
      const reader = decompressedStream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      const decoder = new TextDecoder();
      return decoder.decode(result);
    } catch (error) {
      logger.warn('Failed to decompress as gzip, trying as plain text', LogCategory.FILE, error);
      throw error;
    }
  }

  const decoder = new TextDecoder();
  return decoder.decode(data);
}

export function isCompressionSupported(): boolean {
  return 'CompressionStream' in window && 'DecompressionStream' in window;
}