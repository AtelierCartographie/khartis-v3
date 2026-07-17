#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import SftpClient from 'ssh2-sftp-client';

const REPO = 'AtelierCartographie/khartis-v3';
const RELEASE_WORKFLOW = 'release.yml';
const LOCAL_ENV_FILES = ['.env', '.env.deploy.local'];
const DEFAULT_PORT = 22;
const PUBLIC_URL_CHECK_TIMEOUT_MS = 15_000;
const PUBLIC_URL_VALIDATION_ATTEMPTS = 5;
const PUBLIC_URL_VALIDATION_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];
const SFTP_READY_TIMEOUT_MS = 20_000;
const SFTP_KEEPALIVE_INTERVAL_MS = 10_000;
const SFTP_KEEPALIVE_COUNT_MAX = 3;
const REMOTE_SIBLING_KIND_UPLOAD = 'upload';
const REMOTE_SIBLING_KIND_OLD = 'old';
const REMOTE_DEPLOYMENT_LOCK_SUFFIX = 'deploy-lock';
const STALE_SIBLING_MIN_AGE_MS = 60 * 60 * 1000;
const SFTP_CLOSE_TIMEOUT_MS = 5_000;
const HTTP_ROUTING_COOKIE_NAME_ENV = 'KHARTIS_HTTP_ROUTING_COOKIE_NAME';
const HTTP_BACKEND_HEADER_NAME_ENV = 'KHARTIS_HTTP_BACKEND_HEADER_NAME';
const RELEASE_ASSET_ROOT = '_app/immutable';
const RELEASE_ASSET_MANIFEST_FILENAME = '.khartis-release-assets.json';
const RELEASE_ASSET_MANIFEST_VERSION = 1;
const LEGACY_ASSET_SCAN_MAX_FILES = 2_000;
const LEGACY_ASSET_SCAN_MAX_BYTES = 512 * 1024 * 1024;
const ALLOWED_PUBLIC_REDIRECT_STATUSES = new Set([301, 308]);
const PUBLIC_INFRASTRUCTURE_PRESENT = 'present';
const PUBLIC_INFRASTRUCTURE_MISSING = 'missing';
const PUBLIC_PREFLIGHT_MISSING_ASSET_SEED = 'infrastructure-preflight';
// Accept legacy -staging.N and current -pprd.N prereleases; at an equal version the
// current pprd channel wins over the legacy staging channel.
const PPRD_TAG_PATTERN =
  /^v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)-(?<channel>staging|pprd)\.(?<prerelease>\d+)$/;
const PROD_TAG_PATTERN = /^v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/;

const TARGETS = {
  pprd: {
    tagPattern: PPRD_TAG_PATTERN,
    remoteDirLeaf: 'pprd',
    remoteDirEnv: 'KHARTIS_SFTP_REMOTE_DIR_PPRD',
    publicUrlEnv: 'KHARTIS_PUBLIC_URL_PPRD',
    gtmContainerEnv: 'KHARTIS_GTM_CONTAINER_ID_PPRD',
    backendRoutingValuesEnv: 'KHARTIS_HTTP_ROUTING_BACKENDS_PPRD',
    khartisEnv: 'preproduction',
    releaseBranch: 'staging',
    uploadEnabled: true
  },
  prod: {
    tagPattern: PROD_TAG_PATTERN,
    remoteDirLeaf: 'prod',
    remoteDirEnv: 'KHARTIS_SFTP_REMOTE_DIR_PROD',
    publicUrlEnv: 'KHARTIS_PUBLIC_URL_PROD',
    gtmContainerEnv: 'KHARTIS_GTM_CONTAINER_ID_PROD',
    backendRoutingValuesEnv: 'KHARTIS_HTTP_ROUTING_BACKENDS_PROD',
    khartisEnv: 'production',
    releaseBranch: 'main',
    uploadEnabled: true,
    productionConfirmation: true
  }
};

const TARGET_ALIASES = {
  pprd: 'pprd',
  staging: 'pprd',
  prod: 'prod',
  production: 'prod'
};

const usage = `Usage:
  pnpm deploy:pprd
  pnpm deploy:pprd:dry-run
  pnpm deploy:prod
  pnpm deploy:prod:dry-run
  pnpm deploy:pprd -- --tag <tag>
  pnpm deploy:prod -- --tag <tag>
  pnpm deploy:pprd -- --migrate-legacy-assets
  pnpm deploy:prod -- --migrate-legacy-assets
  pnpm deploy:pprd -- --recover-stale-lock
  pnpm deploy:prod -- --recover-stale-lock

Required local environment (shared):
  KHARTIS_SFTP_HOST
  KHARTIS_SFTP_HOST_FINGERPRINT_SHA256
  KHARTIS_SFTP_USER

Per-target public URL, remote directory and GTM container (remote dir ends with html/<leaf>):
  pprd: KHARTIS_PUBLIC_URL_PPRD, KHARTIS_SFTP_REMOTE_DIR_PPRD (html/pprd), KHARTIS_GTM_CONTAINER_ID_PPRD
  prod: KHARTIS_PUBLIC_URL_PROD, KHARTIS_SFTP_REMOTE_DIR_PROD (html/prod), KHARTIS_GTM_CONTAINER_ID_PROD
  BASE_PATH is derived from each public URL so the build and deployed route cannot diverge.
  Leave the GTM container id empty to ship a target without analytics (e.g. pprd).

Public backend routing validation:
  KHARTIS_HTTP_ROUTING_COOKIE_NAME
  KHARTIS_HTTP_BACKEND_HEADER_NAME
  KHARTIS_HTTP_ROUTING_BACKENDS_PPRD
  KHARTIS_HTTP_ROUTING_BACKENDS_PROD
  List every expected routing-cookie value, separated by commas. The public
  contract is checked independently on each configured backend, whose response
  must confirm the same value in the configured backend identity header.

Authentication, choose one:
  KHARTIS_SFTP_PASSWORD
  KHARTIS_SFTP_PRIVATE_KEY_PATH

Optional:
  KHARTIS_SFTP_PORT
  KHARTIS_SFTP_PASSPHRASE

Local env files:
  ${LOCAL_ENV_FILES.join(', ')} are supported.
  pprd deploys the latest v*-pprd.* prerelease (legacy v*-staging.* accepted); prod deploys the latest stable v*.*.* tag.
  The build is uploaded to a temporary remote directory, then swapped into
  place with two quick renames. Missing immutable assets from the immediately
  previous release are retained, then the previous directory is removed.
  Use --migrate-legacy-assets only for the first deployment from a release
  without a valid .khartis-release-assets.json manifest.
  Use --recover-stale-lock only after confirming no other deployment is active.
  Use --tag to deploy a specific release. prod asks you to type the tag to confirm.
  Do not commit real SFTP values. Keep secrets in ignored local env files or your shell.`;

async function main() {
  await loadLocalEnvFiles();

  const options = parseArgs(process.argv.slice(2));
  const targetName = TARGET_ALIASES[options.target];
  const target = TARGETS[targetName];
  if (!targetName || !target) {
    throw new Error(`Unknown target "${options.target ?? ''}".\n\n${usage}`);
  }

  await ensureCommand('git', ['--version']);
  await ensureCommand('gh', ['--version']);
  await ensurePnpm();

  await run('git', ['fetch', 'origin', '--tags'], { cwd: process.cwd() });

  const tag = options.tag ?? (await findLatestRemoteTag(target.tagPattern));
  assertTagMatchesTarget(tag, target.tagPattern, targetName);
  const remoteTagSha = await resolveRemoteTagCommit(tag);
  const localTagSha = await output('git', ['rev-list', '-n', '1', tag], {
    cwd: process.cwd()
  });
  assertTagCommitMatchesRemote(tag, localTagSha, remoteTagSha);
  const tagSha = remoteTagSha;
  const shortSha = tagSha.slice(0, 12);

  log(`Target: ${targetName}`);
  log(`Tag: ${tag}`);
  log(`Commit: ${shortSha}`);

  await assertReleaseRunIsGreen(tagSha, target.releaseBranch);

  const remoteDir = options.dryRun
    ? process.env[target.remoteDirEnv]?.trim() || '<not required for dry run>'
    : readRequiredEnv(target.remoteDirEnv);
  const deployment = resolveDeploymentPublicUrl(
    readRequiredEnv(target.publicUrlEnv),
    target.publicUrlEnv
  );
  log(`Public URL: ${deployment.publicUrl}`);
  log(`Base path: ${deployment.basePath || '/'}`);
  const buildEnv = {
    BASE_PATH: deployment.basePath,
    VITE_APP_VERSION: tag,
    VITE_KHARTIS_ENV: target.khartisEnv,
    VITE_DEBUG: 'false',
    VITE_DEBUG_AUTH: 'false',
    VITE_LOG_LEVEL: 'ERROR',
    VITE_LOG_STACK: 'false',
    PUBLIC_GTM_CONTAINER_ID: process.env[target.gtmContainerEnv]?.trim() ?? ''
  };

  if (!options.dryRun) {
    assertSafeRemoteDir(remoteDir, target.remoteDirLeaf);
    readSftpHost();
    readSftpUsername();
    readSftpHostFingerprints();
  }
  const backendRouting = options.dryRun
    ? null
    : readBackendRouting(target.backendRoutingValuesEnv);

  const requiresProductionConfirmation =
    target.productionConfirmation === true && !options.dryRun;
  if (!options.yes || requiresProductionConfirmation) {
    if (options.yes && requiresProductionConfirmation) {
      warn('--yes never skips the production tag confirmation.');
    }
    await confirmDeployment(
      targetName,
      tag,
      target.remoteDirLeaf,
      options.dryRun,
      requiresProductionConfirmation
    );
  }

  const worktree = await mkdtemp(path.join(tmpdir(), 'khartis-deploy-'));
  const uploadSnapshotRoot = await mkdtemp(
    path.join(tmpdir(), 'khartis-upload-')
  );
  try {
    await run('git', ['worktree', 'add', '--detach', worktree, tagSha], {
      cwd: process.cwd()
    });
    await run('pnpm', ['install', '--frozen-lockfile'], {
      cwd: worktree,
      env: sanitizedChildEnv()
    });
    await run('pnpm', ['build'], {
      cwd: worktree,
      env: sanitizedChildEnv(buildEnv)
    });

    const buildDir = path.join(worktree, 'build');
    if (!existsSync(buildDir)) {
      throw new Error(`Build directory was not created: ${buildDir}`);
    }
    await assertBuildMatchesDeployment(buildDir, deployment);

    const uploadBuildDir = path.join(uploadSnapshotRoot, 'build');
    const snapshotSpinner = startSpinner('Preparing upload snapshot');
    await cp(buildDir, uploadBuildDir, { recursive: true });
    const releaseAssetPaths = await writeReleaseAssetManifest(uploadBuildDir);
    const wasmAssetPath = findCompressedWasmAssetPath(releaseAssetPaths);
    snapshotSpinner.done(
      `Upload snapshot ready (${releaseAssetPaths.length} immutable assets tracked)`
    );

    if (options.dryRun) {
      log('Dry run: build succeeded, SFTP upload skipped.');
      return;
    }

    await reportPublicInfrastructurePreflight(deployment, { backendRouting });

    const config = await readSftpConfig();
    await uploadBuild(
      config,
      uploadBuildDir,
      remoteDir,
      target.remoteDirLeaf,
      deployment,
      releaseAssetPaths,
      {
        allowLegacyAssetScan: options.migrateLegacyAssets,
        backendRouting,
        expectedVersion: tag,
        recoverStaleLock: options.recoverStaleLock,
        validateReleaseProvenance: () =>
          assertRemoteReleaseStillValid(tag, tagSha, target.releaseBranch),
        wasmAssetPath
      }
    );
    log('Deployment complete.');
  } finally {
    await run('git', ['worktree', 'remove', '--force', worktree], {
      cwd: process.cwd(),
      allowFailure: true,
      quiet: true
    });
    await rm(worktree, { recursive: true, force: true });
    await rm(uploadSnapshotRoot, { recursive: true, force: true });
  }
}

