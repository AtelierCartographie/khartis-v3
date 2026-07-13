import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deployScriptUrl = pathToFileURL(
  path.resolve(process.cwd(), 'scripts/deploy-local.mjs')
).href;
const {
  assertBuildMatchesDeployment,
  rollbackPublicValidationFailure,
  resolveDeploymentPublicUrl,
  verifyPublicUrl
} = await import(deployScriptUrl);

interface FakeResponse {
  headers: Headers;
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  url: string;
}

function createResponse(
  url: string,
  {
    baseHref = '/cartographie/khartis/',
    body,
    contentType = 'text/html; charset=utf-8',
    location,
    status = 200
  }: {
    baseHref?: string;
    body?: string;
    contentType?: string;
    location?: string;
    status?: number;
  } = {}
): FakeResponse {
  const headers = new Headers({ 'content-type': contentType });
  if (location) headers.set('location', location);
  return {
    headers,
    ok: status >= 200 && status < 300,
    status,
    text: async () =>
      body ??
      `<!doctype html><html><head><base href="${baseHref}"><link href="${baseHref}_app/start.js" rel="modulepreload"><link rel="stylesheet" href="${baseHref}_app/app.css"></head></html>`,
    url
  };
}

function createSuccessfulResponse(
  url: string,
  baseHref = '/cartographie/khartis/'
): FakeResponse {
  if (url.endsWith('/_app/start.js')) {
    return createResponse(url, {
      body: 'export {};',
      contentType: 'application/javascript'
    });
  }
  if (url.endsWith('/_app/app.css')) {
    return createResponse(url, {
      body: ':root {}',
      contentType: 'text/css'
    });
  }
  return createResponse(url, { baseHref });
}

