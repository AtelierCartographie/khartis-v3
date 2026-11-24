import { Inflate, inflateSync, strFromU8 } from 'fflate';
import { m } from '$lib/paraglide/messages';
import { ParseError } from '$lib/features/commons/pipeline.errors';

// Reads a ZIP archive through Blob.slice so that only the central directory,
// the JSON entries and one asset chunk at a time live in JS memory. The
// parsing rules mirror fflate's unzipSync, which wrote every .kh in circulation.

export const KHARTIS_PROJECT_FILE_TYPE = 'khartis-project';

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_SIZE = 22;
const EOCD_MAX_DISTANCE_FROM_END = 65558;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_LOCATOR_SIZE = 20;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_EOCD_SIZE = 56;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const LOCAL_HEADER_SIZE = 30;
const UTF8_NAME_FLAG = 0x800;
const ZIP64_EXTRA_FIELD_ID = 1;
const ZIP32_SENTINEL = 0xffffffff;

export const ZIP_COMPRESSION = { STORED: 0, DEFLATE: 8 } as const;

export interface KhArchiveEntry {
  name: string;
  compression: number;
  compressedSize: number;
  originalSize: number;
  localHeaderOffset: number;
}

function invalidArchive(file: File, cause: unknown): ParseError {
  if (cause instanceof ParseError) {
    return cause;
  }

  return new ParseError(
    m.error_invalid_kh_archive_structure(),
    KHARTIS_PROJECT_FILE_TYPE,
    {
      fileName: file.name,
      cause: cause instanceof Error ? cause.message : String(cause)
    }
  );
}

class ByteView {
  private readonly view: DataView;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u16(offset: number): number {
    this.assertRange(offset, 2);
    return this.view.getUint16(offset, true);
  }

  u32(offset: number): number {
    this.assertRange(offset, 4);
    return this.view.getUint32(offset, true);
  }

  u64(offset: number): number {
    return this.u32(offset) + this.u32(offset + 4) * 2 ** 32;
  }

  slice(start: number, end: number): Uint8Array {
    this.assertRange(start, end - start);
    return this.bytes.subarray(start, end);
  }

  private assertRange(offset: number, length: number): void {
    if (offset < 0 || offset + length > this.bytes.byteLength) {
      throw new Error('ZIP record out of bounds');
    }
  }
}

async function readRange(
  file: File,
  start: number,
  end: number
): Promise<ByteView> {
  if (start < 0 || end > file.size || start > end) {
    throw new Error('ZIP offset out of bounds');
  }
  return new ByteView(
    new Uint8Array(await file.slice(start, end).arrayBuffer())
  );
}

interface CentralDirectoryLocation {
  entryCount: number;
  offset: number;
  end: number;
  zip64: boolean;
}

async function locateCentralDirectory(
  file: File
): Promise<CentralDirectoryLocation> {
  if (file.size < EOCD_SIZE) {
    throw new Error('Missing end of central directory');
  }

  const tailStart = Math.max(
    0,
    file.size - EOCD_MAX_DISTANCE_FROM_END - ZIP64_LOCATOR_SIZE - 1
  );
  const tail = await readRange(file, tailStart, file.size);

  let eocd = file.size - EOCD_SIZE;
  while (tail.u32(eocd - tailStart) !== EOCD_SIGNATURE) {
    if (eocd === 0 || file.size - eocd > EOCD_MAX_DISTANCE_FROM_END) {
      throw new Error('Missing end of central directory');
    }
    eocd -= 1;
  }

  const eocdInTail = eocd - tailStart;
  let entryCount = tail.u16(eocdInTail + 8);
  let offset = tail.u32(eocdInTail + 16);
  let zip64 = false;

  const locatorInTail = eocdInTail - ZIP64_LOCATOR_SIZE;
  if (
    locatorInTail >= 0 &&
    tail.u32(locatorInTail) === ZIP64_LOCATOR_SIGNATURE
  ) {
    const zip64EocdOffset = tail.u32(locatorInTail + 8);
    if (zip64EocdOffset + ZIP64_EOCD_SIZE <= file.size) {
      const zip64Eocd = await readRange(
        file,
        zip64EocdOffset,
        zip64EocdOffset + ZIP64_EOCD_SIZE
      );
      if (zip64Eocd.u32(0) === ZIP64_EOCD_SIGNATURE) {
        zip64 = true;
        entryCount = zip64Eocd.u32(32);
        offset = zip64Eocd.u32(48);
      }
    }
  }

  return { entryCount, offset, end: eocd, zip64 };
}

function readZip64Sizes(
  directory: ByteView,
  extraStart: number,
  extraLength: number,
  entry: Pick<
    KhArchiveEntry,
    'compressedSize' | 'originalSize' | 'localHeaderOffset'
  >
): typeof entry {
  const needsOriginal = entry.originalSize === ZIP32_SENTINEL;
  const needsCompressed = entry.compressedSize === ZIP32_SENTINEL;
  const needsOffset = entry.localHeaderOffset === ZIP32_SENTINEL;
  const extraEnd = extraStart + extraLength;

  for (
    let field = extraStart;
    field + 4 < extraEnd;
    field += 4 + directory.u16(field + 2)
  ) {
    if (directory.u16(field) !== ZIP64_EXTRA_FIELD_ID) {
      continue;
    }

    const values = field + 4;
    const original = Number(needsOriginal);
    const compressed = Number(needsCompressed);
    return {
      originalSize: needsOriginal ? directory.u64(values) : entry.originalSize,
      compressedSize: needsCompressed
        ? directory.u64(values + 8 * original)
        : entry.compressedSize,
      localHeaderOffset: needsOffset
        ? directory.u64(values + 8 * (original + compressed))
        : entry.localHeaderOffset
    };
  }

  throw new Error('Missing ZIP64 extra field');
}

