#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
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
const SFTP_CLOSE_TIMEOUT_MS = 5_000;
const ALLOWED_PUBLIC_REDIRECT_STATUSES = new Set([301, 302, 307, 308]);
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
    uploadEnabled: true
  },
  prod: {
    tagPattern: PROD_TAG_PATTERN,
    remoteDirLeaf: 'prod',
    remoteDirEnv: 'KHARTIS_SFTP_REMOTE_DIR_PROD',
    publicUrlEnv: 'KHARTIS_PUBLIC_URL_PROD',
    gtmContainerEnv: 'KHARTIS_GTM_CONTAINER_ID_PROD',
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

Required local environment (shared):
  KHARTIS_SFTP_HOST
  KHARTIS_SFTP_HOST_FINGERPRINT_SHA256
  KHARTIS_SFTP_USER

Per-target public URL, remote directory and GTM container (remote dir ends with html/<leaf>):
  pprd: KHARTIS_PUBLIC_URL_PPRD, KHARTIS_SFTP_REMOTE_DIR_PPRD (html/pprd), KHARTIS_GTM_CONTAINER_ID_PPRD
  prod: KHARTIS_PUBLIC_URL_PROD, KHARTIS_SFTP_REMOTE_DIR_PROD (html/prod), KHARTIS_GTM_CONTAINER_ID_PROD
  BASE_PATH is derived from each public URL so the build and deployed route cannot diverge.
  Leave the GTM container id empty to ship a target without analytics (e.g. pprd).

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
  place with two quick renames; the previous version is removed afterwards.
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

  const tag = options.tag ?? (await findLatestTag(target.tagPattern));
  assertTagMatchesTarget(tag, target.tagPattern, targetName);
  const tagSha = await output('git', ['rev-list', '-n', '1', tag], {
    cwd: process.cwd()
  });
  const shortSha = tagSha.slice(0, 12);

  log(`Target: ${targetName}`);
  log(`Tag: ${tag}`);
  log(`Commit: ${shortSha}`);

  await assertReleaseRunIsGreen(tagSha);

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

  if (!options.yes) {
    await confirmDeployment(
      targetName,
      tag,
      target.remoteDirLeaf,
      options.dryRun,
      target.productionConfirmation === true
    );
  }

  const worktree = await mkdtemp(path.join(tmpdir(), 'khartis-deploy-'));
  const uploadSnapshotRoot = await mkdtemp(
    path.join(tmpdir(), 'khartis-upload-')
  );
  try {
    await run('git', ['worktree', 'add', '--detach', worktree, tag], {
      cwd: process.cwd()
    });
    await run('pnpm', ['install', '--frozen-lockfile'], { cwd: worktree });
    await run('pnpm', ['build'], {
      cwd: worktree,
      env: { ...process.env, ...buildEnv }
    });

    const buildDir = path.join(worktree, 'build');
    if (!existsSync(buildDir)) {
      throw new Error(`Build directory was not created: ${buildDir}`);
    }
    await assertBuildMatchesDeployment(buildDir, deployment);

    const uploadBuildDir = path.join(uploadSnapshotRoot, 'build');
    const snapshotSpinner = startSpinner('Preparing upload snapshot');
    await cp(buildDir, uploadBuildDir, { recursive: true });
    snapshotSpinner.done('Upload snapshot ready');

    if (options.dryRun) {
      log('Dry run: build succeeded, SFTP upload skipped.');
      return;
    }

    const config = await readSftpConfig();
    await uploadBuild(
      config,
      uploadBuildDir,
      remoteDir,
      target.remoteDirLeaf,
      deployment
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
    dryRun: false
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
    const value = rawValue.replace(/^["']|["']$/g, '');
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

async function findLatestTag(tagPattern) {
  const tags = (await output('git', ['tag'], { cwd: process.cwd() }))
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => tagPattern.test(tag))
    .map((tag) => parseVersionedTag(tag, tagPattern))
    .sort(compareVersionedTagsDesc);

  const [tag] = tags;
  if (!tag) {
    throw new Error(
      'No matching tag found. Run git fetch origin --tags first.'
    );
  }
  return tag.name;
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

async function assertReleaseRunIsGreen(tagSha) {
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
      '--json',
      'conclusion,status,url,displayTitle,updatedAt',
      '--limit',
      '5'
    ],
    { cwd: process.cwd() }
  );

  const runs = JSON.parse(json);
  const successfulRun = runs.find(
    (run) => run.status === 'completed' && run.conclusion === 'success'
  );

  if (!successfulRun) {
    const inspected = runs
      .map(
        (run) =>
          `- ${run.status}/${run.conclusion ?? 'none'} ${run.displayTitle} ${run.url}`
      )
      .join('\n');
    throw new Error(
      `No successful ${RELEASE_WORKFLOW} run found for this tag commit.\n${inspected}`
    );
  }

  log(`GitHub Actions gate: success (${successfulRun.url})`);
}

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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

  const privateKeyPath = process.env.KHARTIS_SFTP_PRIVATE_KEY_PATH?.trim();
  if (privateKeyPath) {
    return {
      host,
      username,
      port,
      privateKey: await readFile(privateKeyPath, 'utf8'),
      passphrase: process.env.KHARTIS_SFTP_PASSPHRASE || undefined,
      hostVerifier: createSftpHostVerifier(hostFingerprints)
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

  return {
    host,
    username,
    port,
    password,
    hostVerifier: createSftpHostVerifier(hostFingerprints)
  };
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
  deployment
) {
  const safeRemoteDir = assertSafeRemoteDir(remoteDir, expectedRemoteDirLeaf);
  const tempRemoteDir = createRemoteSiblingDir(
    safeRemoteDir,
    expectedRemoteDirLeaf,
    'upload'
  );
  const scanSpinner = startSpinner('Scanning build output');
  const manifest = await collectUploadManifest(buildDir);
  scanSpinner.done(
    `Scanned ${manifest.totalFiles} files (${formatBytes(manifest.totalBytes)})`
  );

  await cleanupStaleRemoteSiblings(
    config,
    safeRemoteDir,
    expectedRemoteDirLeaf
  );

  const client = new SftpClient('khartis-local-deploy');
  let swapped = false;
  let preserveTempDir = false;
  let tempRemoteDirCreated = false;
  let uploadProgress = null;

  try {
    const connectSpinner = startSpinner('Connecting to SFTP');
    await client.connect(config);
    connectSpinner.done('Connected to SFTP');
    const remoteType = await client.exists(safeRemoteDir);
    if (remoteType && remoteType !== 'd') {
      throw new Error('Remote target exists but is not a directory.');
    }

    await client.mkdir(tempRemoteDir, true);
    tempRemoteDirCreated = true;

    log(
      `Uploading ${manifest.totalFiles} files (${formatBytes(manifest.totalBytes)}) to a temporary remote ${expectedRemoteDirLeaf} directory…`
    );
    uploadProgress = createUploadProgress(manifest);
    client.on('upload', (info) => uploadProgress.onFileUploaded(info.source));
    await client.uploadDir(buildDir, tempRemoteDir, { useFastput: false });
    uploadProgress.finish();

    const swapSpinner = startSpinner(
      `Swapping remote ${expectedRemoteDirLeaf} directory`
    );
    const previousRemoteDir = remoteType
      ? createRemoteSiblingDir(safeRemoteDir, expectedRemoteDirLeaf, 'old')
      : null;
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

    try {
      await verifyPublicUrl(deployment);
    } catch (validationError) {
      const validationMessage =
        validationError instanceof Error
          ? validationError.message
          : String(validationError);
      warn(
        previousRemoteDir
          ? 'Public route validation failed; restoring the previous version.'
          : 'Public route validation failed; taking the first deployment offline.'
      );
      try {
        await rollbackPublicValidationFailure(client, {
          previousRemoteDir,
          safeRemoteDir,
          tempRemoteDir
        });
        swapped = false;
        log(
          previousRemoteDir
            ? 'Previous remote version restored after validation failure.'
            : 'Failed first deployment removed from the public target.'
        );
      } catch (rollbackError) {
        preserveTempDir = true;
        const rollbackMessage =
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError);
        throw new Error(
          previousRemoteDir
            ? `Public route validation failed (${validationMessage}) and rollback failed (${rollbackMessage}). Previous version: ${previousRemoteDir}, failed upload: ${tempRemoteDir}. Restore one manually.`
            : `Public route validation failed (${validationMessage}) and the failed first deployment could not be taken offline (${rollbackMessage}). Public target: ${safeRemoteDir}. Remove or replace it manually.`,
          { cause: rollbackError }
        );
      }

      throw new Error(
        previousRemoteDir
          ? `Public route validation failed and the previous version was restored: ${validationMessage}`
          : `Public route validation failed and the first deployment was removed: ${validationMessage}`,
        { cause: validationError }
      );
    }

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
  } finally {
    uploadProgress?.finish();
    if (tempRemoteDirCreated && !swapped && !preserveTempDir) {
      await removeRemoteDirRecursive(
        client,
        tempRemoteDir,
        'Removing incomplete temporary remote upload'
      ).catch(() => undefined);
    }
    await closeSftpClient(client, 'deployment').catch(() => undefined);
  }
}

async function rollbackPublicValidationFailure(
  client,
  { previousRemoteDir, safeRemoteDir, tempRemoteDir }
) {
  await client.rename(safeRemoteDir, tempRemoteDir);
  if (previousRemoteDir) {
    await client.rename(previousRemoteDir, safeRemoteDir);
  }
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

async function cleanupStaleRemoteSiblings(config, safeRemoteDir, expectedLeaf) {
  const client = new SftpClient('khartis-local-cleanup');
  const spinner = startSpinner('Checking for stale remote uploads');
  try {
    await client.connect(config);
    spinner.done('Stale remote uploads checked');
    await removeStaleRemoteSiblings(client, safeRemoteDir, expectedLeaf);
  } catch (error) {
    spinner.fail('Stale remote cleanup skipped');
    warn(`Stale remote cleanup skipped: ${error.message}`);
  } finally {
    await closeSftpClient(client, 'stale cleanup').catch(() => undefined);
  }
}

async function removeStaleRemoteSiblings(client, safeRemoteDir, expectedLeaf) {
  const parent = path.posix.dirname(safeRemoteDir);
  const stalePrefixes = [`${expectedLeaf}.upload-`, `${expectedLeaf}.old-`];
  const entries = await client.list(parent).catch(() => []);

  for (const entry of entries) {
    if (entry.type !== 'd') continue;
    if (!stalePrefixes.some((prefix) => entry.name.startsWith(prefix))) {
      continue;
    }
    await removeRemoteDirRecursive(
      client,
      `${parent}/${entry.name}`,
      `Removing stale remote directory ${entry.name}`
    ).catch(() =>
      warn(`Could not remove stale remote directory: ${parent}/${entry.name}`)
    );
  }
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

async function fetchPublicUrl(
  url,
  {
    accept = 'text/html',
    fetchImpl = fetch,
    timeoutMs = PUBLIC_URL_CHECK_TIMEOUT_MS
  } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    return await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { accept },
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Public URL check timed out after ${formatDuration(timeoutMs)}: ${url}`,
        { cause: error }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Public URL check failed for ${url}: ${message}`, {
      cause: error
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function assertPublicHtmlResponse(response, requestedUrl, basePath) {
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
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) {
    throw new Error(
      `Public URL returned ${contentType || 'an unknown content type'}; expected text/html: ${requestedUrl}`
    );
  }
  const html = await response.text();
  assertHtmlBaseHref(html, basePath, requestedUrl);
  return html;
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
      const contentType = response.headers.get('content-type')?.toLowerCase();
      if (
        !contentType ||
        !asset.contentTypes.some((expected) => contentType.includes(expected))
      ) {
        throw new Error(
          `Public ${asset.label} returned ${contentType || 'an unknown content type'}: ${asset.url}`
        );
      }
      log(`Public asset check: ${response.status} ${asset.url}`);
    } finally {
      await response.body?.cancel?.();
    }
  }
}

function hasActiveHsts(response) {
  const header = response.headers.get('strict-transport-security');
  if (!header) return false;
  const maxAge = header.match(/max-age\s*=\s*(\d+)/i);
  return maxAge ? Number(maxAge[1]) > 0 : false;
}

async function verifyPublicUrl(deployment, options = {}) {
  log(`Checking public URL: ${deployment.publicUrl}`);
  const canonicalResponse = await fetchPublicUrl(deployment.publicUrl, options);
  const canonicalHtml = await assertPublicHtmlResponse(
    canonicalResponse,
    deployment.publicUrl,
    deployment.basePath
  );
  log(`Public URL check: ${canonicalResponse.status} ${deployment.publicUrl}`);
  await verifyCriticalPublicAssets(canonicalHtml, deployment, options);

  if (!deployment.basePath) return;

  const slashlessUrl = new URL(deployment.publicUrl);
  slashlessUrl.pathname = deployment.basePath;
  const slashlessHref = slashlessUrl.href;
  const slashlessResponse = await fetchPublicUrl(slashlessHref, options);

  if (slashlessResponse.ok) {
    await assertPublicHtmlResponse(
      slashlessResponse,
      slashlessHref,
      deployment.basePath
    );
    log(
      `Slashless public URL check: ${slashlessResponse.status} ${slashlessHref}`
    );
    return;
  }

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
  const canonicalUrl = new URL(deployment.publicUrl);
  const redirectsToCanonicalResource =
    redirectUrl.host === canonicalUrl.host &&
    redirectUrl.pathname === canonicalUrl.pathname &&
    redirectUrl.search === canonicalUrl.search;

  if (!redirectsToCanonicalResource) {
    throw new Error(
      `Slashless public URL redirects to ${redirectUrl.href}; expected ${deployment.publicUrl}.`
    );
  }

  if (redirectUrl.protocol !== 'https:') {
    // Accept an http Location only when HSTS makes the client upgrade to https before any cleartext request.
    if (redirectUrl.protocol !== 'http:' || !hasActiveHsts(slashlessResponse)) {
      throw new Error(
        `Slashless public URL redirects to ${redirectUrl.href}; expected ${deployment.publicUrl}.`
      );
    }
    warn(
      `Slashless public URL redirects to ${redirectUrl.href} (http scheme); accepted because HSTS upgrades it to https. Fix the server to emit an https Location (nginx: absolute_redirect off, or honor X-Forwarded-Proto).`
    );
  }

  log(
    `Slashless public URL check: ${slashlessResponse.status} ${slashlessHref} -> ${deployment.publicUrl}`
  );
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
      console.error(`[deploy-local] ERROR: ${error.message}`);
      restoreTerminal();
      process.exit(1);
    });
}

export {
  assertBuildMatchesDeployment,
  assertHtmlBaseHref,
  rollbackPublicValidationFailure,
  resolveDeploymentPublicUrl,
  startProgress,
  startSpinner,
  truncateToWidth,
  verifyPublicUrl
};
