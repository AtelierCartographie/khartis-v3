export type CryptoApi = Pick<Crypto, 'getRandomValues'> &
  Partial<Pick<Crypto, 'randomUUID'>>;

function padHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, padHex);

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join('')
  ].join('-');
}

function createUuidFromCrypto(cryptoApi: Pick<CryptoApi, 'getRandomValues'>) {
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

function createFallbackUuid(): string {
  const bytes = new Uint8Array(16);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

export function generateId(
  cryptoApi: CryptoApi | undefined = globalThis.crypto
) {
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi) {
    return createUuidFromCrypto(cryptoApi);
  }

  return createFallbackUuid();
}

export function installRandomUUIDPolyfill(
  cryptoApi: CryptoApi | undefined = globalThis.crypto
): void {
  if (!cryptoApi || typeof cryptoApi.randomUUID === 'function') {
    return;
  }

  if (typeof cryptoApi.getRandomValues !== 'function') {
    return;
  }

  try {
    Object.defineProperty(cryptoApi, 'randomUUID', {
      value: () => createUuidFromCrypto(cryptoApi),
      configurable: true,
      writable: true
    });
  } catch {
    // Ignore non-extensible runtimes; generateId still provides a fallback.
  }
}

installRandomUUIDPolyfill();
