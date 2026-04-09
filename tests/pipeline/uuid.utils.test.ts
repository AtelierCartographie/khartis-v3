import { describe, expect, it, vi } from 'vitest';

import {
  generateId,
  installRandomUUIDPolyfill
} from '$lib/features/commons/utils/uuid.utils';

describe('uuid.utils', () => {
  it('uses native randomUUID when available', () => {
    const cryptoApi = {
      getRandomValues: vi.fn(),
      randomUUID: vi.fn().mockReturnValue('native-id')
    };

    expect(generateId(cryptoApi)).toBe('native-id');
    expect(cryptoApi.randomUUID).toHaveBeenCalledTimes(1);
    expect(cryptoApi.getRandomValues).not.toHaveBeenCalled();
  });

  it('builds an RFC4122 v4 id from getRandomValues when randomUUID is unavailable', () => {
    const cryptoApi = {
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.set([
          0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe, 0x11, 0x22, 0x33,
          0x44, 0x55, 0x66, 0x77, 0x88
        ]);
        return bytes;
      })
    };

    const generated = generateId(cryptoApi);

    expect(cryptoApi.getRandomValues).toHaveBeenCalledTimes(1);
    expect(generated).toBe('10325476-98ba-4cfe-9122-334455667788');
  });

  it('installs a randomUUID polyfill on crypto-like objects', () => {
    const cryptoApi = {
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.fill(0xaa);
        return bytes;
      })
    };

    installRandomUUIDPolyfill(cryptoApi);

    expect(typeof cryptoApi.randomUUID).toBe('function');
    expect(cryptoApi.randomUUID?.()).toBe(
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    );
  });
});
