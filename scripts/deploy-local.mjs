#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import SftpClient from 'ssh2-sftp-client';

const REPO = 'AtelierCartographie/khartis-v3';
const RELEASE_WORKFLOW = 'release.yml';
const LOCAL_ENV_FILES = ['.env', '.env.deploy.local'];
const DEFAULT_PORT = 22;
const PUBLIC_URL_CHECK_TIMEOUT_MS = 15_000;
const SFTP_CLOSE_TIMEOUT_MS = 5_000;
const STAGING_TAG_PATTERN =
  /^v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)-staging\.(?<staging>\d+)$/;

const TARGETS = {
  pprd: {
    tagPattern: STAGING_TAG_PATTERN,
    basePathEnv: 'KHARTIS_BASE_PATH_PPRD',
    remoteDirLeaf: 'pprd',
    remoteDirEnv: 'KHARTIS_SFTP_REMOTE_DIR_PPRD',
    publicUrlEnv: 'KHARTIS_PUBLIC_URL_PPRD',
    uploadEnabled: true
  }
};

const TARGET_ALIASES = {
  pprd: 'pprd',
  staging: 'pprd'
};

const usage = `Usage:
  pnpm deploy:pprd
  pnpm deploy:pprd:dry-run
  pnpm deploy:pprd -- --tag <tag>
  pnpm deploy:pprd:dry-run -- --tag <tag>

Required local environment:
  KHARTIS_SFTP_HOST
  KHARTIS_SFTP_HOST_FINGERPRINT_SHA256
  KHARTIS_SFTP_USER
  KHARTIS_BASE_PATH_PPRD
  KHARTIS_SFTP_REMOTE_DIR_PPRD

Authentication, choose one:
  KHARTIS_SFTP_PASSWORD
  KHARTIS_SFTP_PRIVATE_KEY_PATH

Optional:
  KHARTIS_SFTP_PORT
  KHARTIS_SFTP_PASSPHRASE
  KHARTIS_PUBLIC_URL_PPRD

Local env files:
  ${LOCAL_ENV_FILES.join(', ')} are supported.
  The build is uploaded to a temporary remote directory, then swapped into
  place with two quick renames; the previous version is removed afterwards.
  Use --tag to deploy an older staging release than the latest tag.
  PRD is intentionally not supported by this local deployment script.
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
  const basePath = readRequiredEnv(target.basePathEnv);
  const buildEnv = {
    BASE_PATH: basePath,
    VITE_APP_VERSION: tag,
    VITE_DEBUG: 'false',
    VITE_LOG_LEVEL: 'ERROR',
    VITE_LOG_STACK: 'false'
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
      options.dryRun
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

    const uploadBuildDir = path.join(uploadSnapshotRoot, 'build');
    await cp(buildDir, uploadBuildDir, { recursive: true });

    if (options.dryRun) {
      log('Dry run: build succeeded, SFTP upload skipped.');
      return;
    }

    const config = await readSftpConfig();
    await uploadBuild(config, uploadBuildDir, remoteDir, target.remoteDirLeaf);
    await verifyPublicUrl(process.env[target.publicUrlEnv]);
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
    .map(parseVersionedStagingTag)
    .sort(compareVersionedStagingTagsDesc);

  const [tag] = tags;
  if (!tag) {
    throw new Error(
      'No matching tag found. Run git fetch origin --tags first.'
    );
  }
  return tag.name;
}

function parseVersionedStagingTag(tag) {
  const match = STAGING_TAG_PATTERN.exec(tag);
  if (!match?.groups) {
    throw new Error(`Tag "${tag}" does not match the staging tag pattern.`);
  }

  return {
    name: tag,
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    staging: Number(match.groups.staging)
  };
}

function compareVersionedStagingTagsDesc(left, right) {
  return (
    right.major - left.major ||
    right.minor - left.minor ||
    right.patch - left.patch ||
    right.staging - left.staging
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

async function confirmDeployment(target, tag, remoteDir, dryRun) {
  const action = dryRun ? 'dry run' : 'deployment';
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

async function uploadBuild(config, buildDir, remoteDir, expectedRemoteDirLeaf) {
  const safeRemoteDir = assertSafeRemoteDir(remoteDir, expectedRemoteDirLeaf);
  const tempRemoteDir = createRemoteSiblingDir(
    safeRemoteDir,
    expectedRemoteDirLeaf,
    'upload'
  );
  const manifest = await collectUploadManifest(buildDir);
  const uploadProgress = createUploadProgress(manifest);

  await cleanupStaleRemoteSiblings(
    config,
    safeRemoteDir,
    expectedRemoteDirLeaf
  );

  const client = new SftpClient('khartis-local-deploy');
  let swapped = false;
  let preserveTempDir = false;
  let tempRemoteDirCreated = false;

  client.on('upload', (info) => uploadProgress.onFileUploaded(info.source));

  try {
    log('Connecting to SFTP...');
    await client.connect(config);
    const remoteType = await client.exists(safeRemoteDir);
    if (remoteType && remoteType !== 'd') {
      throw new Error('Remote target exists but is not a directory.');
    }

    await client.mkdir(tempRemoteDir, true);
    tempRemoteDirCreated = true;

    log(
      `Uploading ${manifest.totalFiles} files (${formatBytes(manifest.totalBytes)}) to a temporary remote ${expectedRemoteDirLeaf} directory...`
    );
    await client.uploadDir(buildDir, tempRemoteDir, { useFastput: false });
    uploadProgress.finish();
    log('Upload complete.');

    log(`Swapping remote ${expectedRemoteDirLeaf} directory...`);
    const previousRemoteDir = remoteType
      ? createRemoteSiblingDir(safeRemoteDir, expectedRemoteDirLeaf, 'old')
      : null;
    if (previousRemoteDir) {
      await client.rename(safeRemoteDir, previousRemoteDir);
    }
    try {
      await client.rename(tempRemoteDir, safeRemoteDir);
    } catch (error) {
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
    log(`Remote ${expectedRemoteDirLeaf} directory swapped.`);

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
    uploadProgress.finish();
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

async function collectUploadManifest(buildDir) {
  const entries = await readdir(buildDir, {
    recursive: true,
    withFileTypes: true
  });
  const fileSizes = new Map();
  let totalBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(entry.parentPath, entry.name);
    const { size } = await stat(filePath);
    fileSizes.set(filePath, size);
    totalBytes += size;
  }

  return { fileSizes, totalFiles: fileSizes.size, totalBytes };
}

function createUploadProgress({ fileSizes, totalFiles, totalBytes }) {
  const progress = createTaskProgress({
    label: 'Uploading files',
    totalItems: totalFiles,
    totalBytes,
    itemName: 'files'
  });

  return {
    onFileUploaded(source) {
      progress.increment({ items: 1, bytes: fileSizes.get(source) ?? 0 });
    },
    finish: progress.finish
  };
}

function createRemoteRemovalProgress(label, { totalEntries }) {
  const progress = createTaskProgress({
    label,
    totalItems: totalEntries,
    itemName: 'entries'
  });

  return {
    onEntryRemoved() {
      progress.increment();
    },
    finish: progress.finish
  };
}

const PROGRESS_BAR_WIDTH = 24;
const PROGRESS_RENDER_INTERVAL_MS = 200;

function createTaskProgress({ label, totalItems, totalBytes = 0, itemName }) {
  const interactive = process.stdout.isTTY === true;
  const startedAt = Date.now();
  let completedItems = 0;
  let completedBytes = 0;
  let lastRenderAt = 0;
  let lastLoggedDecile = 0;
  let finished = false;

  const statusLine = () => {
    const itemRatio = totalItems > 0 ? completedItems / totalItems : 1;
    const hasByteProgress = totalBytes > 0 && completedBytes > 0;
    const isComplete = totalItems > 0 && completedItems >= totalItems;
    const rawRatio = isComplete
      ? 1
      : hasByteProgress
        ? completedBytes / totalBytes
        : itemRatio;
    const ratio = Math.max(0, Math.min(rawRatio, 1));
    const percent = Math.floor(ratio * 100);
    const filled = Math.round(ratio * PROGRESS_BAR_WIDTH);
    const bar = '█'.repeat(filled) + '░'.repeat(PROGRESS_BAR_WIDTH - filled);
    const remainingItems = Math.max(totalItems - completedItems, 0);
    const elapsedMs = Date.now() - startedAt;
    const completedUnits = isComplete
      ? 1
      : hasByteProgress
        ? completedBytes
        : completedItems;
    const totalUnits = isComplete
      ? 1
      : hasByteProgress
        ? totalBytes
        : totalItems;
    const eta =
      completedUnits > 0 && elapsedMs > 0
        ? formatDuration(
            ((totalUnits - completedUnits) / completedUnits) * elapsedMs
          )
        : '--';
    return `${label} [${bar}] ${percent}% | ${remainingItems}/${totalItems} ${itemName} left | ETA ${eta}`;
  };

  const render = () => {
    if (totalItems === 0) return;

    if (interactive) {
      const now = Date.now();
      if (
        now - lastRenderAt < PROGRESS_RENDER_INTERVAL_MS &&
        completedItems < totalItems
      ) {
        return;
      }
      lastRenderAt = now;
      process.stdout.write(`\r\u001B[2K[deploy-local] ${statusLine()}`);
      return;
    }

    const decile =
      totalItems > 0 ? Math.floor((completedItems / totalItems) * 10) : 10;
    if (decile > lastLoggedDecile) {
      lastLoggedDecile = decile;
      log(statusLine());
    }
  };

  return {
    increment({ items = 1, bytes = 0 } = {}) {
      completedItems = Math.min(completedItems + items, totalItems);
      completedBytes = Math.min(completedBytes + bytes, totalBytes);
      render();
    },
    finish() {
      if (finished) return;
      finished = true;
      if (interactive && completedItems > 0) {
        process.stdout.write(`\r\u001B[2K[deploy-local] ${statusLine()}\n`);
      }
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
  try {
    await client.connect(config);
    await removeStaleRemoteSiblings(client, safeRemoteDir, expectedLeaf);
  } catch (error) {
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
  log(`${label}: scanning remote contents...`);
  const manifest = await collectRemoteRemovalManifest(client, dir);
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

async function verifyPublicUrl(url) {
  if (!url) return;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PUBLIC_URL_CHECK_TIMEOUT_MS
  );
  timeout.unref?.();

  try {
    log(`Checking public URL: ${url}`);
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal
    });
    if (response.ok) {
      log(`Public URL check: ${response.status} ${url}`);
      return;
    }
    warn(`Public URL check returned ${response.status}: ${url}`);
  } catch (error) {
    if (error.name === 'AbortError') {
      warn(
        `Public URL check timed out after ${formatDuration(PUBLIC_URL_CHECK_TIMEOUT_MS)}: ${url}`
      );
      return;
    }
    warn(`Public URL check failed: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
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
  console.log(`[deploy-local] ${message}`);
}

function warn(message) {
  console.warn(`[deploy-local] WARNING: ${message}`);
}

main().catch((error) => {
  console.error(`[deploy-local] ERROR: ${error.message}`);
  process.exit(1);
});
