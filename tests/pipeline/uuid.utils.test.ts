import { describe, expect, it, vi } from 'vitest';

import {
  generateId,
  installRandomUUIDPolyfill
} from '$lib/features/commons/utils/uuid.utils';

type CryptoApi = NonNullable<Parameters<typeof generateId>[0]>;

function createGetRandomValuesMock(
  fill: (bytes: Uint8Array) => void
): CryptoApi['getRandomValues'] & ReturnType<typeof vi.fn> {
  const spy = vi.fn((array: ArrayBufferView) => {
    const bytes = new Uint8Array(
      array.buffer,
      array.byteOffset,
      array.byteLength
    );
    fill(bytes);
  });

  const getRandomValues: CryptoApi['getRandomValues'] = <
    T extends ArrayBufferView
  >(
    array: T
  ): T => {
    spy(array);
    return array;
  };

  return Object.assign(getRandomValues, spy);
}

describe('uuid.utils', () => {
  it('uses native randomUUID when available', () => {
    const cryptoApi: CryptoApi = {
      getRandomValues: createGetRandomValuesMock(() => {}),
      randomUUID: vi.fn().mockReturnValue('native-id')
    };

    expect(generateId(cryptoApi)).toBe('native-id');
    expect(cryptoApi.randomUUID).toHaveBeenCalledTimes(1);
    expect(cryptoApi.getRandomValues).not.toHaveBeenCalled();
  });

  it('builds an RFC4122 v4 id from getRandomValues when randomUUID is unavailable', () => {
    const cryptoApi: CryptoApi = {
      getRandomValues: createGetRandomValuesMock((bytes) => {
        bytes.set([
          0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe, 0x11, 0x22, 0x33,
          0x44, 0x55, 0x66, 0x77, 0x88
        ]);
      })
    };

    const generated = generateId(cryptoApi);

    expect(cryptoApi.getRandomValues).toHaveBeenCalledTimes(1);
    expect(generated).toBe('10325476-98ba-4cfe-9122-334455667788');
  });

  it('installs a randomUUID polyfill on crypto-like objects', () => {
    const cryptoApi: CryptoApi = {
      getRandomValues: createGetRandomValuesMock((bytes) => {
        bytes.fill(0xaa);
      })
    };

    installRandomUUIDPolyfill(cryptoApi);

    expect(typeof cryptoApi.randomUUID).toBe('function');
    expect(cryptoApi.randomUUID?.()).toBe(
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    );
  });
});
