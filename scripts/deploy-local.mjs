#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import SftpClient from 'ssh2-sftp-client';

const REPO = 'AtelierCartographie/khartis-v3';
const RELEASE_WORKFLOW = 'release.yml';
const LOCAL_ENV_FILES = ['.env', '.env.deploy.local'];
const DEFAULT_PORT = 22;
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
  ${LOCAL_ENV_FILES.join(', ')} are supported. Remote PPRD is replaced after a temporary upload completes.
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
  const suffix = dryRun ? 'dry-run' : 'deploy';
  const expected = `${target}:${tag}:${suffix}`;
  const answer = await promptVisible(
    `Type "${expected}" to continue (remote target: ${remoteDir}): `
  );
  if (answer !== expected) {
    throw new Error('Deployment cancelled.');
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
  const tempRemoteDir = createRemoteUploadTempDir(
    safeRemoteDir,
    expectedRemoteDirLeaf
  );
  const tempRemoteLeaf = path.posix.basename(tempRemoteDir);
  const client = new SftpClient('khartis-local-deploy');
  let uploaded = 0;
  let finalReplacementStarted = false;
  let finalReplaced = false;

  client.on('upload', () => {
    uploaded += 1;
    if (uploaded % 50 === 0) {
      log(`Uploaded ${uploaded} files...`);
    }
  });

  try {
    log('Connecting to SFTP...');
    await client.connect(config);
    const remoteType = await client.exists(safeRemoteDir);
    if (remoteType && remoteType !== 'd') {
      throw new Error('Remote target exists but is not a directory.');
    }

    log(`Preparing temporary remote ${expectedRemoteDirLeaf} upload...`);
    await client.rmdir(tempRemoteDir, true).catch(() => undefined);
    await client.mkdir(tempRemoteDir, true);

    log(
      `Uploading build/ to temporary remote ${expectedRemoteDirLeaf} directory...`
    );
    await client.uploadDir(buildDir, tempRemoteDir, { useFastput: false });
    log(`Upload complete (${uploaded} files).`);

    log(`Replacing remote ${expectedRemoteDirLeaf} directory...`);
    if (remoteType) {
      finalReplacementStarted = true;
      await client.rmdir(safeRemoteDir, true);
    }
    await client.rename(tempRemoteDir, safeRemoteDir);
    finalReplaced = true;
    log(`Remote ${expectedRemoteDirLeaf} directory replaced.`);
  } finally {
    if (!finalReplaced) {
      if (finalReplacementStarted) {
        warn(
          `Temporary remote upload "${tempRemoteLeaf}" was left in place because final replacement did not complete.`
        );
      } else {
        await client.rmdir(tempRemoteDir, true).catch(() => undefined);
      }
    }
    await client.end().catch(() => undefined);
  }
}

function createRemoteUploadTempDir(remoteDir, expectedLeaf) {
  const parent = remoteDir.replace(/\/[^/]+$/, '');
  const tempLeaf = `${expectedLeaf}.upload-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  return `${parent}/${tempLeaf}`;
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

  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (response.ok) {
      log(`Public URL check: ${response.status} ${url}`);
      return;
    }
    warn(`Public URL check returned ${response.status}: ${url}`);
  } catch (error) {
    warn(`Public URL check failed: ${error.message}`);
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