describe('local deployment route contract', () => {
  let buildDir: string;

  beforeEach(async () => {
    buildDir = await mkdtemp(path.join(tmpdir(), 'khartis-deploy-test-'));
    await mkdir(buildDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(buildDir, { recursive: true, force: true });
  });

  it('should derive distinct base paths when target URLs differ', () => {
    const pprd = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis-pprd'
    );
    const prod = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/fr/outils/khartis/app/'
    );

    expect(pprd).toEqual({
      basePath: '/cartographie/khartis-pprd',
      publicUrl: 'https://example.org/cartographie/khartis-pprd/'
    });
    expect(prod).toEqual({
      basePath: '/cartographie/fr/outils/khartis/app',
      publicUrl: 'https://example.org/cartographie/fr/outils/khartis/app/'
    });
  });

  it('should normalize the root route when the public URL has no subpath', () => {
    expect(resolveDeploymentPublicUrl('https://example.org')).toEqual({
      basePath: '',
      publicUrl: 'https://example.org/'
    });
  });

  it.each([
    'http://example.org/khartis',
    'https://user:secret@example.org/khartis',
    'https://example.org/khartis?target=prod',
    'https://example.org/khartis#prod',
    'https://example.org/cartographie//khartis',
    'not-a-url'
  ])('should reject unsafe configuration when the public URL is %s', (url) => {
    expect(() => resolveDeploymentPublicUrl(url)).toThrow();
  });

  it('should accept build artifacts when their route matches the public URL', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    await writeFile(
      path.join(buildDir, 'index.html'),
      '<html><head><base href="/cartographie/khartis/"></head></html>'
    );
    await writeFile(
      path.join(buildDir, 'manifest.webmanifest'),
      JSON.stringify({
        id: '/cartographie/khartis/',
        scope: '/cartographie/khartis/',
        start_url: '/cartographie/khartis/?standalone=true'
      })
    );

    await expect(
      assertBuildMatchesDeployment(buildDir, deployment)
    ).resolves.toBeUndefined();
  });

  it('should reject build artifacts when the HTML base path diverges', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    await writeFile(
      path.join(buildDir, 'index.html'),
      '<html><head><base href="/wrong/"></head></html>'
    );
    await writeFile(
      path.join(buildDir, 'manifest.webmanifest'),
      JSON.stringify({
        id: '/cartographie/khartis/',
        scope: '/cartographie/khartis/',
        start_url: '/cartographie/khartis/?standalone=true'
      })
    );

    await expect(
      assertBuildMatchesDeployment(buildDir, deployment)
    ).rejects.toThrow('expected "/cartographie/khartis/"');
  });

  it('should reject build artifacts when the manifest scope diverges', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    await writeFile(
      path.join(buildDir, 'index.html'),
      '<html><head><base href="/cartographie/khartis/"></head></html>'
    );
    await writeFile(
      path.join(buildDir, 'manifest.webmanifest'),
      JSON.stringify({
        id: '/cartographie/khartis/',
        scope: '/wrong/',
        start_url: '/cartographie/khartis/?standalone=true'
      })
    );

    await expect(
      assertBuildMatchesDeployment(buildDir, deployment)
    ).rejects.toThrow('scope="/wrong/"');
  });

  it('should accept live HTML when canonical and slashless routes match', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) =>
      createSuccessfulResponse(url)
    );

    await expect(
      verifyPublicUrl(deployment, { fetchImpl })
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('should accept the slashless route when it redirects once to HTTPS canonical', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url !== 'https://example.org/cartographie/khartis') {
        return createSuccessfulResponse(url);
      }
      return createResponse(url, {
        location: deployment.publicUrl,
        status: 308
      });
    });

    await expect(
      verifyPublicUrl(deployment, { fetchImpl })
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('should reject the deployment when a critical module is unavailable', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/_app/start.js')) {
        return createResponse(url, { status: 403 });
      }
      return createSuccessfulResponse(url);
    });

    await expect(verifyPublicUrl(deployment, { fetchImpl })).rejects.toThrow(
      'Public module script returned 403'
    );
  });

  it('should reject the deployment when a critical stylesheet has the wrong MIME type', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/_app/app.css')) {
        return createResponse(url, { contentType: 'text/html' });
      }
      return createSuccessfulResponse(url);
    });

    await expect(verifyPublicUrl(deployment, { fetchImpl })).rejects.toThrow(
      'Public stylesheet returned text/html'
    );
  });

  it.each([403, 429])(
    'should reject the deployment when the canonical route returns %s',
    async (status) => {
      const deployment = resolveDeploymentPublicUrl(
        'https://example.org/cartographie/khartis/'
      );
      const fetchImpl = vi.fn(async (url: string) =>
        createResponse(url, { status })
      );

      await expect(verifyPublicUrl(deployment, { fetchImpl })).rejects.toThrow(
        `returned ${status}`
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it('should reject live HTML when its base path diverges', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) =>
      createResponse(url, { baseHref: '/wrong/' })
    );

    await expect(verifyPublicUrl(deployment, { fetchImpl })).rejects.toThrow(
      'expected "/cartographie/khartis/"'
    );
  });

  it('should reject the slashless route when it redirects to HTTP', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url !== 'https://example.org/cartographie/khartis') {
        return createSuccessfulResponse(url);
      }
      return createResponse(url, {
        location: 'http://example.org/cartographie/khartis/',
        status: 301
      });
    });

    await expect(verifyPublicUrl(deployment, { fetchImpl })).rejects.toThrow(
      'redirects to http://'
    );
  });

  it('should stop the deployment when the public check times out', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = (_url: string, init: RequestInit) =>
      new Promise<FakeResponse>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });

    await expect(
      verifyPublicUrl(deployment, { fetchImpl, timeoutMs: 5 })
    ).rejects.toThrow('timed out');
  });
});

describe('local deployment public validation rollback', () => {
  it('should remove a failed first deployment from the public target', async () => {
    const rename = vi.fn().mockResolvedValue(undefined);

    await rollbackPublicValidationFailure(
      { rename },
      {
        previousRemoteDir: null,
        safeRemoteDir: '/html/prod',
        tempRemoteDir: '/html/.prod-upload-failed'
      }
    );

    expect(rename).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith(
      '/html/prod',
      '/html/.prod-upload-failed'
    );
  });

  it('should restore the previous version after public validation fails', async () => {
    const rename = vi.fn().mockResolvedValue(undefined);

    await rollbackPublicValidationFailure(
      { rename },
      {
        previousRemoteDir: '/html/.prod-old-stable',
        safeRemoteDir: '/html/prod',
        tempRemoteDir: '/html/.prod-upload-failed'
      }
    );

    expect(rename).toHaveBeenNthCalledWith(
      1,
      '/html/prod',
      '/html/.prod-upload-failed'
    );
    expect(rename).toHaveBeenNthCalledWith(
      2,
      '/html/.prod-old-stable',
      '/html/prod'
    );
  });
});
