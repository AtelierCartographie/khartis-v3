import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deployScriptUrl = pathToFileURL(
  path.resolve(process.cwd(), 'scripts/deploy-local.mjs')
).href;
const {
  acquireRemoteDeploymentLock,
  assertBuildMatchesDeployment,
  assertReleaseCommitBelongsToBranch,
  assertTagCommitMatchesRemote,
  createTerminationCoordinator,
  findCompressedWasmAssetPath,
  findSuccessfulReleaseRun,
  parseRemoteBranchHead,
  parseRemoteTagCommit,
  parseRemoteTagNames,
  releaseRemoteDeploymentLock,
  retainPreviousReleaseAssets,
  rollbackPublicValidationFailure,
  resolveDeploymentPublicUrl,
  sanitizedChildEnv,
  verifyPublicInfrastructure,
  verifyPublicInfrastructureWithRetries,
  verifyPublicUrl,
  verifyPublicUrlWithRetries,
  writeReleaseAssetManifest
} = await import(deployScriptUrl);

interface FakeResponse {
  headers: Headers;
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  url: string;
}

const EXPECTED_VERSION = 'v1.14.0';
const WASM_ASSET_PATH = '_app/immutable/assets/duckdb-eh.TESTHASH.wasm';

function createResponse(
  url: string,
  {
    backendHeader,
    baseHref = '/cartographie/khartis/',
    body,
    cacheControl = 'no-store',
    contentEncoding,
    contentType = 'text/html; charset=utf-8',
    location,
    setCookie,
    status = 200,
    vary
  }: {
    backendHeader?: string;
    baseHref?: string;
    body?: string;
    cacheControl?: string | null;
    contentEncoding?: string;
    contentType?: string;
    location?: string;
    setCookie?: string;
    status?: number;
    vary?: string;
  } = {}
): FakeResponse {
  const headers = new Headers({ 'content-type': contentType });
  if (backendHeader) headers.set('x-khartis-backend', backendHeader);
  if (cacheControl) headers.set('cache-control', cacheControl);
  if (contentEncoding) headers.set('content-encoding', contentEncoding);
  if (location) headers.set('location', location);
  if (setCookie) headers.append('set-cookie', setCookie);
  if (vary) headers.set('vary', vary);
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
  if (url.endsWith('/_app/version.json')) {
    return createResponse(url, {
      body: JSON.stringify({ version: EXPECTED_VERSION }),
      contentType: 'application/json'
    });
  }
  if (url.endsWith('/sw.js')) {
    return createResponse(url, {
      body: 'self.addEventListener("install", () => {});',
      contentType: 'application/javascript'
    });
  }
  if (url.endsWith('/manifest.webmanifest')) {
    return createResponse(url, {
      body: '{}',
      contentType: 'application/manifest+json'
    });
  }
  if (url.includes('/__khartis-deploy-missing.')) {
    return createResponse(url, {
      body: 'not found',
      contentType: 'text/plain',
      status: 404
    });
  }
  if (url.endsWith(`/${WASM_ASSET_PATH}`)) {
    return createResponse(url, {
      cacheControl: 'public, max-age=31536000, immutable',
      contentEncoding: 'br',
      contentType: 'application/wasm',
      vary: 'Accept-Encoding'
    });
  }
  if (url.endsWith('/_app/start.js')) {
    return createResponse(url, {
      body: 'export {};',
      cacheControl: 'public, max-age=31536000, immutable',
      contentType: 'application/javascript'
    });
  }
  if (url.endsWith('/_app/app.css')) {
    return createResponse(url, {
      body: ':root {}',
      cacheControl: 'public, max-age=31536000, immutable',
      contentType: 'text/css'
    });
  }
  return createResponse(url, { baseHref });
}

function createPendingBodyResponse(
  response: FakeResponse,
  signal: AbortSignal | null | undefined
): FakeResponse {
  response.text = () =>
    new Promise<string>((_resolve, reject) => {
      const rejectOnAbort = () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (signal?.aborted) {
        rejectOnAbort();
        return;
      }
      signal?.addEventListener('abort', rejectOnAbort, { once: true });
    });
  return response;
}

function verifyOptions(
  fetchImpl: (url: string, init: RequestInit) => Promise<FakeResponse>,
  overrides: Record<string, unknown> = {}
) {
  return {
    expectedVersion: EXPECTED_VERSION,
    fetchImpl,
    wasmAssetPath: WASM_ASSET_PATH,
    ...overrides
  };
}