function assertTagMatchesTarget(tag, tagPattern, target) {
  if (!tagPattern.test(tag)) {
    throw new Error(`Tag "${tag}" does not match the ${target} tag pattern.`);
  }
}

function parseArgs(args) {
  const options = {
    target: undefined,
    tag: undefined,
    yes: false,
    dryRun: false,
    migrateLegacyAssets: false,
    recoverStaleLock: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage);
      process.exit(0);
    }
    if (arg === '--yes' || arg === '-y') {
      options.yes = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--migrate-legacy-assets') {
      options.migrateLegacyAssets = true;
      continue;
    }
    if (arg === '--recover-stale-lock') {
      options.recoverStaleLock = true;
      continue;
    }
    if (arg === '--tag') {
      const tag = args[index + 1];
      if (!tag) throw new Error('--tag requires a value.');
      options.tag = tag;
      index += 1;
      continue;
    }
    if (!options.target) {
      options.target = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}\n\n${usage}`);
  }

  return options;
}

async function loadLocalEnvFiles() {
  const values = {};

  for (const file of LOCAL_ENV_FILES) {
    const envPath = path.join(process.cwd(), file);
    if (!existsSync(envPath)) continue;

    Object.assign(values, parseEnvContent(await readFile(envPath, 'utf8')));
  }

  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseEnvContent(content) {
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const quoted = /^(["']).*\1$/.test(rawValue);
    const value = quoted
      ? rawValue.slice(1, -1)
      : rawValue.replace(/\s+#.*$/, '').trim();
    if (key) {
      values[key] = value;
    }
  }

  return values;
}

async function ensureCommand(command, args) {
  await run(command, args, { allowFailure: false, quiet: true });
}

async function ensurePnpm() {
  await ensureCommand('pnpm', ['--version']);
}

async function findLatestRemoteTag(tagPattern) {
  const remoteTags = await output(
    'git',
    ['ls-remote', '--tags', '--refs', 'origin'],
    { cwd: process.cwd() }
  );
  const tags = parseRemoteTagNames(remoteTags)
    .filter((tag) => tagPattern.test(tag))
    .map((tag) => parseVersionedTag(tag, tagPattern))
    .sort(compareVersionedTagsDesc);

  const [tag] = tags;
  if (!tag) {
    throw new Error('No matching release tag exists on origin.');
  }
  return tag.name;
}

function parseRemoteTagNames(rawTags) {
  return rawTags
    .split('\n')
    .map((line) => line.trim().split(/\s+/, 2))
    .filter(
      ([sha, ref]) =>
        /^[0-9a-f]{40,64}$/i.test(sha ?? '') &&
        ref?.startsWith('refs/tags/') &&
        !ref.endsWith('^{}')
    )
    .map(([, ref]) => ref.slice('refs/tags/'.length));
}

async function resolveRemoteTagCommit(tag) {
  const rawRefs = await output(
    'git',
    [
      'ls-remote',
      '--tags',
      'origin',
      `refs/tags/${tag}`,
      `refs/tags/${tag}^{}`
    ],
    { cwd: process.cwd() }
  );
  const remoteTagSha = parseRemoteTagCommit(rawRefs, tag);
  await output('git', ['cat-file', '-e', `${remoteTagSha}^{commit}`], {
    cwd: process.cwd()
  });
  return remoteTagSha;
}

async function resolveRemoteBranchHead(branch) {
  const rawRef = await output(
    'git',
    ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`],
    { cwd: process.cwd() }
  );
  return parseRemoteBranchHead(rawRef, branch);
}

function parseRemoteBranchHead(rawRef, branch) {
  const branchRef = `refs/heads/${branch}`;
  for (const line of rawRef.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/, 2);
    if (/^[0-9a-f]{40,64}$/i.test(sha ?? '') && ref === branchRef) {
      return sha;
    }
  }
  throw new Error(`Release branch "${branch}" does not exist on origin.`);
}

function parseRemoteTagCommit(rawRefs, tag) {
  const tagRef = `refs/tags/${tag}`;
  const peeledTagRef = `${tagRef}^{}`;
  let directSha;
  let peeledSha;

  for (const line of rawRefs.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/, 2);
    if (!/^[0-9a-f]{40,64}$/i.test(sha ?? '')) continue;
    if (ref === tagRef) directSha = sha;
    if (ref === peeledTagRef) peeledSha = sha;
  }

  const commitSha = peeledSha ?? directSha;
  if (!commitSha) {
    throw new Error(`Release tag "${tag}" does not exist on origin.`);
  }
  return commitSha;
}

function assertTagCommitMatchesRemote(tag, localTagSha, remoteTagSha) {
  if (localTagSha !== remoteTagSha) {
    throw new Error(
      `Local tag "${tag}" resolves to a different commit than origin. Refusing to deploy.`
    );
  }
}

function assertReleaseCommitBelongsToBranch(
  tag,
  releaseBranch,
  ancestryExitCode
) {
  if (ancestryExitCode !== 0) {
    throw new Error(
      `Release tag "${tag}" no longer belongs to origin/${releaseBranch}. Refusing to deploy.`
    );
  }
}

async function assertRemoteReleaseStillValid(tag, tagSha, releaseBranch) {
  await run('git', ['fetch', 'origin', `refs/heads/${releaseBranch}`], {
    cwd: process.cwd(),
    quiet: true
  });
  const [currentTagSha, currentBranchSha] = await Promise.all([
    resolveRemoteTagCommit(tag),
    resolveRemoteBranchHead(releaseBranch)
  ]);
  assertTagCommitMatchesRemote(tag, tagSha, currentTagSha);
  await output('git', ['cat-file', '-e', `${currentBranchSha}^{commit}`], {
    cwd: process.cwd()
  });
  const ancestryExitCode = await run(
    'git',
    ['merge-base', '--is-ancestor', tagSha, currentBranchSha],
    {
      allowFailure: true,
      cwd: process.cwd(),
      quiet: true
    }
  );
  assertReleaseCommitBelongsToBranch(tag, releaseBranch, ancestryExitCode);
  log('Release provenance revalidated after acquiring the deployment lock.');
}

function parseVersionedTag(tag, tagPattern) {
  const match = tagPattern.exec(tag);
  if (!match?.groups) {
    throw new Error(`Tag "${tag}" does not match the expected tag pattern.`);
  }

  return {
    name: tag,
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    channelRank: match.groups.channel === 'pprd' ? 1 : 0,
    prerelease:
      match.groups.prerelease !== undefined
        ? Number(match.groups.prerelease)
        : 0
  };
}

function compareVersionedTagsDesc(left, right) {
  return (
    right.major - left.major ||
    right.minor - left.minor ||
    right.patch - left.patch ||
    right.channelRank - left.channelRank ||
    right.prerelease - left.prerelease
  );
}

async function assertReleaseRunIsGreen(tagSha, releaseBranch) {
  const json = await output(
    'gh',
    [
      'run',
      'list',
      '--repo',
      REPO,
      '--workflow',
      RELEASE_WORKFLOW,
      '--commit',
      tagSha,
      '--branch',
      releaseBranch,
      '--json',
      'conclusion,status,url,displayTitle,updatedAt,headBranch,headSha,event',
      '--limit',
      '5'
    ],
    { cwd: process.cwd() }
  );

  const runs = JSON.parse(json);
  const successfulRun = findSuccessfulReleaseRun(runs, tagSha, releaseBranch);

  if (!successfulRun) {
    const inspected = runs
      .map(
        (run) =>
          `- ${run.status}/${run.conclusion ?? 'none'} ${run.displayTitle} ${run.url}`
      )
      .join('\n');
    throw new Error(
      `No successful ${RELEASE_WORKFLOW} push run found for this tag commit on ${releaseBranch}.\n${inspected}`
    );
  }

  log(`GitHub Actions gate: success (${successfulRun.url})`);
}

function findSuccessfulReleaseRun(runs, tagSha, releaseBranch) {
  return runs.find(
    (run) =>
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      run.event === 'push' &&
      run.headBranch === releaseBranch &&
      run.headSha === tagSha
  );
}

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readBackendRouting(valuesEnvName) {
  const cookieName = readRequiredEnv(HTTP_ROUTING_COOKIE_NAME_ENV);
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(cookieName)) {
    throw new Error(
      `${HTTP_ROUTING_COOKIE_NAME_ENV} must be a valid HTTP cookie name.`
    );
  }
  const backendHeaderName = readRequiredEnv(HTTP_BACKEND_HEADER_NAME_ENV);
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(backendHeaderName)) {
    throw new Error(
      `${HTTP_BACKEND_HEADER_NAME_ENV} must be a valid HTTP header name.`
    );
  }

  const backendValues = readRequiredEnv(valuesEnvName)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (backendValues.length === 0) {
    throw new Error(`${valuesEnvName} must list at least one backend.`);
  }
  if (
    backendValues.some(
      (value) => /[;,\r\n\0]/.test(value) || value.length > 256
    )
  ) {
    throw new Error(
      `${valuesEnvName} contains an invalid HTTP routing cookie value.`
    );
  }
  if (new Set(backendValues).size !== backendValues.length) {
    throw new Error(`${valuesEnvName} must not contain duplicate backends.`);
  }

  return {
    backendHeaderName,
    cookieName,
    backendValues
  };
}

