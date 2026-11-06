// #region Imports

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// #endregion

const revisionPattern = /^(?!0{40}$)[a-f0-9]{40}$/u;
const proseExtension = /\.(?:md|mdx|markdown|rst|adoc|asciidoc)$/iu;
const imageExtension = /\.(?:png|jpe?g|gif|webp|svg)$/iu;
const operationalPath =
  /(?:^|\/)(?:\.agents|\.claude|\.codex|\.opencode|\.vscode|\.design-sync|\.ds-sync|prompts?|skills?)(?:\/|$)/iu;

/**
 * Classifies the complete event diff before CI spends native runner or dependency-install time.
 * Unknown events and incomplete metadata require full verification; an unreadable diff fails the job.
 *
 * @param {{ eventName: string, event: object, forceVerification?: boolean }} context The trusted Actions event envelope.
 * @param {{ cwd?: string }} options The checked-out repository, with complete Git history.
 * @returns {{ documentationOnly: boolean, changedFiles: number, reason: string }} The explicit skip decision.
 */
export function classifyCiChanges(context, { cwd = process.cwd() } = {}) {
  const full = (reason) => ({ documentationOnly: false, changedFiles: 0, reason });
  if (context.forceVerification) return full('Explicit verification request.');

  const event = context.event;
  let base;
  let head;
  let mergeBase = false;

  switch (context.eventName) {
    case 'pull_request':
      base = event?.pull_request?.base?.sha;
      head = event?.pull_request?.head?.sha;
      mergeBase = true;
      break;
    case 'merge_group':
      base = event?.merge_group?.base_sha;
      head = event?.merge_group?.head_sha;
      break;
    case 'push':
      if (event?.forced === true) return full('Forced pushes require full verification.');
      base = event?.before;
      head = event?.after;
      break;
    default:
      return full('This event requires full verification.');
  }

  if (!revisionPattern.test(base ?? '') || !revisionPattern.test(head ?? '')) {
    return full('No complete event comparison is available.');
  }

  const git = (args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  if (mergeBase) base = git(['merge-base', base, head]).trim();

  // A rename must include its old and new paths: moving runtime code into docs is still a code change.
  const files = git([
    'diff',
    '--no-ext-diff',
    '--no-renames',
    '--name-only',
    '-z',
    base,
    head,
    '--',
  ])
    .split('\0')
    .filter(Boolean);

  if (files.length === 0) return full('No changed files were found.');

  const documentationOnly = files.every(isDocumentation);
  return {
    documentationOnly,
    changedFiles: files.length,
    reason: documentationOnly
      ? 'Only documentation changed.'
      : 'Changes require full verification.',
  };
}

function isDocumentation(path) {
  // Skills, prompts and agent instructions affect execution even when their format is Markdown.
  if (
    operationalPath.test(path) ||
    /(?:^|\/)(?:AGENTS|CLAUDE|CODEX|GEMINI|SKILL)\.md$/iu.test(path)
  )
    return false;
  if (/(?:^|\/)\.github(?:\/|$)/iu.test(path)) {
    return path.startsWith('.github/assets/') && imageExtension.test(path);
  }

  return (
    proseExtension.test(path) ||
    /^(?:LICENSE|NOTICE|COPYING)(?:\.txt)?$/u.test(path) ||
    (path.startsWith('docs/') && /\.txt$/iu.test(path)) ||
    /(?:^|\/)README[^/]*\.txt$/iu.test(path) ||
    (path.startsWith('docs/') && imageExtension.test(path))
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = classifyCiChanges({
      eventName: process.env.GITHUB_EVENT_NAME,
      event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
      forceVerification: process.env.FORCE_VERIFICATION === 'true',
    });
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `documentation_only=${result.documentationOnly}\n`);
    }
    console.log(`${result.reason} Compared ${result.changedFiles} changed path(s).`);
  } catch {
    console.error('Could not classify the complete event diff; verification cannot be skipped.');
    process.exitCode = 1;
  }
}
