import { afterEach, describe, expect, it, vi } from 'vitest';
import { Environment, EnvironmentUtils } from './environment.utils';

function stubHostname(hostname: string): void {
  vi.stubGlobal('window', { location: { hostname } });
}

describe('EnvironmentUtils.getEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('should return production when VITE_KHARTIS_ENV is production even on localhost', () => {
    vi.stubEnv('VITE_KHARTIS_ENV', 'production');
    stubHostname('localhost');

    expect(EnvironmentUtils.getEnvironment()).toBe(Environment.PRODUCTION);
  });

  it('should return preproduction when VITE_KHARTIS_ENV is preproduction even on localhost', () => {
    vi.stubEnv('VITE_KHARTIS_ENV', 'preproduction');
    stubHostname('localhost');

    expect(EnvironmentUtils.getEnvironment()).toBe(Environment.PREPRODUCTION);
  });

  it('should fall back to development on localhost when VITE_KHARTIS_ENV is empty', () => {
    vi.stubEnv('VITE_KHARTIS_ENV', '');
    stubHostname('localhost');

    expect(EnvironmentUtils.getEnvironment()).toBe(Environment.DEVELOPMENT);
  });

  it('should fall back to production on a remote host when VITE_KHARTIS_ENV is unset', () => {
    vi.stubEnv('VITE_KHARTIS_ENV', undefined);
    stubHostname('cartotheque.sciencespo.fr');

    expect(EnvironmentUtils.getEnvironment()).toBe(Environment.PRODUCTION);
  });

  it('should ignore an unknown VITE_KHARTIS_ENV value and use the hostname fallback', () => {
    vi.stubEnv('VITE_KHARTIS_ENV', 'staging');
    stubHostname('127.0.0.1');

    expect(EnvironmentUtils.getEnvironment()).toBe(Environment.DEVELOPMENT);
  });
});