function resolveDeploymentPublicUrl(value, envName = 'public URL') {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${envName} must be a non-empty absolute HTTPS URL.`);
  }

  let publicUrl;
  try {
    publicUrl = new URL(value.trim());
  } catch {
    throw new Error(`${envName} must be a valid absolute HTTPS URL.`);
  }

  if (publicUrl.protocol !== 'https:') {
    throw new Error(`${envName} must use HTTPS.`);
  }
  if (publicUrl.username || publicUrl.password) {
    throw new Error(`${envName} must not contain credentials.`);
  }
  if (publicUrl.search || publicUrl.hash) {
    throw new Error(`${envName} must not contain a query string or fragment.`);
  }
  if (/\/{2,}/.test(publicUrl.pathname)) {
    throw new Error(`${envName} must not contain repeated path separators.`);
  }

  const basePath = publicUrl.pathname.replace(/\/+$/, '');
  publicUrl.pathname = basePath ? `${basePath}/` : '/';

  return {
    basePath,
    publicUrl: publicUrl.href
  };
}

function expectedBaseHref(basePath) {
  return basePath ? `${basePath}/` : '/';
}

function readSingleBaseHref(html, source) {
  const matches = [
    ...html.matchAll(/<base\b[^>]*\bhref=(["'])(.*?)\1[^>]*>/gi)
  ];
  if (matches.length !== 1) {
    throw new Error(
      `${source} must contain exactly one <base href>; found ${matches.length}.`
    );
  }
  return matches[0][2];
}

function assertHtmlBaseHref(html, basePath, source) {
  const expected = expectedBaseHref(basePath);
  const actual = readSingleBaseHref(html, source);
  if (actual !== expected) {
    throw new Error(
      `${source} has <base href="${actual}">; expected "${expected}".`
    );
  }
}

async function assertBuildMatchesDeployment(buildDir, deployment) {
  const indexPath = path.join(buildDir, 'index.html');
  const manifestPath = path.join(buildDir, 'manifest.webmanifest');
  const indexHtml = await readFile(indexPath, 'utf8');
  assertHtmlBaseHref(indexHtml, deployment.basePath, indexPath);

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read a valid PWA manifest: ${manifestPath}`, {
      cause: error
    });
  }

  const scope = expectedBaseHref(deployment.basePath);
  const expectedManifestValues = {
    id: scope,
    scope,
    start_url: `${scope}?standalone=true`
  };
  for (const [key, expected] of Object.entries(expectedManifestValues)) {
    if (manifest[key] !== expected) {
      throw new Error(
        `${manifestPath} has ${key}="${manifest[key] ?? ''}"; expected "${expected}".`
      );
    }
  }

  log(`Build route contract verified for ${deployment.publicUrl}`);
}

async function readSftpConfig() {
  const host = readSftpHost();
  const username = readSftpUsername();
  const hostFingerprints = readSftpHostFingerprints();
  const port = Number(process.env.KHARTIS_SFTP_PORT ?? DEFAULT_PORT);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(
      'KHARTIS_SFTP_PORT must be an integer between 1 and 65535.'
    );
  }

  const baseConnection = {
    host,
    username,
    port,
    readyTimeout: SFTP_READY_TIMEOUT_MS,
    keepaliveInterval: SFTP_KEEPALIVE_INTERVAL_MS,
    keepaliveCountMax: SFTP_KEEPALIVE_COUNT_MAX,
    hostVerifier: createSftpHostVerifier(hostFingerprints)
  };

  const privateKeyPath = process.env.KHARTIS_SFTP_PRIVATE_KEY_PATH?.trim();
  if (privateKeyPath) {
    return {
      ...baseConnection,
      privateKey: await readFile(privateKeyPath, 'utf8'),
      passphrase: process.env.KHARTIS_SFTP_PASSPHRASE || undefined
    };
  }

  const password =
    process.env.KHARTIS_SFTP_PASSWORD ||
    (await promptHidden('SFTP password: '));
  if (!password) {
    throw new Error(
      'Set KHARTIS_SFTP_PASSWORD or KHARTIS_SFTP_PRIVATE_KEY_PATH.'
    );
  }

  return { ...baseConnection, password };
}

function sanitizedChildEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    if (key.startsWith('KHARTIS_SFTP_') || key.startsWith('KHARTIS_HTTP_')) {
      delete env[key];
    }
  }
  return env;
}

function readSftpHost() {
  const host = readRequiredEnv('KHARTIS_SFTP_HOST');

  if (
    host.includes('://') ||
    host.includes('/') ||
    host.includes('\\') ||
    /\s/.test(host)
  ) {
    throw new Error(
      'KHARTIS_SFTP_HOST must be a hostname only, without protocol, path, or whitespace.'
    );
  }

  return host;
}

function readSftpUsername() {
  const username = readRequiredEnv('KHARTIS_SFTP_USER');

  if (/[\s/:\\\0]/.test(username)) {
    throw new Error(
      'KHARTIS_SFTP_USER must not contain whitespace, separators, or control characters.'
    );
  }

  return username;
}

function readSftpHostFingerprints() {
  const fingerprint = readRequiredEnv('KHARTIS_SFTP_HOST_FINGERPRINT_SHA256');
  const normalized = fingerprint
    .split(',')
    .map((value) => normalizeSftpHostFingerprint(value))
    .filter(Boolean);

  if (normalized.length === 0) {
    throw new Error('KHARTIS_SFTP_HOST_FINGERPRINT_SHA256 cannot be empty.');
  }

  const invalid = normalized.find(
    (value) =>
      !/^[A-Za-z0-9+/]{43}$/.test(value) && !/^[a-f0-9]{64}$/.test(value)
  );
  if (invalid) {
    throw new Error(
      'KHARTIS_SFTP_HOST_FINGERPRINT_SHA256 must contain OpenSSH SHA256 fingerprints or SHA256 hex digests.'
    );
  }

  return normalized;
}