function createFakeSftp(
  initialFiles: Record<string, string>,
  fileSizeOverrides: Record<string, number> = {}
) {
  const files = new Map(Object.entries(initialFiles));
  const directories = new Set<string>();

  function addDirectory(directory: string) {
    let current = path.posix.normalize(directory);
    while (!directories.has(current)) {
      directories.add(current);
      const parent = path.posix.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  for (const filePath of files.keys()) {
    addDirectory(path.posix.dirname(filePath));
  }

  const client = {
    exists: vi.fn(async (remotePath: string) => {
      if (files.has(remotePath)) return '-';
      if (directories.has(remotePath)) return 'd';
      return false;
    }),
    get: vi.fn(async (remotePath: string) => {
      const content = files.get(remotePath);
      if (content === undefined) {
        throw new Error(`Missing fake remote file: ${remotePath}`);
      }
      return Buffer.from(content);
    }),
    list: vi.fn(async (remoteDir: string) => {
      const entries = new Map<string, '-' | 'd'>();

      for (const directory of directories) {
        if (
          directory !== remoteDir &&
          path.posix.dirname(directory) === remoteDir
        ) {
          entries.set(path.posix.basename(directory), 'd');
        }
      }
      for (const filePath of files.keys()) {
        if (path.posix.dirname(filePath) === remoteDir) {
          entries.set(path.posix.basename(filePath), '-');
        }
      }

      return [...entries]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, type]) => {
          const remotePath = path.posix.join(remoteDir, name);
          return {
            name,
            size:
              type === '-'
                ? (fileSizeOverrides[remotePath] ??
                  Buffer.byteLength(files.get(remotePath) ?? ''))
                : 0,
            type
          };
        });
    }),
    mkdir: vi.fn(async (remoteDir: string) => {
      addDirectory(remoteDir);
    }),
    rcopy: vi.fn(async (sourcePath: string, destinationPath: string) => {
      const content = files.get(sourcePath);
      if (content === undefined) {
        throw new Error(`Missing fake remote source: ${sourcePath}`);
      }
      if (files.has(destinationPath)) {
        throw new Error(`Fake remote destination exists: ${destinationPath}`);
      }
      files.set(destinationPath, content);
    })
  };

  return { client, files };
}