/**
 * Lists the archive entries from its central directory without reading
 * any entry payload.
 */
export async function readKhArchiveDirectory(
  file: File
): Promise<KhArchiveEntry[]> {
  try {
    const location = await locateCentralDirectory(file);
    if (location.entryCount === 0) {
      return [];
    }

    const directory = await readRange(file, location.offset, location.end);
    const entries: KhArchiveEntry[] = [];
    let cursor = 0;

    for (let index = 0; index < location.entryCount; index++) {
      if (directory.u32(cursor) !== CENTRAL_HEADER_SIGNATURE) {
        throw new Error('Invalid central directory header');
      }

      const flags = directory.u16(cursor + 8);
      const nameLength = directory.u16(cursor + 28);
      const extraLength = directory.u16(cursor + 30);
      const commentLength = directory.u16(cursor + 32);
      const nameStart = cursor + CENTRAL_HEADER_SIZE;
      const extraStart = nameStart + nameLength;

      let sizes = {
        compressedSize: directory.u32(cursor + 20),
        originalSize: directory.u32(cursor + 24),
        localHeaderOffset: directory.u32(cursor + 42)
      };
      const usesZip64Sentinel =
        sizes.compressedSize === ZIP32_SENTINEL ||
        sizes.originalSize === ZIP32_SENTINEL ||
        sizes.localHeaderOffset === ZIP32_SENTINEL;
      if (location.zip64 && usesZip64Sentinel) {
        sizes = readZip64Sizes(directory, extraStart, extraLength, sizes);
      }

      entries.push({
        name: strFromU8(
          directory.slice(nameStart, extraStart),
          !(flags & UTF8_NAME_FLAG)
        ),
        compression: directory.u16(cursor + 10),
        ...sizes
      });

      cursor = extraStart + extraLength + commentLength;
    }

    return entries;
  } catch (error) {
    throw invalidArchive(file, error);
  }
}

async function locateEntryData(
  file: File,
  entry: KhArchiveEntry
): Promise<{ start: number; end: number }> {
  const header = await readRange(
    file,
    entry.localHeaderOffset,
    Math.min(file.size, entry.localHeaderOffset + LOCAL_HEADER_SIZE)
  );
  if (header.u32(0) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error('Invalid local file header');
  }

  const start =
    entry.localHeaderOffset +
    LOCAL_HEADER_SIZE +
    header.u16(26) +
    header.u16(28);
  const end = start + entry.compressedSize;
  if (end > file.size) {
    throw new Error('ZIP entry exceeds archive bounds');
  }

  if (
    entry.compression !== ZIP_COMPRESSION.STORED &&
    entry.compression !== ZIP_COMPRESSION.DEFLATE
  ) {
    throw new Error(`unknown compression type ${entry.compression}`);
  }

  return { start, end };
}

/**
 * Reads one entry fully. Reserved for the small JSON entries.
 */
export async function readKhArchiveEntry(
  file: File,
  entry: KhArchiveEntry
): Promise<Uint8Array> {
  try {
    const { start, end } = await locateEntryData(file, entry);
    const payload = (await readRange(file, start, end)).bytes;
    if (entry.compression === ZIP_COMPRESSION.STORED) {
      return payload;
    }
    return inflateSync(payload, { out: new Uint8Array(entry.originalSize) });
  } catch (error) {
    throw invalidArchive(file, error);
  }
}

function createInflateTransform(
  file: File,
  maxOutputBytes: number
): TransformStream<Uint8Array, Uint8Array> {
  let inflater: Inflate;
  let outputBytes = 0;

  const run = (step: () => void): void => {
    try {
      step();
    } catch (error) {
      throw invalidArchive(file, error);
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    start(controller) {
      inflater = new Inflate((chunk) => {
        outputBytes += chunk.length;
        if (outputBytes > maxOutputBytes) {
          throw new Error('ZIP entry exceeds its declared size');
        }
        controller.enqueue(chunk);
      });
    },
    transform(chunk) {
      run(() => inflater.push(chunk));
    },
    flush() {
      run(() => inflater.push(new Uint8Array(0), true));
    }
  });
}

/**
 * Streams one entry's uncompressed bytes straight from the file. A deflated
 * entry never yields more than its declared original size.
 */
export async function openKhArchiveEntryStream(
  file: File,
  entry: KhArchiveEntry
): Promise<ReadableStream<Uint8Array>> {
  try {
    const { start, end } = await locateEntryData(file, entry);
    const payload = file
      .slice(start, end)
      .stream() as ReadableStream<Uint8Array>;
    if (entry.compression === ZIP_COMPRESSION.STORED) {
      return payload;
    }
    return payload.pipeThrough(
      createInflateTransform(file, entry.originalSize)
    );
  } catch (error) {
    throw invalidArchive(file, error);
  }
}

/**
 * Number of bytes an entry yields once read, as fflate's unzipSync returned
 * them: the stored payload, or the inflated one.
 */
export function getKhArchiveEntryOutputSize(entry: KhArchiveEntry): number {
  return entry.compression === ZIP_COMPRESSION.STORED
    ? entry.compressedSize
    : entry.originalSize;
}