function normalizeSftpHostFingerprint(fingerprint) {
  const normalized = fingerprint
    .trim()
    .replace(/^SHA256:/, '')
    .replace(/=+$/, '');

  if (/^[A-Fa-f0-9]{64}$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  return normalized;
}

function createSftpHostVerifier(expectedFingerprints) {
  const allowedFingerprints = new Set(expectedFingerprints);

  return (hostKey) => {
    const base64Fingerprint = createHash('sha256')
      .update(hostKey)
      .digest('base64')
      .replace(/=+$/, '');
    const hexFingerprint = createHash('sha256')
      .update(hostKey)
      .digest('hex')
      .toLowerCase();

    return (
      allowedFingerprints.has(base64Fingerprint) ||
      allowedFingerprints.has(hexFingerprint)
    );
  };
}

async function promptHidden(question) {
  if (!process.stdin.isTTY) return '';

  return new Promise((resolve) => {
    const input = process.stdin;
    const output = process.stdout;
    let value = '';

    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    const onData = (char) => {
      if (char === '\r' || char === '\n' || char === '\u0004') {
        input.setRawMode(false);
        input.pause();
        input.off('data', onData);
        output.write('\n');
        resolve(value);
        return;
      }

      if (char === '\u0003') {
        input.setRawMode(false);
        output.write('\n');
        process.exit(130);
      }

      if (char === '\b' || char === '\u007f') {
        value = value.slice(0, -1);
        return;
      }

      value += char;
    };

    input.on('data', onData);
  });
}

async function confirmDeployment(
  target,
  tag,
  remoteDir,
  dryRun,
  requireTagEcho
) {
  const action = dryRun ? 'dry run' : 'deployment';

  if (!dryRun && requireTagEcho) {
    const answer = await promptVisible(
      `PRODUCTION ${action} of ${tag} to ${target} (remote target: ${remoteDir}).\n` +
        `Type the tag "${tag}" exactly to confirm: `
    );
    if (answer !== tag) {
      throw new Error(
        'Deployment cancelled: tag confirmation did not match. Use --tag <tag> to pick another release.'
      );
    }
    return;
  }

  const answer = await promptVisible(
    `Confirm ${action} of ${tag} to ${target} (remote target: ${remoteDir})? [y/N] `
  );
  if (!/^y(es)?$/i.test(answer)) {
    throw new Error(
      'Deployment cancelled. Use --tag <tag> to pick another release.'
    );
  }
}

function promptVisible(question) {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Confirmation requires a TTY. Re-run with --yes if needed.'
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function uploadBuild(
  config,
  buildDir,
  remoteDir,
  expectedRemoteDirLeaf,
  deployment,
  releaseAssetPaths,
  {
    allowLegacyAssetScan,
    backendRouting,
    expectedVersion,
    recoverStaleLock,
    validateReleaseProvenance,
    wasmAssetPath
  }
) {
  const safeRemoteDir = assertSafeRemoteDir(remoteDir, expectedRemoteDirLeaf);
  const deploymentLockDir = createRemoteDeploymentLockDir(
    safeRemoteDir,
    expectedRemoteDirLeaf
  );
  const tempRemoteDir = createRemoteSiblingDir(
    safeRemoteDir,
    expectedRemoteDirLeaf,
    REMOTE_SIBLING_KIND_UPLOAD
  );
  const scanSpinner = startSpinner('Scanning build output');
  const manifest = await collectUploadManifest(buildDir);
  scanSpinner.done(
    `Scanned ${manifest.totalFiles} files (${formatBytes(manifest.totalBytes)})`
  );

  const client = new SftpClient('khartis-local-deploy');
  let swapped = false;
  let preserveTempDir = false;
  let tempRemoteDirCreated = false;
  let deploymentLockAcquired = false;
  let uploadProgress = null;

  try {
    const connectSpinner = startSpinner('Connecting to SFTP');
    await client.connect(config);
    connectSpinner.done('Connected to SFTP');
    terminationCoordinator.beginRemoteDeployment();
    await acquireRemoteDeploymentLock(client, deploymentLockDir, {
      recoverStaleLock
    });
    deploymentLockAcquired = true;
    await validateReleaseProvenance();
    throwIfTerminationRequested('before remote deployment preparation');

    let remoteType = await client.exists(safeRemoteDir);
    if (remoteType && remoteType !== 'd') {
      throw new Error('Remote target exists but is not a directory.');
    }
    remoteType = await prepareStaleRemoteState(
      client,
      safeRemoteDir,
      expectedRemoteDirLeaf,
      remoteType
    );
    throwIfTerminationRequested('before the remote upload');

    await client.mkdir(tempRemoteDir, true);
    tempRemoteDirCreated = true;

    log(
      `Uploading ${manifest.totalFiles} files (${formatBytes(manifest.totalBytes)}) to a temporary remote ${expectedRemoteDirLeaf} directory…`
    );
    uploadProgress = createUploadProgress(manifest);
    client.on('upload', (info) => uploadProgress.onFileUploaded(info.source));
    await client.uploadDir(buildDir, tempRemoteDir, { useFastput: false });
    uploadProgress.finish();
    throwIfTerminationRequested('after the remote upload');

    if (remoteType) {
      const retentionSpinner = startSpinner(
        'Retaining previous immutable assets'
      );
      try {
        const retention = await retainPreviousReleaseAssets(client, {
          currentAssetPaths: releaseAssetPaths,
          previousRemoteDir: safeRemoteDir,
          uploadRemoteDir: tempRemoteDir,
          allowLegacyAssetScan
        });
        retentionSpinner.done(
          retention.copiedFiles === 0
            ? 'Previous immutable assets already present'
            : `Retained ${retention.copiedFiles} previous immutable assets`
        );
      } catch (error) {
        retentionSpinner.fail('Could not retain previous immutable assets');
        throw error;
      }
    }
    throwIfTerminationRequested('before the public swap');

    const previousRemoteDir = remoteType
      ? createRemoteSiblingDir(
          safeRemoteDir,
          expectedRemoteDirLeaf,
          REMOTE_SIBLING_KIND_OLD
        )
      : null;

    await withCriticalRemoteSection(
      'remote publication and validation',
      async () => {
        const swapSpinner = startSpinner(
          `Swapping remote ${expectedRemoteDirLeaf} directory`
        );
        if (previousRemoteDir) {
          await client.rename(safeRemoteDir, previousRemoteDir);
        }
        try {
          await client.rename(tempRemoteDir, safeRemoteDir);
        } catch (error) {
          swapSpinner.fail(`Remote ${expectedRemoteDirLeaf} swap failed`);
          if (previousRemoteDir) {
            try {
              await client.rename(previousRemoteDir, safeRemoteDir);
              warn('Swap failed; the previous remote version was restored.');
            } catch {
              preserveTempDir = true;
              warn(
                `Swap failed and the previous version could not be restored. Previous version: ${previousRemoteDir}, new upload: ${tempRemoteDir}. Restore one of them manually.`
              );
            }
          }
          throw error;
        }
        swapped = true;
        swapSpinner.done(`Remote ${expectedRemoteDirLeaf} directory swapped`);

        await reportPublicRouteValidation(deployment, {
          backendRouting,
          expectedVersion,
          wasmAssetPath
        });

        if (previousRemoteDir) {
          await removeRemoteDirRecursive(
            client,
            previousRemoteDir,
            'Removing the previous remote version'
          ).catch(() =>
            warn(
              `Could not remove the previous remote version: ${previousRemoteDir}. Remove it manually.`
            )
          );
        }
      }
    );
  } finally {
    uploadProgress?.finish();
    if (tempRemoteDirCreated && !swapped && !preserveTempDir) {
      await removeRemoteDirRecursive(
        client,
        tempRemoteDir,
        'Removing incomplete temporary remote upload'
      ).catch(() => undefined);
    }
    if (deploymentLockAcquired) {
      await releaseRemoteDeploymentLock(client, deploymentLockDir).catch(
        (error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          warn(
            `Could not release deployment lock ${deploymentLockDir}: ${message}. Remove it manually after confirming no deployment is active.`
          );
        }
      );
    }
    await closeSftpClient(client, 'deployment').catch(() => undefined);
    terminationCoordinator.endRemoteDeployment();
  }

  throwIfTerminationRequested('after public validation and remote cleanup');
}

class DeploymentInterruptedError extends Error {
  constructor(signal, checkpoint) {
    super(`Interrupted by ${signal} ${checkpoint}.`);
    this.name = 'DeploymentInterruptedError';
    this.exitCode = 130;
  }
}

function createTerminationCoordinator({
  exitProcess = (code) => process.exit(code),
  warnMessage = warn
} = {}) {
  const criticalSections = [];
  let deferredSignal = null;
  let remoteDeploymentActive = false;

  function beginRemoteDeployment() {
    remoteDeploymentActive = true;
  }

  function endRemoteDeployment() {
    remoteDeploymentActive = false;
  }

  function handleSignal(signal) {
    const criticalRemoteSection = criticalSections.at(-1);
    if (criticalRemoteSection || remoteDeploymentActive) {
      deferredSignal ??= signal;
      const activeStep = criticalRemoteSection ?? 'remote deployment';
      warnMessage(
        `${signal} received during ${activeStep}; stopping only after the public version is validated or safely restored.`
      );
      return;
    }
    warnMessage(`${signal} received; aborting.`);
    exitProcess(130);
  }

  function checkpoint(checkpointLabel) {
    if (!deferredSignal) return;

    const signal = deferredSignal;
    deferredSignal = null;
    throw new DeploymentInterruptedError(signal, checkpointLabel);
  }

  async function runCritical(label, action) {
    criticalSections.push(label);
    try {
      return await action();
    } finally {
      criticalSections.pop();
    }
  }

  return {
    beginRemoteDeployment,
    checkpoint,
    endRemoteDeployment,
    handleSignal,
    runCritical
  };
}

const terminationCoordinator = createTerminationCoordinator();

function handleTerminationSignal(signal) {
  terminationCoordinator.handleSignal(signal);
}

process.on('SIGINT', () => handleTerminationSignal('SIGINT'));
process.on('SIGTERM', () => handleTerminationSignal('SIGTERM'));

function throwIfTerminationRequested(checkpoint) {
  terminationCoordinator.checkpoint(checkpoint);
}

async function withCriticalRemoteSection(label, action) {
  return terminationCoordinator.runCritical(label, action);
}

async function collectUploadManifest(buildDir) {
  const entries = await readdir(buildDir, {
    recursive: true,
    withFileTypes: true
  });
  const filePaths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));

  const fileSizes = new Map();
  let totalBytes = 0;
  const STAT_CONCURRENCY = 48;

  for (let index = 0; index < filePaths.length; index += STAT_CONCURRENCY) {
    const batch = filePaths.slice(index, index + STAT_CONCURRENCY);
    const sizes = await Promise.all(
      batch.map((filePath) => stat(filePath).then((info) => info.size))
    );
    batch.forEach((filePath, offset) => {
      fileSizes.set(filePath, sizes[offset]);
      totalBytes += sizes[offset];
    });
  }

  return { fileSizes, totalFiles: fileSizes.size, totalBytes };
}