describe('local deployment release provenance', () => {
  const stagingSha = 'a'.repeat(40);
  const productionSha = 'b'.repeat(40);

  it('should select only tag names advertised by origin', () => {
    expect(
      parseRemoteTagNames(
        [
          `${stagingSha}\trefs/tags/v1.9.0-pprd.8`,
          `${productionSha}\trefs/tags/v1.14.0`,
          `${productionSha}\trefs/heads/main`,
          `${stagingSha}\trefs/tags/v1.14.0^{}`
        ].join('\n')
      )
    ).toEqual(['v1.9.0-pprd.8', 'v1.14.0']);
  });

  it('should resolve an annotated remote tag to its peeled commit', () => {
    expect(
      parseRemoteTagCommit(
        [
          `${stagingSha}\trefs/tags/v1.14.0`,
          `${productionSha}\trefs/tags/v1.14.0^{}`
        ].join('\n'),
        'v1.14.0'
      )
    ).toBe(productionSha);
  });

  it('should reject a tag that exists only locally', () => {
    expect(() => parseRemoteTagCommit('', 'v9.9.9')).toThrow(
      'does not exist on origin'
    );
  });

  it('should reject a local tag that differs from origin', () => {
    expect(() =>
      assertTagCommitMatchesRemote('v1.14.0', stagingSha, productionSha)
    ).toThrow('different commit than origin');
  });

  it('should resolve only the exact remote release branch', () => {
    expect(
      parseRemoteBranchHead(
        [
          `${stagingSha}\trefs/heads/staging-old`,
          `${productionSha}\trefs/heads/staging`
        ].join('\n'),
        'staging'
      )
    ).toBe(productionSha);
    expect(() => parseRemoteBranchHead('', 'main')).toThrow(
      'does not exist on origin'
    );
  });

  it('should reject a release commit removed from the target branch', () => {
    expect(() =>
      assertReleaseCommitBelongsToBranch('v1.14.0', 'main', 1)
    ).toThrow('no longer belongs to origin/main');
    expect(() =>
      assertReleaseCommitBelongsToBranch('v1.14.0', 'main', 0)
    ).not.toThrow();
  });

  it('should require a green push run on the target release branch', () => {
    const runs = [
      {
        conclusion: 'success',
        event: 'push',
        headBranch: 'staging',
        headSha: productionSha,
        status: 'completed'
      },
      {
        conclusion: 'success',
        event: 'push',
        headBranch: 'main',
        headSha: productionSha,
        status: 'completed'
      }
    ];

    expect(findSuccessfulReleaseRun(runs, productionSha, 'main')).toMatchObject(
      { headBranch: 'main' }
    );
    expect(
      findSuccessfulReleaseRun(runs.slice(0, 1), productionSha, 'main')
    ).toBeUndefined();
  });
});

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

  it('should package only immutable files in the release asset manifest', async () => {
    await mkdir(path.join(buildDir, '_app/immutable/chunks'), {
      recursive: true
    });
    await writeFile(
      path.join(buildDir, '_app/immutable/chunks/app.A1.js'),
      'export {};'
    );
    await writeFile(
      path.join(buildDir, '_app/immutable/chunks/app.A1.js.br'),
      'compressed'
    );
    await writeFile(path.join(buildDir, 'index.html'), '<html></html>');
    await writeFile(path.join(buildDir, 'sw.js'), 'self.addEventListener();');

    await expect(writeReleaseAssetManifest(buildDir)).resolves.toEqual([
      '_app/immutable/chunks/app.A1.js',
      '_app/immutable/chunks/app.A1.js.br'
    ]);
    const manifest = JSON.parse(
      await readFile(
        path.join(buildDir, '.khartis-release-assets.json'),
        'utf8'
      )
    );
    expect(manifest).toEqual({
      formatVersion: 1,
      assets: [
        '_app/immutable/chunks/app.A1.js',
        '_app/immutable/chunks/app.A1.js.br'
      ]
    });
  });

  it('should derive a raw WASM URL from a tracked compression sidecar', () => {
    expect(
      findCompressedWasmAssetPath([
        '_app/immutable/assets/duckdb-eh.A1.wasm.br',
        '_app/immutable/assets/duckdb-eh.A1.wasm',
        '_app/immutable/chunks/app.B2.js'
      ])
    ).toBe('_app/immutable/assets/duckdb-eh.A1.wasm');
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

  it('should accept the current infrastructure without requiring the future tag or WASM asset', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.org/cartographie/khartis') {
        return createResponse(url, {
          location: deployment.publicUrl,
          status: 301
        });
      }
      if (url.endsWith('/_app/version.json')) {
        return createResponse(url, {
          body: JSON.stringify({ version: 'v1.13.9' }),
          contentType: 'application/json'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicInfrastructure(deployment, { fetchImpl })
    ).resolves.toBe('present');
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(fetchImpl).not.toHaveBeenCalledWith(
      expect.stringContaining('.wasm'),
      expect.anything()
    );
  });

  it('should reject a private immutable critical asset during the infrastructure preflight', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/_app/start.js')) {
        return createResponse(url, {
          cacheControl: 'public, private, max-age=31536000, immutable',
          contentType: 'application/javascript'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicInfrastructure(deployment, { fetchImpl })
    ).rejects.toThrow('without private, no-store, or no-cache');
  });

  it('should reject no-cache on an immutable critical asset', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/_app/start.js')) {
        return createResponse(url, {
          cacheControl: 'public, max-age=31536000, immutable, no-cache',
          contentType: 'application/javascript'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicInfrastructure(deployment, { fetchImpl })
    ).rejects.toThrow('without private, no-store, or no-cache');
  });

  it('should reject a critical asset with an invalid MIME suffix', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/_app/app.css')) {
        return createResponse(url, {
          cacheControl: 'public, max-age=31536000, immutable',
          contentType: 'text/css-invalid'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicInfrastructure(deployment, { fetchImpl })
    ).rejects.toThrow('text/css-invalid');
  });

  it('should reject a critical asset without max-age during post-swap validation', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/_app/app.css')) {
        return createResponse(url, {
          cacheControl: 'public, immutable',
          contentType: 'text/css'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow('a positive max-age');
  });

  it('should allow an explicit canonical 404 for a first deployment', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) =>
      createResponse(url, { status: 404 })
    );

    await expect(
      verifyPublicInfrastructure(deployment, { fetchImpl })
    ).resolves.toBe('missing');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('should reject a canonical failure other than 404 before SFTP', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) =>
      createResponse(url, { status: 503 })
    );

    await expect(
      verifyPublicInfrastructure(deployment, { fetchImpl })
    ).rejects.toThrow('returned 503');
  });

  it('should reject inconsistent first-deployment state across backends', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const cookie = new Headers(init.headers).get('cookie');
      const backendHeader = cookie?.slice('SERVERID='.length);
      if (cookie === 'SERVERID=router-1' && url === deployment.publicUrl) {
        return createResponse(url, { backendHeader, status: 404 });
      }
      if (url === 'https://example.org/cartographie/khartis') {
        return createResponse(url, {
          backendHeader,
          location: deployment.publicUrl,
          status: 301
        });
      }
      const response = createSuccessfulResponse(url);
      response.headers.set('x-khartis-backend', backendHeader ?? '');
      return response;
    });

    await expect(
      verifyPublicInfrastructureWithRetries(deployment, {
        backendRouting: {
          backendHeaderName: 'X-Khartis-Backend',
          cookieName: 'SERVERID',
          backendValues: ['router-1', 'router-2']
        },
        fetchImpl,
        validationAttempts: 1
      })
    ).rejects.toThrow('some backends serve the canonical route');
  });

  it.each([301, 308])(
    'should accept the slashless route when it returns a canonical %s redirect',
    async (status) => {
      const deployment = resolveDeploymentPublicUrl(
        'https://example.org/cartographie/khartis/'
      );
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === 'https://example.org/cartographie/khartis') {
          return createResponse(url, {
            location: deployment.publicUrl,
            status
          });
        }
        return createSuccessfulResponse(url);
      });

      await expect(
        verifyPublicUrl(deployment, verifyOptions(fetchImpl))
      ).resolves.toBeUndefined();
      expect(fetchImpl).toHaveBeenCalledTimes(9);
      expect(fetchImpl).toHaveBeenCalledWith(
        `https://example.org/cartographie/khartis/${WASM_ASSET_PATH}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept-encoding': 'br, gzip'
          }),
          method: 'HEAD'
        })
      );
    }
  );

  it.each([200, 302, 307])(
    'should reject the slashless route when it returns %s',
    async (status) => {
      const deployment = resolveDeploymentPublicUrl(
        'https://example.org/cartographie/khartis/'
      );
      const fetchImpl = vi.fn(async (url: string) => {
        if (url === 'https://example.org/cartographie/khartis') {
          return createResponse(url, {
            location: deployment.publicUrl,
            status
          });
        }
        return createSuccessfulResponse(url);
      });

      await expect(
        verifyPublicUrl(deployment, verifyOptions(fetchImpl))
      ).rejects.toThrow(`returned ${status}`);
    }
  );

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

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow('Public module script returned 403');
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

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow('Public stylesheet returned text/html');
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

      await expect(
        verifyPublicUrl(deployment, verifyOptions(fetchImpl))
      ).rejects.toThrow(`returned ${status}`);
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

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow('expected "/cartographie/khartis/"');
  });

  it('should reject mutable HTML without no-store', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) =>
      createResponse(url, { cacheControl: 'private' })
    );

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow('Public HTML must use Cache-Control: no-store');
  });

  it('should reject the deployment when version metadata does not serve the selected tag', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/_app/version.json')) {
        return createResponse(url, {
          body: JSON.stringify({ version: 'v1.13.9' }),
          contentType: 'application/json'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow('serves "v1.13.9"; expected "v1.14.0"');
  });

  it('should reject mutable version metadata without no-store', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/_app/version.json')) {
        return createResponse(url, {
          body: JSON.stringify({ version: EXPECTED_VERSION }),
          cacheControl: 'private',
          contentType: 'application/json'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow(
      'Public version metadata must use Cache-Control: no-store'
    );
  });

  it('should reject the web app manifest when its MIME type is generic binary', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/manifest.webmanifest')) {
        return createResponse(url, {
          body: '{}',
          contentType: 'application/octet-stream'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow(
      'Public web app manifest returned application/octet-stream'
    );
  });

  it('should reject the service worker without no-store', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/sw.js')) {
        return createResponse(url, {
          cacheControl: 'public, max-age=3600',
          contentType: 'application/javascript'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow('Public service worker must use Cache-Control: no-store');
  });

  it('should reject a missing hashed asset with immutable caching', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/__khartis-deploy-missing.')) {
        return createResponse(url, {
          cacheControl: 'public, max-age=31536000, immutable',
          contentType: 'text/plain',
          status: 404
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow(
      'Missing hashed asset must use Cache-Control: no-store without immutable'
    );
  });

  it('should reject an uncompressed WASM response', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith(`/${WASM_ASSET_PATH}`)) {
        return createResponse(url, {
          cacheControl: 'public, max-age=31536000, immutable',
          contentType: 'application/wasm',
          vary: 'Accept-Encoding'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow(
      'Public WASM asset is not served with Brotli or gzip compression'
    );
  });

  it('should reject a non-cacheable immutable WASM response', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith(`/${WASM_ASSET_PATH}`)) {
        return createResponse(url, {
          cacheControl: 'private, no-store',
          contentEncoding: 'br',
          contentType: 'application/wasm',
          vary: 'Accept-Encoding'
        });
      }
      return createSuccessfulResponse(url);
    });

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow(
      'Public WASM asset must use Cache-Control with public, a positive max-age, and immutable'
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

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl))
    ).rejects.toThrow('redirects to http://');
  });

  it('should stop the deployment when the public check times out', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = () =>
      new Promise<FakeResponse>(() => {
        // Intentionally ignores AbortSignal to exercise the explicit deadline.
      });

    await expect(
      verifyPublicUrl(deployment, verifyOptions(fetchImpl, { timeoutMs: 5 }))
    ).rejects.toThrow('timed out');
  });

  it('should stop the preflight when a successful HTML response body times out', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      const response = createSuccessfulResponse(url);
      response.text = () =>
        new Promise<string>(() => {
          // Intentionally ignores AbortSignal to exercise the explicit deadline.
        });
      return response;
    });

    await expect(
      verifyPublicInfrastructure(deployment, { fetchImpl, timeoutMs: 5 })
    ).rejects.toThrow('timed out');
  });

  it('should stop the preflight when a successful version response body times out', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const response = createSuccessfulResponse(url);
      if (url.endsWith('/_app/version.json')) {
        return createPendingBodyResponse(response, init.signal);
      }
      return response;
    });

    await expect(
      verifyPublicInfrastructure(deployment, { fetchImpl, timeoutMs: 5 })
    ).rejects.toThrow('timed out');
  });

  it('should validate the complete public contract on every configured backend', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const observedCookies = new Set<string>();
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const cookie = new Headers(init.headers).get('cookie');
      if (!cookie) throw new Error('missing routing cookie');
      observedCookies.add(cookie);
      if (url === 'https://example.org/cartographie/khartis') {
        return createResponse(url, {
          backendHeader: cookie.slice('SERVERID='.length),
          location: deployment.publicUrl,
          setCookie: `${cookie}; Path=/`,
          status: 301
        });
      }
      const response = createSuccessfulResponse(url);
      response.headers.set(
        'x-khartis-backend',
        cookie.slice('SERVERID='.length)
      );
      response.headers.append('set-cookie', `${cookie}; Path=/; HttpOnly`);
      return response;
    });

    await expect(
      verifyPublicUrlWithRetries(
        deployment,
        verifyOptions(fetchImpl, {
          backendRouting: {
            backendHeaderName: 'X-Khartis-Backend',
            cookieName: 'SERVERID',
            backendValues: ['router-1', 'router-2']
          },
          validationAttempts: 1
        })
      )
    ).resolves.toBeUndefined();
    expect(observedCookies).toEqual(
      new Set(['SERVERID=router-1', 'SERVERID=router-2'])
    );
    expect(fetchImpl).toHaveBeenCalledTimes(18);
  });

  it('should reject the deployment when one configured backend is stale', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const cookie = new Headers(init.headers).get('cookie');
      if (url === 'https://example.org/cartographie/khartis') {
        return createResponse(url, {
          backendHeader: cookie?.slice('SERVERID='.length),
          location: deployment.publicUrl,
          setCookie: `${cookie}; Path=/`,
          status: 301
        });
      }
      if (
        cookie === 'SERVERID=router-2' &&
        url.endsWith('/_app/version.json')
      ) {
        return createResponse(url, {
          backendHeader: 'router-2',
          body: JSON.stringify({ version: 'v1.13.9' }),
          contentType: 'application/json',
          setCookie: `${cookie}; Path=/`
        });
      }
      const response = createSuccessfulResponse(url);
      response.headers.set(
        'x-khartis-backend',
        cookie?.slice('SERVERID='.length) ?? ''
      );
      response.headers.append('set-cookie', `${cookie}; Path=/`);
      return response;
    });

    await expect(
      verifyPublicUrlWithRetries(
        deployment,
        verifyOptions(fetchImpl, {
          backendRouting: {
            backendHeaderName: 'X-Khartis-Backend',
            cookieName: 'SERVERID',
            backendValues: ['router-1', 'router-2']
          },
          validationAttempts: 1
        })
      )
    ).rejects.toThrow('serves "v1.13.9"; expected "v1.14.0"');
  });

  it('should reject a backend route when the load balancer does not confirm it', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'https://example.org/cartographie/khartis') {
        return createResponse(url, {
          backendHeader: 'router-1',
          location: deployment.publicUrl,
          setCookie: 'SERVERID=router-1; Path=/',
          status: 301
        });
      }
      const response = createSuccessfulResponse(url);
      response.headers.set('x-khartis-backend', 'router-1');
      response.headers.append('set-cookie', 'SERVERID=router-1; Path=/');
      return response;
    });

    await expect(
      verifyPublicUrlWithRetries(
        deployment,
        verifyOptions(fetchImpl, {
          backendRouting: {
            backendHeaderName: 'X-Khartis-Backend',
            cookieName: 'SERVERID',
            backendValues: ['router-1', 'router-2']
          },
          validationAttempts: 1
        })
      )
    ).rejects.toThrow('did not confirm routing backend 2/2');
  });

  it('should reject a cache-policy error isolated to one backend', async () => {
    const deployment = resolveDeploymentPublicUrl(
      'https://example.org/cartographie/khartis/'
    );
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const cookie = new Headers(init.headers).get('cookie');
      if (url === 'https://example.org/cartographie/khartis') {
        return createResponse(url, {
          backendHeader: cookie?.slice('SERVERID='.length),
          location: deployment.publicUrl,
          setCookie: `${cookie}; Path=/`,
          status: 301
        });
      }
      if (cookie === 'SERVERID=router-2' && url.endsWith('/sw.js')) {
        return createResponse(url, {
          backendHeader: 'router-2',
          cacheControl: 'public, max-age=3600',
          contentType: 'application/javascript',
          setCookie: `${cookie}; Path=/`
        });
      }
      const response = createSuccessfulResponse(url);
      response.headers.set(
        'x-khartis-backend',
        cookie?.slice('SERVERID='.length) ?? ''
      );
      response.headers.append('set-cookie', `${cookie}; Path=/`);
      return response;
    });

    await expect(
      verifyPublicUrlWithRetries(
        deployment,
        verifyOptions(fetchImpl, {
          backendRouting: {
            backendHeaderName: 'X-Khartis-Backend',
            cookieName: 'SERVERID',
            backendValues: ['router-1', 'router-2']
          },
          validationAttempts: 1
        })
      )
    ).rejects.toThrow('Public service worker must use Cache-Control: no-store');
  });
});

describe('local deployment child environment', () => {
  it('should remove deployment credentials and routing identifiers from child processes', () => {
    const env = sanitizedChildEnv({
      KHARTIS_HTTP_ROUTING_COOKIE_NAME: 'route',
      KHARTIS_HTTP_ROUTING_BACKENDS_PPRD: 'backend-1',
      KHARTIS_SFTP_USER: 'test-user',
      PUBLIC_GTM_CONTAINER_ID: 'GTM-TEST'
    });

    expect(env.KHARTIS_HTTP_ROUTING_COOKIE_NAME).toBeUndefined();
    expect(env.KHARTIS_HTTP_ROUTING_BACKENDS_PPRD).toBeUndefined();
    expect(env.KHARTIS_SFTP_USER).toBeUndefined();
    expect(env.PUBLIC_GTM_CONTAINER_ID).toBe('GTM-TEST');
  });
});

describe('local deployment remote lock', () => {
  function createLockClient(initiallyLocked = false) {
    let locked = initiallyLocked;
    const client = {
      exists: vi.fn(async () => (locked ? 'd' : false)),
      mkdir: vi.fn(async () => {
        if (locked) throw new Error('already exists');
        locked = true;
      }),
      rmdir: vi.fn(async () => {
        if (!locked) throw new Error('missing lock');
        locked = false;
      })
    };
    return { client, isLocked: () => locked };
  }

  it('should refuse a second deployment while the remote lock exists', async () => {
    const { client } = createLockClient(true);

    await expect(
      acquireRemoteDeploymentLock(client, '/srv/html/prod.deploy-lock')
    ).rejects.toThrow('Another deployment may be active');
    expect(client.mkdir).not.toHaveBeenCalled();
  });

  it('should release the lock so a later deployment can acquire it', async () => {
    const { client, isLocked } = createLockClient();

    await acquireRemoteDeploymentLock(client, '/srv/html/prod.deploy-lock');
    expect(isLocked()).toBe(true);
    await releaseRemoteDeploymentLock(client, '/srv/html/prod.deploy-lock');
    expect(isLocked()).toBe(false);
    await expect(
      acquireRemoteDeploymentLock(client, '/srv/html/prod.deploy-lock')
    ).resolves.toBeUndefined();
  });

  it('should recover an existing lock only with explicit confirmation', async () => {
    const { client, isLocked } = createLockClient(true);

    await expect(
      acquireRemoteDeploymentLock(client, '/srv/html/prod.deploy-lock', {
        recoverStaleLock: true
      })
    ).resolves.toBeUndefined();
    expect(client.rmdir).toHaveBeenCalledTimes(1);
    expect(isLocked()).toBe(true);
  });
});

describe('local deployment termination safety', () => {
  it('should finish swap and validation after a signal during the second rename', async () => {
    const exitProcess = vi.fn();
    const coordinator = createTerminationCoordinator({
      exitProcess,
      warnMessage: vi.fn()
    });
    const steps: string[] = [];

    coordinator.beginRemoteDeployment();
    await coordinator.runCritical(
      'remote publication and validation',
      async () => {
        steps.push('first rename');
        coordinator.handleSignal('SIGINT');
        steps.push('second rename');
        steps.push('public validation');
      }
    );
    coordinator.endRemoteDeployment();

    expect(exitProcess).not.toHaveBeenCalled();
    expect(steps).toEqual([
      'first rename',
      'second rename',
      'public validation'
    ]);
    expect(() =>
      coordinator.checkpoint('after public validation')
    ).toThrowError(
      expect.objectContaining({
        exitCode: 130,
        name: 'DeploymentInterruptedError'
      })
    );
  });

  it('should finish an in-flight validation before honoring a signal', async () => {
    const coordinator = createTerminationCoordinator({
      exitProcess: vi.fn(),
      warnMessage: vi.fn()
    });
    const steps: string[] = [];

    coordinator.beginRemoteDeployment();
    await coordinator.runCritical(
      'remote publication and validation',
      async () => {
        steps.push('validation started');
        coordinator.handleSignal('SIGTERM');
        steps.push('validation completed');
      }
    );
    coordinator.endRemoteDeployment();

    expect(steps).toEqual(['validation started', 'validation completed']);
    expect(() => coordinator.checkpoint('after cleanup')).toThrow(
      'Interrupted by SIGTERM'
    );
  });
});

describe('local deployment immutable asset retention', () => {
  const previousRemoteDir = '/srv/html/prod';
  const uploadRemoteDir = '/srv/html/prod.upload-new';

  it('should add missing assets from the immediately previous release', async () => {
    const previousAssets = [
      '_app/immutable/chunks/shared.A1.js',
      '_app/immutable/chunks/old.B2.js',
      '_app/immutable/chunks/old.B2.js.br'
    ];
    const { client, files } = createFakeSftp({
      [`${previousRemoteDir}/.khartis-release-assets.json`]: JSON.stringify({
        formatVersion: 1,
        assets: previousAssets
      }),
      [`${previousRemoteDir}/_app/immutable/chunks/shared.A1.js`]: 'shared',
      [`${previousRemoteDir}/_app/immutable/chunks/old.B2.js`]: 'old',
      [`${previousRemoteDir}/_app/immutable/chunks/old.B2.js.br`]:
        'old-compressed',
      [`${previousRemoteDir}/index.html`]: 'old html',
      [`${previousRemoteDir}/sw.js`]: 'old worker',
      [`${uploadRemoteDir}/_app/immutable/chunks/shared.A1.js`]: 'shared',
      [`${uploadRemoteDir}/_app/immutable/chunks/new.C3.js`]: 'new'
    });

    await expect(
      retainPreviousReleaseAssets(client, {
        currentAssetPaths: [
          '_app/immutable/chunks/shared.A1.js',
          '_app/immutable/chunks/new.C3.js'
        ],
        previousRemoteDir,
        uploadRemoteDir
      })
    ).resolves.toEqual({
      copiedFiles: 2,
      previousFiles: 3
    });

    expect(
      files.get(`${uploadRemoteDir}/_app/immutable/chunks/old.B2.js`)
    ).toBe('old');
    expect(
      files.get(`${uploadRemoteDir}/_app/immutable/chunks/old.B2.js.br`)
    ).toBe('old-compressed');
    expect(files.get(`${uploadRemoteDir}/index.html`)).toBeUndefined();
    expect(files.get(`${uploadRemoteDir}/sw.js`)).toBeUndefined();
    expect(client.rcopy).toHaveBeenCalledTimes(2);
  });

  it('should reject automatic retention when the previous manifest is absent', async () => {
    const { client } = createFakeSftp({
      [`${previousRemoteDir}/_app/immutable/chunks/old.D4.js`]: 'old chunk',
      [`${uploadRemoteDir}/_app/immutable/chunks/new.F6.js`]: 'new chunk'
    });

    await expect(
      retainPreviousReleaseAssets(client, {
        currentAssetPaths: ['_app/immutable/chunks/new.F6.js'],
        previousRemoteDir,
        uploadRemoteDir
      })
    ).rejects.toThrow(
      'Re-run this deployment once with --migrate-legacy-assets'
    );
    expect(client.list).not.toHaveBeenCalled();
  });

  it('should reject automatic retention when the previous manifest is corrupt', async () => {
    const { client } = createFakeSftp({
      [`${previousRemoteDir}/.khartis-release-assets.json`]: '{not-json',
      [`${previousRemoteDir}/_app/immutable/chunks/old.D4.js`]: 'old chunk',
      [`${uploadRemoteDir}/_app/immutable/chunks/new.F6.js`]: 'new chunk'
    });

    await expect(
      retainPreviousReleaseAssets(client, {
        currentAssetPaths: ['_app/immutable/chunks/new.F6.js'],
        previousRemoteDir,
        uploadRemoteDir
      })
    ).rejects.toThrow('Could not parse release asset manifest');
    expect(client.list).not.toHaveBeenCalled();
  });

  it('should migrate one legacy generation without retaining it again later', async () => {
    const firstUploadDir = '/srv/html/prod.upload-first';
    const secondUploadDir = '/srv/html/prod.upload-second';
    const legacyAsset = '_app/immutable/chunks/legacy.A1.js';
    const firstAsset = '_app/immutable/chunks/first.B2.js';
    const secondAsset = '_app/immutable/chunks/second.C3.js';
    const { client, files } = createFakeSftp({
      [`${previousRemoteDir}/${legacyAsset}`]: 'legacy',
      [`${firstUploadDir}/.khartis-release-assets.json`]: JSON.stringify({
        formatVersion: 1,
        assets: [firstAsset]
      }),
      [`${firstUploadDir}/${firstAsset}`]: 'first',
      [`${secondUploadDir}/${secondAsset}`]: 'second'
    });

    await expect(
      retainPreviousReleaseAssets(client, {
        allowLegacyAssetScan: true,
        currentAssetPaths: [firstAsset],
        previousRemoteDir,
        uploadRemoteDir: firstUploadDir
      })
    ).resolves.toEqual({
      copiedFiles: 1,
      previousFiles: 1
    });
    expect(files.get(`${firstUploadDir}/${legacyAsset}`)).toBe('legacy');

    await expect(
      retainPreviousReleaseAssets(client, {
        currentAssetPaths: [secondAsset],
        previousRemoteDir: firstUploadDir,
        uploadRemoteDir: secondUploadDir
      })
    ).resolves.toEqual({
      copiedFiles: 1,
      previousFiles: 1
    });
    expect(files.get(`${secondUploadDir}/${firstAsset}`)).toBe('first');
    expect(files.get(`${secondUploadDir}/${legacyAsset}`)).toBeUndefined();
  });

  it('should bound an explicit legacy migration by remote byte size', async () => {
    const oversizedAsset = `${previousRemoteDir}/_app/immutable/chunks/oversized.A1.js`;
    const { client } = createFakeSftp(
      {
        [oversizedAsset]: 'small fake content',
        [`${uploadRemoteDir}/_app/immutable/chunks/new.F6.js`]: 'new chunk'
      },
      {
        [oversizedAsset]: 512 * 1024 * 1024 + 1
      }
    );

    await expect(
      retainPreviousReleaseAssets(client, {
        allowLegacyAssetScan: true,
        currentAssetPaths: ['_app/immutable/chunks/new.F6.js'],
        previousRemoteDir,
        uploadRemoteDir
      })
    ).rejects.toThrow('Legacy immutable asset scan exceeds 512.0 MB');
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