async function writeReleaseAssetManifest(buildDir) {
  const assetRoot = path.join(
    buildDir,
    ...RELEASE_ASSET_ROOT.split(path.posix.sep)
  );
  const entries = await readdir(assetRoot, {
    recursive: true,
    withFileTypes: true
  });
  const assetPaths = entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(buildDir, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join(path.posix.sep)
    )
    .map((assetPath) => assertReleaseAssetPath(assetPath))
    .sort();

  if (assetPaths.length === 0) {
    throw new Error(
      `Build does not contain any immutable release assets under ${RELEASE_ASSET_ROOT}.`
    );
  }

  // Track only this build so retained assets stay bounded to one previous release.
  await writeFile(
    path.join(buildDir, RELEASE_ASSET_MANIFEST_FILENAME),
    `${JSON.stringify(
      {
        formatVersion: RELEASE_ASSET_MANIFEST_VERSION,
        assets: assetPaths
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  return assetPaths;
}

function findCompressedWasmAssetPath(assetPaths) {
  const releaseAssets = new Set(
    assetPaths.map((assetPath) => assertReleaseAssetPath(assetPath))
  );
  const wasmAssetPath = [...releaseAssets]
    .filter(
      (assetPath) =>
        assetPath.endsWith('.wasm') &&
        (releaseAssets.has(`${assetPath}.br`) ||
          releaseAssets.has(`${assetPath}.gz`))
    )
    .sort()[0];

  if (!wasmAssetPath) {
    throw new Error(
      'Build does not contain a WASM asset with a Brotli or gzip sidecar.'
    );
  }

  return wasmAssetPath;
}

function assertReleaseAssetPath(assetPath) {
  if (
    typeof assetPath !== 'string' ||
    !assetPath.startsWith(`${RELEASE_ASSET_ROOT}/`) ||
    assetPath !== path.posix.normalize(assetPath) ||
    assetPath.includes('\\') ||
    assetPath.includes('\0') ||
    assetPath.endsWith('/')
  ) {
    throw new Error(`Unsafe immutable release asset path: ${assetPath}`);
  }

  return assetPath;
}

function parseReleaseAssetManifest(rawManifest, source) {
  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch (error) {
    throw new Error(`Could not parse release asset manifest: ${source}`, {
      cause: error
    });
  }

  if (
    manifest?.formatVersion !== RELEASE_ASSET_MANIFEST_VERSION ||
    !Array.isArray(manifest.assets)
  ) {
    throw new Error(`Unsupported release asset manifest: ${source}`);
  }

  return [
    ...new Set(
      manifest.assets.map((assetPath) => assertReleaseAssetPath(assetPath))
    )
  ].sort();
}

async function collectRemoteReleaseAssetPaths(client, remoteDir) {
  const remoteAssetRoot = path.posix.join(remoteDir, RELEASE_ASSET_ROOT);
  if ((await client.exists(remoteAssetRoot)) !== 'd') {
    return [];
  }

  const assetPaths = [];
  let totalBytes = 0;

  async function visit(currentDir) {
    const entries = await client.list(currentDir);
    for (const entry of entries) {
      if (
        typeof entry.name !== 'string' ||
        entry.name === '.' ||
        entry.name === '..' ||
        /[/\\\0]/.test(entry.name)
      ) {
        throw new Error(
          `Unsafe remote immutable asset entry under ${currentDir}.`
        );
      }

      const entryPath = path.posix.join(currentDir, entry.name);
      if (entry.type === 'd') {
        await visit(entryPath);
        continue;
      }
      if (entry.type !== '-') {
        continue;
      }

      const size = Number(entry.size);
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(
          `Could not determine the size of legacy immutable asset: ${entryPath}`
        );
      }
      if (assetPaths.length + 1 > LEGACY_ASSET_SCAN_MAX_FILES) {
        throw new Error(
          `Legacy immutable asset scan exceeds ${LEGACY_ASSET_SCAN_MAX_FILES} files.`
        );
      }
      totalBytes += size;
      if (totalBytes > LEGACY_ASSET_SCAN_MAX_BYTES) {
        throw new Error(
          `Legacy immutable asset scan exceeds ${formatBytes(LEGACY_ASSET_SCAN_MAX_BYTES)}.`
        );
      }

      assetPaths.push(
        assertReleaseAssetPath(path.posix.relative(remoteDir, entryPath))
      );
    }
  }

  await visit(remoteAssetRoot);
  return [...new Set(assetPaths)].sort();
}

async function readPreviousReleaseAssetPaths(
  client,
  previousRemoteDir,
  { allowLegacyAssetScan = false } = {}
) {
  const manifestPath = path.posix.join(
    previousRemoteDir,
    RELEASE_ASSET_MANIFEST_FILENAME
  );
  const manifestType = await client.exists(manifestPath);
  let manifestError;

  if (manifestType === '-') {
    try {
      const manifest = await client.get(manifestPath);
      return parseReleaseAssetManifest(manifest.toString('utf8'), manifestPath);
    } catch (error) {
      manifestError = error;
    }
  } else {
    manifestError = new Error(
      manifestType
        ? `Previous release asset manifest is not a file: ${manifestPath}`
        : `Previous release asset manifest is missing: ${manifestPath}`
    );
  }

  if (!allowLegacyAssetScan) {
    const message =
      manifestError instanceof Error
        ? manifestError.message
        : String(manifestError);
    throw new Error(
      `${message}. Refusing an automatic legacy scan. Re-run this deployment once with --migrate-legacy-assets after checking the remote release.`,
      { cause: manifestError }
    );
  }

  const message =
    manifestError instanceof Error
      ? manifestError.message
      : String(manifestError);
  warn(
    `Explicit legacy asset migration enabled (${message}). Scanning at most ${LEGACY_ASSET_SCAN_MAX_FILES} files and ${formatBytes(LEGACY_ASSET_SCAN_MAX_BYTES)}.`
  );
  return collectRemoteReleaseAssetPaths(client, previousRemoteDir);
}

async function retainPreviousReleaseAssets(
  client,
  {
    currentAssetPaths,
    previousRemoteDir,
    uploadRemoteDir,
    allowLegacyAssetScan = false
  }
) {
  const currentAssets = new Set(
    currentAssetPaths.map((assetPath) => assertReleaseAssetPath(assetPath))
  );
  const previousAssets = await readPreviousReleaseAssetPaths(
    client,
    previousRemoteDir,
    { allowLegacyAssetScan }
  );
  const missingAssets = previousAssets.filter(
    (assetPath) => !currentAssets.has(assetPath)
  );
  const createdDirectories = new Set();
  let copiedFiles = 0;

  for (const assetPath of missingAssets) {
    const sourcePath = path.posix.join(previousRemoteDir, assetPath);
    const destinationPath = path.posix.join(uploadRemoteDir, assetPath);
    const destinationType = await client.exists(destinationPath);
    if (destinationType === '-') {
      continue;
    }
    if (destinationType) {
      throw new Error(
        `Previous immutable asset destination is not a file: ${destinationPath}`
      );
    }

    const destinationDir = path.posix.dirname(destinationPath);
    if (!createdDirectories.has(destinationDir)) {
      await client.mkdir(destinationDir, true);
      createdDirectories.add(destinationDir);
    }

    await client.rcopy(sourcePath, destinationPath);
    copiedFiles += 1;
  }

  return {
    copiedFiles,
    previousFiles: previousAssets.length
  };
}

function createUploadProgress({ fileSizes, totalFiles, totalBytes }) {
  const progress = startProgress({
    label: 'Uploading files',
    total: totalFiles,
    totalBytes,
    unit: 'files'
  });

  return {
    onFileUploaded(source) {
      progress.increment({ items: 1, bytes: fileSizes.get(source) ?? 0 });
    },
    finish: progress.finish
  };
}

function createRemoteRemovalProgress(label, { totalEntries }) {
  const progress = startProgress({
    label,
    total: totalEntries,
    unit: 'entries'
  });

  return {
    onEntryRemoved() {
      progress.increment();
    },
    finish: progress.finish
  };
}

// Terminal status line: at most one animated line (spinner or progress bar) is
// active at a time. It is redrawn in place, truncated to the terminal width so
// it can never wrap and leave stale fragments, and disabled on non-TTY output.
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 90;
const PROGRESS_BAR_MAX_WIDTH = 20;
const STATUS_PREFIX = '[deploy-local] ';
const ESC = String.fromCharCode(27);
const STATUS_CLEAR = String.fromCharCode(13) + ESC + '[2K';

let activeStatusLine = null;

function statusColumns() {
  const columns = process.stdout.columns;
  return Number.isInteger(columns) && columns > 0 ? columns : 80;
}

function statusIsInteractive() {
  return process.stdout.isTTY === true;
}

function statusColor(code, text) {
  return statusIsInteractive() && !process.env.NO_COLOR
    ? `${ESC}[${code}m${text}${ESC}[0m`
    : text;
}

function truncateToWidth(text) {
  const max = Math.max(0, statusColumns() - 1);
  return text.length > max ? text.slice(0, max) : text;
}

function paintStatusLine() {
  if (!statusIsInteractive() || !activeStatusLine) return;
  const glyph = SPINNER_FRAMES[activeStatusLine.frame % SPINNER_FRAMES.length];
  process.stdout.write(
    STATUS_CLEAR + truncateToWidth(activeStatusLine.render(glyph))
  );
  activeStatusLine.painted = true;
}

function clearStatusLine() {
  if (!statusIsInteractive() || !activeStatusLine?.painted) return;
  process.stdout.write(STATUS_CLEAR);
  activeStatusLine.painted = false;
}

function activateStatusLine(render) {
  stopStatusLine();
  const handle = {
    render,
    frame: 0,
    painted: false,
    stopped: false,
    timer: null
  };
  activeStatusLine = handle;
  if (statusIsInteractive()) {
    paintStatusLine();
    handle.timer = setInterval(() => {
      handle.frame += 1;
      paintStatusLine();
    }, SPINNER_INTERVAL_MS);
    handle.timer.unref?.();
  }
  return handle;
}

function finishStatusLine(handle, permanentMessage) {
  if (activeStatusLine !== handle || handle.stopped) return;
  handle.stopped = true;
  if (handle.timer) clearInterval(handle.timer);
  clearStatusLine();
  activeStatusLine = null;
  if (permanentMessage != null) {
    console.log(STATUS_PREFIX + permanentMessage);
  }
}

function stopStatusLine() {
  if (activeStatusLine) finishStatusLine(activeStatusLine, null);
}

function startSpinner(label) {
  const startedAt = Date.now();
  const handle = activateStatusLine(
    (glyph) => `${glyph} ${label}… ${formatDuration(Date.now() - startedAt)}`
  );
  if (!statusIsInteractive()) console.log(STATUS_PREFIX + `${label}…`);
  return {
    setLabel(next) {
      label = next;
    },
    done(message) {
      const elapsed = formatDuration(Date.now() - startedAt);
      finishStatusLine(
        handle,
        `${statusColor('32', '✓')} ${message ?? label} (${elapsed})`
      );
    },
    fail(message) {
      const elapsed = formatDuration(Date.now() - startedAt);
      finishStatusLine(
        handle,
        `${statusColor('31', '✗')} ${message ?? label} (${elapsed})`
      );
    }
  };
}

function startProgress({ label, total, unit, totalBytes = 0 }) {
  const startedAt = Date.now();
  let handle;
  let completedItems = 0;
  let completedBytes = 0;
  let lastLoggedDecile = 0;

  const ratio = () => {
    if (total > 0 && completedItems >= total) return 1;
    if (totalBytes > 0 && completedBytes > 0) {
      return Math.min(completedBytes / totalBytes, 1);
    }
    return total > 0 ? Math.min(completedItems / total, 1) : 0;
  };

  const render = (glyph) => {
    const value = ratio();
    const width = Math.max(
      6,
      Math.min(PROGRESS_BAR_MAX_WIDTH, statusColumns() - 52)
    );
    const filled = Math.round(value * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    const percent = String(Math.floor(value * 100)).padStart(3, ' ');
    const remaining = Math.max(total - completedItems, 0);
    const elapsedMs = Date.now() - startedAt;
    const useBytes = totalBytes > 0 && completedBytes > 0;
    const doneUnits =
      value >= 1 ? 1 : useBytes ? completedBytes : completedItems;
    const totalUnits = value >= 1 ? 1 : useBytes ? totalBytes : total;
    const eta =
      doneUnits > 0 && elapsedMs > 0
        ? formatDuration(((totalUnits - doneUnits) / doneUnits) * elapsedMs)
        : '--';
    return `${glyph} ${label} ${bar} ${percent}% · ${remaining}/${total} ${unit} left · ETA ${eta}`;
  };

  handle = activateStatusLine(render);
  if (!statusIsInteractive() && total > 0) {
    console.log(STATUS_PREFIX + `${label}: 0/${total} ${unit}…`);
  }

  const logDecileIfNeeded = () => {
    if (statusIsInteractive() || total <= 0) return;
    const decile = Math.floor((completedItems / total) * 10);
    if (decile > lastLoggedDecile) {
      lastLoggedDecile = decile;
      console.log(
        STATUS_PREFIX +
          `${label}: ${completedItems}/${total} ${unit} (${Math.floor(ratio() * 100)}%)`
      );
    }
  };

  return {
    increment({ items = 1, bytes = 0 } = {}) {
      completedItems = Math.min(completedItems + items, total);
      completedBytes =
        totalBytes > 0
          ? Math.min(completedBytes + bytes, totalBytes)
          : completedBytes + bytes;
      logDecileIfNeeded();
    },
    finish() {
      const complete = total > 0 && completedItems >= total;
      finishStatusLine(
        handle,
        complete
          ? `${statusColor('32', '✓')} ${label} · ${total} ${unit} (${formatDuration(Date.now() - startedAt)})`
          : null
      );
    }
  };
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function staleSiblingPattern(expectedLeaf, kind) {
  const leaf = expectedLeaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${leaf}\\.${kind}-\\d+-\\d+-[0-9a-f]{8}$`);
}

async function prepareStaleRemoteState(
  client,
  safeRemoteDir,
  expectedLeaf,
  remoteType
) {
  const parent = path.posix.dirname(safeRemoteDir);
  const uploadPattern = staleSiblingPattern(
    expectedLeaf,
    REMOTE_SIBLING_KIND_UPLOAD
  );
  const oldPattern = staleSiblingPattern(expectedLeaf, REMOTE_SIBLING_KIND_OLD);
  const entries = await client.list(parent).catch(() => []);
  const siblings = entries.filter(
    (entry) =>
      entry.type === 'd' &&
      (uploadPattern.test(entry.name) || oldPattern.test(entry.name))
  );
  let effectiveRemoteType = remoteType;

  if (!remoteType) {
    const backups = siblings
      .filter((entry) => oldPattern.test(entry.name))
      .sort((a, b) => (b.modifyTime ?? 0) - (a.modifyTime ?? 0));
    const newestBackup = backups[0];
    if (newestBackup) {
      warn(
        `Public target ${safeRemoteDir} is missing (previous run likely died mid-swap); restoring backup ${newestBackup.name} before deploying.`
      );
      await client.rename(`${parent}/${newestBackup.name}`, safeRemoteDir);
      effectiveRemoteType = 'd';
    }
  }

  for (const entry of siblings) {
    const entryPath = `${parent}/${entry.name}`;
    if (!effectiveRemoteType && oldPattern.test(entry.name)) {
      warn(
        `Keeping ${entryPath}: public target is missing and this backup may be the only remaining copy.`
      );
      continue;
    }
    if (
      entry.modifyTime &&
      Date.now() - entry.modifyTime < STALE_SIBLING_MIN_AGE_MS
    ) {
      warn(
        `Keeping recent remote directory ${entryPath} (possible concurrent or interrupted run; cleaned once older than 1h).`
      );
      continue;
    }
    if (`${parent}/${entry.name}` === safeRemoteDir) continue;
    await removeRemoteDirRecursive(
      client,
      entryPath,
      `Removing stale remote directory ${entry.name}`
    ).catch(() =>
      warn(`Could not remove stale remote directory: ${entryPath}`)
    );
  }

  return effectiveRemoteType;
}

async function collectRemoteRemovalManifest(client, dir) {
  const entries = [];

  async function visit(currentDir) {
    const children = await client.list(currentDir);
    for (const entry of children) {
      const child = `${currentDir}/${entry.name}`;
      if (entry.type === 'd') {
        await visit(child);
        entries.push({ path: child, type: 'd' });
      } else {
        entries.push({ path: child, type: entry.type });
      }
    }
  }

  await visit(dir);
  entries.push({ path: dir, type: 'd' });

  return { entries, totalEntries: entries.length };
}

async function removeRemoteDirRecursive(
  client,
  dir,
  label = `Removing remote directory ${dir}`
) {
  const scanSpinner = startSpinner(`${label}: scanning`);
  const manifest = await collectRemoteRemovalManifest(client, dir);
  scanSpinner.done(`${label}: ${manifest.totalEntries} entries to remove`);
  const progress = createRemoteRemovalProgress(label, manifest);

  try {
    for (const entry of manifest.entries) {
      if (entry.type === 'd') {
        await client.rmdir(entry.path, false);
      } else {
        await client.delete(entry.path, true);
      }
      progress.onEntryRemoved();
    }
  } finally {
    progress.finish();
  }
}

function createRemoteSiblingDir(remoteDir, expectedLeaf, kind) {
  const parent = path.posix.dirname(remoteDir);
  const leaf = `${expectedLeaf}.${kind}-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  return `${parent}/${leaf}`;
}

function createRemoteDeploymentLockDir(remoteDir, expectedLeaf) {
  const parent = path.posix.dirname(remoteDir);
  return `${parent}/${expectedLeaf}.${REMOTE_DEPLOYMENT_LOCK_SUFFIX}`;
}

async function acquireRemoteDeploymentLock(
  client,
  lockDir,
  { recoverStaleLock = false } = {}
) {
  const existingType = await client.exists(lockDir);
  if (existingType) {
    if (!recoverStaleLock) {
      throw new Error(
        `Deployment lock already exists: ${lockDir}. Another deployment may be active. Refusing to continue.`
      );
    }
    if (existingType !== 'd') {
      throw new Error(
        `Deployment lock is not a directory: ${lockDir}. Inspect it manually.`
      );
    }
    await client.rmdir(lockDir, false);
    warn(
      `Recovered deployment lock ${lockDir} after explicit operator confirmation.`
    );
  }

  try {
    await client.mkdir(lockDir, false);
  } catch (error) {
    throw new Error(
      `Could not acquire deployment lock ${lockDir}. Another deployment may have started.`,
      { cause: error }
    );
  }
}

async function releaseRemoteDeploymentLock(client, lockDir) {
  await client.rmdir(lockDir, false);
}

function assertSafeRemoteDir(remoteDir, expectedLeaf) {
  const normalized = normalizeRemotePath(remoteDir);
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length < 3) {
    throw new Error(
      `Refusing to clean a broad remote directory: ${normalized}`
    );
  }

  if (parts.at(-2) !== 'html' || parts.at(-1) !== expectedLeaf) {
    throw new Error(
      `Remote directory must end with "html/${expectedLeaf}": ${normalized}`
    );
  }

  return normalized;
}

function normalizeRemotePath(remotePath) {
  const trimmed = remotePath.trim();

  if (!trimmed || trimmed === '/' || trimmed === '.' || trimmed === '..') {
    throw new Error('Remote directory is not safe to clean.');
  }

  if (
    trimmed.includes('\0') ||
    trimmed.includes('\\') ||
    /[\r\n\t]/.test(trimmed)
  ) {
    throw new Error(`Remote directory contains invalid characters: ${trimmed}`);
  }

  const normalized = trimmed.replace(/\/+/g, '/').replace(/\/$/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error(`Remote directory contains unsafe segments: ${normalized}`);
  }

  return normalized;
}

const publicResponseLifecycles = new WeakMap();

function createPublicUrlTimeoutError(url, timeoutMs, cause) {
  const error = new Error(
    `Public URL check timed out after ${formatDuration(timeoutMs)}: ${url}`,
    { cause }
  );
  error.name = 'PublicUrlTimeoutError';
  return error;
}

function createPublicResponseLifecycle(url, timeoutMs) {
  const controller = new AbortController();
  let resolveDeadline;
  let rejectDeadline;
  const deadlinePromise = new Promise((resolve, reject) => {
    resolveDeadline = resolve;
    rejectDeadline = reject;
  });
  deadlinePromise.catch(() => undefined);

  const lifecycle = {
    controller,
    deadlinePromise,
    deadlineSettled: false,
    rejectDeadline,
    resolveDeadline,
    timeout: undefined,
    timeoutError: null,
    timeoutMs,
    url
  };
  lifecycle.timeout = setTimeout(() => {
    if (lifecycle.deadlineSettled) return;

    const timeoutError = createPublicUrlTimeoutError(url, timeoutMs);
    lifecycle.deadlineSettled = true;
    lifecycle.timeoutError = timeoutError;
    lifecycle.rejectDeadline(timeoutError);
    lifecycle.controller.abort(timeoutError);
  }, timeoutMs);
  lifecycle.timeout.unref?.();
  return lifecycle;
}

function releasePublicResponseLifecycle(lifecycle) {
  clearTimeout(lifecycle.timeout);
  if (lifecycle.deadlineSettled) return;

  lifecycle.deadlineSettled = true;
  lifecycle.resolveDeadline();
}

function releasePublicResponse(response) {
  const lifecycle = publicResponseLifecycles.get(response);
  if (!lifecycle) return;

  releasePublicResponseLifecycle(lifecycle);
  publicResponseLifecycles.delete(response);
}

async function cancelPublicResponse(response) {
  const lifecycle = publicResponseLifecycles.get(response);
  try {
    if (!response.bodyUsed) {
      const cancellationPromise = Promise.resolve(response.body?.cancel?.());
      await (lifecycle
        ? Promise.race([cancellationPromise, lifecycle.deadlinePromise])
        : cancellationPromise);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'PublicUrlTimeoutError') {
      throw error;
    }
    if (lifecycle?.timeoutError) {
      throw lifecycle.timeoutError;
    }
    throw error;
  } finally {
    releasePublicResponse(response);
  }
}

async function readPublicResponseText(response) {
  const lifecycle = publicResponseLifecycles.get(response);
  const bodyPromise = Promise.resolve().then(() => response.text());
  try {
    return await (lifecycle
      ? Promise.race([bodyPromise, lifecycle.deadlinePromise])
      : bodyPromise);
  } catch (error) {
    if (error instanceof Error && error.name === 'PublicUrlTimeoutError') {
      throw error;
    }
    if (lifecycle?.timeoutError) {
      throw lifecycle.timeoutError;
    }
    throw error;
  } finally {
    releasePublicResponse(response);
  }
}

async function fetchPublicUrl(
  url,
  {
    accept = 'text/html',
    fetchImpl = fetch,
    headers = {},
    method = 'GET',
    timeoutMs = PUBLIC_URL_CHECK_TIMEOUT_MS
  } = {}
) {
  const lifecycle = createPublicResponseLifecycle(url, timeoutMs);

  try {
    const fetchPromise = Promise.resolve(
      fetchImpl(url, {
        method,
        redirect: 'manual',
        headers: {
          accept,
          'cache-control': 'no-cache',
          pragma: 'no-cache',
          ...headers
        },
        signal: lifecycle.controller.signal
      })
    );
    const response = await Promise.race([
      fetchPromise,
      lifecycle.deadlinePromise
    ]);
    publicResponseLifecycles.set(response, lifecycle);
    return response;
  } catch (error) {
    releasePublicResponseLifecycle(lifecycle);
    if (error instanceof Error && error.name === 'PublicUrlTimeoutError') {
      throw error;
    }
    if (lifecycle.timeoutError) {
      throw lifecycle.timeoutError;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw createPublicUrlTimeoutError(url, timeoutMs, error);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Public URL check failed for ${url}: ${message}`, {
      cause: error
    });
  }
}

function buildBackendValidationRoutes(backendRouting) {
  if (!backendRouting) {
    return [null];
  }

  const total = backendRouting.backendValues.length;
  return backendRouting.backendValues.map((backendValue, index) => ({
    backendHeaderName: backendRouting.backendHeaderName,
    backendValue,
    cookieName: backendRouting.cookieName,
    index: index + 1,
    total
  }));
}

function withBackendValidationRoute(options, backendRoute) {
  if (!backendRoute) {
    return {
      ...options,
      backendRoute: null
    };
  }

  return {
    ...options,
    backendRoute,
    headers: {
      ...(options.headers ?? {}),
      cookie: `${backendRoute.cookieName}=${backendRoute.backendValue}`
    }
  };
}

function mergePublicRequestHeaders(options, headers) {
  return {
    ...(options.headers ?? {}),
    ...headers
  };
}

function assertExpectedBackendResponse(response, backendRoute, url) {
  if (!backendRoute) return;

  const observedBackend = response.headers
    .get(backendRoute.backendHeaderName)
    ?.trim();
  if (observedBackend !== backendRoute.backendValue) {
    throw new Error(
      `Public route did not confirm routing backend ${backendRoute.index}/${backendRoute.total} in ${backendRoute.backendHeaderName}: ${url}`
    );
  }
}

function readCacheControlDirectives(response) {
  return (response.headers.get('cache-control') ?? '')
    .split(',')
    .map((directive) => directive.trim().toLowerCase().split('=', 1)[0])
    .filter(Boolean);
}

function readResponseMediaType(response) {
  return (response.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

function assertResponseUsesNoStore(response, label, url) {
  const directives = readCacheControlDirectives(response);
  if (!directives.includes('no-store')) {
    throw new Error(`${label} must use Cache-Control: no-store: ${url}`);
  }
}

function assertResponseUsesImmutablePublicCache(response, label, url) {
  const cacheControl = response.headers.get('cache-control') ?? '';
  const directives = readCacheControlDirectives(response);
  const maxAgeDirective = cacheControl
    .split(',')
    .map((directive) => directive.trim())
    .find((directive) => /^max-age\s*=/i.test(directive));
  const maxAgeMatch = maxAgeDirective?.match(/^max-age\s*=\s*(\d+)$/i);
  const hasPositiveMaxAge = Boolean(maxAgeMatch && Number(maxAgeMatch[1]) > 0);
  const hasForbiddenDirective =
    directives.includes('private') ||
    directives.includes('no-store') ||
    directives.includes('no-cache');

  if (
    !directives.includes('public') ||
    !directives.includes('immutable') ||
    !hasPositiveMaxAge ||
    hasForbiddenDirective
  ) {
    throw new Error(
      `${label} must use Cache-Control with public, a positive max-age, and immutable, without private, no-store, or no-cache: ${url}`
    );
  }
}

async function assertPublicHtmlResponse(
  response,
  requestedUrl,
  basePath,
  backendRoute
) {
  try {
    if (!response.ok) {
      throw new Error(
        `Public URL check returned ${response.status}: ${requestedUrl}`
      );
    }
    if (response.url !== requestedUrl) {
      throw new Error(
        `Public URL unexpectedly resolved to ${response.url || '<unknown>'}; expected ${requestedUrl}.`
      );
    }
    const contentType = readResponseMediaType(response);
    if (contentType !== 'text/html') {
      throw new Error(
        `Public URL returned ${contentType || 'an unknown content type'}; expected text/html: ${requestedUrl}`
      );
    }
    assertResponseUsesNoStore(response, 'Public HTML', requestedUrl);
    assertExpectedBackendResponse(response, backendRoute, requestedUrl);
    const html = await readPublicResponseText(response);
    assertHtmlBaseHref(html, basePath, requestedUrl);
    return html;
  } catch (error) {
    await cancelPublicResponse(response);
    throw error;
  }
}

function readTagAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function findCriticalPublicAssets(html, deployment) {
  const documentUrl = new URL(deployment.publicUrl);
  const expectedPathPrefix = expectedBaseHref(deployment.basePath);
  let moduleUrl = null;
  let stylesheetUrl = null;

  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    if (!moduleUrl && /^<script\b/i.test(tag)) {
      const type = readTagAttribute(tag, 'type');
      const src = readTagAttribute(tag, 'src');
      if (type?.toLowerCase() === 'module' && src) {
        const candidate = new URL(src, documentUrl);
        if (
          candidate.origin === documentUrl.origin &&
          candidate.pathname.startsWith(expectedPathPrefix)
        ) {
          moduleUrl = candidate.href;
        }
      }
    }

    if ((!moduleUrl || !stylesheetUrl) && /^<link\b/i.test(tag)) {
      const rel = readTagAttribute(tag, 'rel');
      const href = readTagAttribute(tag, 'href');
      const relValues = rel?.toLowerCase().split(/\s+/) ?? [];
      if (!moduleUrl && relValues.includes('modulepreload') && href) {
        const candidate = new URL(href, documentUrl);
        if (
          candidate.origin === documentUrl.origin &&
          candidate.pathname.startsWith(expectedPathPrefix)
        ) {
          moduleUrl = candidate.href;
        }
      }
      if (!stylesheetUrl && relValues.includes('stylesheet') && href) {
        const candidate = new URL(href, documentUrl);
        if (
          candidate.origin === documentUrl.origin &&
          candidate.pathname.startsWith(expectedPathPrefix)
        ) {
          stylesheetUrl = candidate.href;
        }
      }
    }

    if (moduleUrl && stylesheetUrl) break;
  }

  if (!moduleUrl || !stylesheetUrl) {
    throw new Error(
      `${deployment.publicUrl} must reference a same-origin JavaScript module and stylesheet under ${expectedPathPrefix}.`
    );
  }

  return [
    {
      accept: 'text/javascript, application/javascript',
      contentTypes: ['text/javascript', 'application/javascript'],
      label: 'module script',
      url: moduleUrl
    },
    {
      accept: 'text/css',
      contentTypes: ['text/css'],
      label: 'stylesheet',
      url: stylesheetUrl
    }
  ];
}

async function verifyCriticalPublicAssets(html, deployment, options) {
  for (const asset of findCriticalPublicAssets(html, deployment)) {
    const response = await fetchPublicUrl(asset.url, {
      ...options,
      accept: asset.accept
    });
    try {
      if (!response.ok) {
        throw new Error(
          `Public ${asset.label} returned ${response.status}: ${asset.url}`
        );
      }
      if (response.url !== asset.url) {
        throw new Error(
          `Public ${asset.label} unexpectedly resolved to ${response.url || '<unknown>'}; expected ${asset.url}.`
        );
      }
      const contentType = readResponseMediaType(response);
      if (!asset.contentTypes.includes(contentType)) {
        throw new Error(
          `Public ${asset.label} returned ${contentType || 'an unknown content type'}: ${asset.url}`
        );
      }
      assertResponseUsesImmutablePublicCache(
        response,
        `Public ${asset.label}`,
        asset.url
      );
      assertExpectedBackendResponse(response, options.backendRoute, asset.url);
      log(`Public asset check: ${response.status} ${asset.url}`);
    } finally {
      await cancelPublicResponse(response);
    }
  }
}

function assertPublicAssetResponse(
  response,
  { backendRoute, contentTypes, label, requireNoStore = false, url }
) {
  if (!response.ok) {
    throw new Error(`Public ${label} returned ${response.status}: ${url}`);
  }
  if (response.url !== url) {
    throw new Error(
      `Public ${label} unexpectedly resolved to ${response.url || '<unknown>'}; expected ${url}.`
    );
  }
  const contentType = readResponseMediaType(response);
  if (!contentTypes.includes(contentType)) {
    throw new Error(
      `Public ${label} returned ${contentType || 'an unknown content type'}: ${url}`
    );
  }
  if (requireNoStore) {
    assertResponseUsesNoStore(response, `Public ${label}`, url);
  }
  assertExpectedBackendResponse(response, backendRoute, url);
}

function resolvePublicAssetUrl(deployment, assetPath) {
  return new URL(assetPath, deployment.publicUrl).href;
}

async function verifyMutablePublicAssets(deployment, expectedVersion, options) {
  const versionUrl = resolvePublicAssetUrl(deployment, '_app/version.json');
  const versionResponse = await fetchPublicUrl(versionUrl, {
    ...options,
    accept: 'application/json'
  });
  try {
    assertPublicAssetResponse(versionResponse, {
      backendRoute: options.backendRoute,
      contentTypes: ['application/json'],
      label: 'version metadata',
      requireNoStore: true,
      url: versionUrl
    });
    let versionPayload;
    try {
      versionPayload = JSON.parse(
        await readPublicResponseText(versionResponse)
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'PublicUrlTimeoutError') {
        throw error;
      }
      throw new Error(
        `Public version metadata is not valid JSON: ${versionUrl}`,
        {
          cause: error
        }
      );
    }
    const observedVersion =
      typeof versionPayload?.version === 'string' ? versionPayload.version : '';
    if (!observedVersion.trim()) {
      throw new Error(
        `Public version metadata does not contain a non-empty version: ${versionUrl}`
      );
    }
    if (expectedVersion && observedVersion !== expectedVersion) {
      throw new Error(
        `Public version metadata serves "${observedVersion}"; expected "${expectedVersion}": ${versionUrl}`
      );
    }
    log(`Public version check: ${observedVersion} ${versionUrl}`);
  } finally {
    await cancelPublicResponse(versionResponse);
  }
  const mutableAssets = [
    {
      accept: 'text/javascript, application/javascript',
      contentTypes: ['text/javascript', 'application/javascript'],
      label: 'service worker',
      path: 'sw.js'
    },
    {
      accept: 'application/manifest+json',
      contentTypes: ['application/manifest+json'],
      label: 'web app manifest',
      path: 'manifest.webmanifest'
    }
  ];

  for (const asset of mutableAssets) {
    const url = resolvePublicAssetUrl(deployment, asset.path);
    const response = await fetchPublicUrl(url, {
      ...options,
      accept: asset.accept
    });
    try {
      assertPublicAssetResponse(response, {
        backendRoute: options.backendRoute,
        contentTypes: asset.contentTypes,
        label: asset.label,
        requireNoStore: true,
        url
      });
      log(`Public ${asset.label} check: ${response.status} ${url}`);
    } finally {
      await cancelPublicResponse(response);
    }
  }
}

async function verifyMissingHashedAssetCachePolicy(
  deployment,
  expectedVersion,
  options
) {
  const missingHash = createHash('sha256')
    .update(expectedVersion)
    .digest('hex')
    .slice(0, 12);
  const missingUrl = resolvePublicAssetUrl(
    deployment,
    `_app/immutable/chunks/__khartis-deploy-missing.${missingHash}.js`
  );
  const response = await fetchPublicUrl(missingUrl, {
    ...options,
    accept: 'text/javascript, application/javascript'
  });
  try {
    if (response.status !== 404) {
      throw new Error(
        `Missing hashed asset check returned ${response.status}; expected 404: ${missingUrl}`
      );
    }
    if (response.url !== missingUrl) {
      throw new Error(
        `Missing hashed asset unexpectedly resolved to ${response.url || '<unknown>'}; expected ${missingUrl}.`
      );
    }
    const directives = readCacheControlDirectives(response);
    if (!directives.includes('no-store') || directives.includes('immutable')) {
      throw new Error(
        `Missing hashed asset must use Cache-Control: no-store without immutable: ${missingUrl}`
      );
    }
    assertExpectedBackendResponse(response, options.backendRoute, missingUrl);
  } finally {
    await cancelPublicResponse(response);
  }
  log(`Missing hashed asset check: 404 ${missingUrl}`);
}

async function verifyCompressedWasmAsset(deployment, wasmAssetPath, options) {
  const url = resolvePublicAssetUrl(deployment, wasmAssetPath);
  const response = await fetchPublicUrl(url, {
    ...options,
    accept: 'application/wasm',
    headers: mergePublicRequestHeaders(options, {
      'accept-encoding': 'br, gzip'
    }),
    method: 'HEAD'
  });
  try {
    assertPublicAssetResponse(response, {
      backendRoute: options.backendRoute,
      contentTypes: ['application/wasm'],
      label: 'WASM asset',
      url
    });
    assertResponseUsesImmutablePublicCache(response, 'Public WASM asset', url);
    const contentEncoding = (
      response.headers.get('content-encoding') ?? ''
    ).toLowerCase();
    if (contentEncoding !== 'br' && contentEncoding !== 'gzip') {
      throw new Error(
        `Public WASM asset is not served with Brotli or gzip compression: ${url}`
      );
    }
    const vary = (response.headers.get('vary') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase());
    if (!vary.includes('accept-encoding')) {
      throw new Error(
        `Public WASM asset must use Vary: Accept-Encoding: ${url}`
      );
    }
  } finally {
    await cancelPublicResponse(response);
  }
  log(`Public WASM compression check: ${response.status} ${url}`);
}

async function verifySlashlessPublicUrl(deployment, options) {
  if (!deployment.basePath) return;

  const slashlessUrl = new URL(deployment.publicUrl);
  slashlessUrl.pathname = deployment.basePath;
  const slashlessHref = slashlessUrl.href;
  const slashlessResponse = await fetchPublicUrl(slashlessHref, options);

  try {
    assertExpectedBackendResponse(
      slashlessResponse,
      options.backendRoute,
      slashlessHref
    );
    if (!ALLOWED_PUBLIC_REDIRECT_STATUSES.has(slashlessResponse.status)) {
      throw new Error(
        `Slashless public URL check returned ${slashlessResponse.status}: ${slashlessHref}`
      );
    }

    const location = slashlessResponse.headers.get('location');
    if (!location) {
      throw new Error(
        `Slashless public URL returned ${slashlessResponse.status} without a Location header: ${slashlessHref}`
      );
    }
    const redirectUrl = new URL(location, slashlessHref);

    if (redirectUrl.href !== deployment.publicUrl) {
      throw new Error(
        `Slashless public URL redirects to ${redirectUrl.href}; expected ${deployment.publicUrl}.`
      );
    }

    log(
      `Slashless public URL check: ${slashlessResponse.status} ${slashlessHref} -> ${deployment.publicUrl}`
    );
  } finally {
    await cancelPublicResponse(slashlessResponse);
  }
}

async function verifyPublicInfrastructure(deployment, options = {}) {
  const backendLabel = options.backendRoute
    ? ` (backend ${options.backendRoute.index}/${options.backendRoute.total})`
    : '';
  log(
    `Checking public infrastructure before SFTP${backendLabel}: ${deployment.publicUrl}`
  );
  const canonicalResponse = await fetchPublicUrl(deployment.publicUrl, options);

  if (canonicalResponse.status === 404) {
    try {
      if (canonicalResponse.url !== deployment.publicUrl) {
        throw new Error(
          `Missing canonical public route unexpectedly resolved to ${canonicalResponse.url || '<unknown>'}; expected ${deployment.publicUrl}.`
        );
      }
      assertResponseUsesNoStore(
        canonicalResponse,
        'Missing canonical public route',
        deployment.publicUrl
      );
      assertExpectedBackendResponse(
        canonicalResponse,
        options.backendRoute,
        deployment.publicUrl
      );
      log(
        `Public infrastructure preflight: 404 ${deployment.publicUrl} (first deployment)`
      );
      return PUBLIC_INFRASTRUCTURE_MISSING;
    } finally {
      await cancelPublicResponse(canonicalResponse);
    }
  }

  const canonicalHtml = await assertPublicHtmlResponse(
    canonicalResponse,
    deployment.publicUrl,
    deployment.basePath,
    options.backendRoute
  );
  log(
    `Public infrastructure preflight: ${canonicalResponse.status} ${deployment.publicUrl}`
  );
  await verifyCriticalPublicAssets(canonicalHtml, deployment, options);
  await verifyMutablePublicAssets(deployment, undefined, options);
  await verifyMissingHashedAssetCachePolicy(
    deployment,
    PUBLIC_PREFLIGHT_MISSING_ASSET_SEED,
    options
  );
  await verifySlashlessPublicUrl(deployment, options);
  return PUBLIC_INFRASTRUCTURE_PRESENT;
}

async function verifyPublicInfrastructureWithRetries(deployment, options = {}) {
  const validationAttempts =
    options.validationAttempts ?? PUBLIC_URL_VALIDATION_ATTEMPTS;
  const retryDelaysMs =
    options.retryDelaysMs ?? PUBLIC_URL_VALIDATION_RETRY_DELAYS_MS;
  const backendRoutes = buildBackendValidationRoutes(options.backendRouting);
  const infrastructureStates = new Set();

  for (const backendRoute of backendRoutes) {
    const routeOptions = withBackendValidationRoute(options, backendRoute);
    for (let attempt = 1; attempt <= validationAttempts; attempt++) {
      try {
        infrastructureStates.add(
          await verifyPublicInfrastructure(deployment, routeOptions)
        );
        break;
      } catch (error) {
        if (attempt === validationAttempts) throw error;
        const delayMs =
          retryDelaysMs[
            Math.min(attempt - 1, Math.max(0, retryDelaysMs.length - 1))
          ] ?? 0;
        const message = error instanceof Error ? error.message : String(error);
        const backendLabel = backendRoute
          ? ` for backend ${backendRoute.index}/${backendRoute.total}`
          : '';
        warn(
          `Public infrastructure preflight attempt ${attempt}/${validationAttempts}${backendLabel} failed (${message}); retrying in ${formatDuration(delayMs)}.`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  if (infrastructureStates.size > 1) {
    throw new Error(
      'Public infrastructure is inconsistent: some backends serve the canonical route while others return 404.'
    );
  }
}

async function reportPublicInfrastructurePreflight(deployment, options = {}) {
  try {
    await verifyPublicInfrastructureWithRetries(deployment, {
      ...options,
      validationAttempts: 1
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warn(
      `Public infrastructure preflight reported a mismatch; deployment will continue so the uploaded release can be inspected and the web tier adjusted: ${message}`
    );
  }
}

async function verifyPublicUrlWithRetries(deployment, options = {}) {
  const validationAttempts =
    options.validationAttempts ?? PUBLIC_URL_VALIDATION_ATTEMPTS;
  const retryDelaysMs =
    options.retryDelaysMs ?? PUBLIC_URL_VALIDATION_RETRY_DELAYS_MS;
  const backendRoutes = buildBackendValidationRoutes(options.backendRouting);

  for (const backendRoute of backendRoutes) {
    const routeOptions = withBackendValidationRoute(options, backendRoute);
    for (let attempt = 1; attempt <= validationAttempts; attempt++) {
      try {
        await verifyPublicUrl(deployment, routeOptions);
        break;
      } catch (error) {
        if (attempt === validationAttempts) throw error;
        const delayMs =
          retryDelaysMs[
            Math.min(attempt - 1, Math.max(0, retryDelaysMs.length - 1))
          ] ?? 0;
        const message = error instanceof Error ? error.message : String(error);
        const backendLabel = backendRoute
          ? ` for backend ${backendRoute.index}/${backendRoute.total}`
          : '';
        warn(
          `Public route validation attempt ${attempt}/${validationAttempts}${backendLabel} failed (${message}); retrying in ${formatDuration(delayMs)} while the web tier syncs.`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}

async function reportPublicRouteValidation(deployment, options = {}) {
  try {
    await verifyPublicUrlWithRetries(deployment, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warn(
      `Public route validation reported a mismatch, but the uploaded release remains active for infrastructure adjustment: ${message}`
    );
  }
}

async function verifyPublicUrl(deployment, options = {}) {
  const expectedVersion = options.expectedVersion?.trim();
  if (!expectedVersion) {
    throw new Error('Public URL verification requires an expected version.');
  }
  const wasmAssetPath = assertReleaseAssetPath(options.wasmAssetPath);
  if (!wasmAssetPath.endsWith('.wasm')) {
    throw new Error(
      `Public URL verification requires an uncompressed WASM asset path: ${wasmAssetPath}`
    );
  }

  const backendLabel = options.backendRoute
    ? ` (backend ${options.backendRoute.index}/${options.backendRoute.total})`
    : '';
  log(`Checking public URL${backendLabel}: ${deployment.publicUrl}`);
  const canonicalResponse = await fetchPublicUrl(deployment.publicUrl, options);
  const canonicalHtml = await assertPublicHtmlResponse(
    canonicalResponse,
    deployment.publicUrl,
    deployment.basePath,
    options.backendRoute
  );
  log(`Public URL check: ${canonicalResponse.status} ${deployment.publicUrl}`);
  await verifyCriticalPublicAssets(canonicalHtml, deployment, options);
  await verifyMutablePublicAssets(deployment, expectedVersion, options);
  await verifyMissingHashedAssetCachePolicy(
    deployment,
    expectedVersion,
    options
  );
  await verifyCompressedWasmAsset(deployment, wasmAssetPath, options);

  await verifySlashlessPublicUrl(deployment, options);
}

async function closeSftpClient(client, label) {
  let timeout;
  const timeoutError = new Error('SFTP close timed out');
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(timeoutError), SFTP_CLOSE_TIMEOUT_MS);
    timeout.unref?.();
  });

  try {
    await Promise.race([client.end(), timeoutPromise]);
  } catch (error) {
    if (error === timeoutError) {
      client.client?.destroy?.();
      warn(
        `${label} SFTP close timed out after ${formatDuration(SFTP_CLOSE_TIMEOUT_MS)}; forced socket shutdown.`
      );
      return;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    if (!options.quiet) {
      log(`$ ${command} ${args.join(' ')}`);
    }

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: options.quiet ? 'ignore' : 'inherit'
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || options.allowFailure) {
        resolve(code);
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function output(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`${command} exited with code ${code}\n${stderr}`));
    });
  });
}

function log(message) {
  clearStatusLine();
  console.log(STATUS_PREFIX + message);
  paintStatusLine();
}

function warn(message) {
  clearStatusLine();
  console.warn(`${STATUS_PREFIX}WARNING: ${message}`);
  paintStatusLine();
}

function restoreTerminal() {
  stopStatusLine();
  const input = process.stdin;
  try {
    if (input.isTTY && typeof input.setRawMode === 'function') {
      input.setRawMode(false);
    }
    input.pause();
  } catch {
    // Best effort: leaving stdin as-is is preferable to masking the deploy result.
  }
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  main()
    .then(() => {
      restoreTerminal();
      process.exit(0);
    })
    .catch((error) => {
      stopStatusLine();
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[deploy-local] ERROR: ${message}`);
      restoreTerminal();
      process.exit(error?.exitCode === 130 ? 130 : 1);
    });
}

export {
  acquireRemoteDeploymentLock,
  assertBuildMatchesDeployment,
  assertHtmlBaseHref,
  assertReleaseCommitBelongsToBranch,
  assertTagCommitMatchesRemote,
  buildBackendValidationRoutes,
  createTerminationCoordinator,
  findCompressedWasmAssetPath,
  findSuccessfulReleaseRun,
  parseRemoteBranchHead,
  parseRemoteTagCommit,
  parseRemoteTagNames,
  reportPublicInfrastructurePreflight,
  reportPublicRouteValidation,
  releaseRemoteDeploymentLock,
  retainPreviousReleaseAssets,
  resolveDeploymentPublicUrl,
  sanitizedChildEnv,
  startProgress,
  startSpinner,
  truncateToWidth,
  verifyPublicInfrastructure,
  verifyPublicInfrastructureWithRetries,
  verifyPublicUrl,
  verifyPublicUrlWithRetries,
  writeReleaseAssetManifest
};
