// #region Imports

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyCiChanges } from './classifyCiChanges.mjs';

// #endregion

const root = fileURLToPath(new URL('../../', import.meta.url));

function fixture(t) {
  mkdirSync(resolve(root, '.codex-work'), { recursive: true });
  const cwd = mkdtempSync(resolve(root, '.codex-work/ci-changes-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'CI fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  const write = (path, content = 'fixture\n') => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  const commit = () => {
    git('add', '--all');
    git('commit', '--quiet', '--allow-empty', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  write('README.md');
  const initial = commit();
  const push = (before, after) =>
    classifyCiChanges({ eventName: 'push', event: { before, after } }, { cwd });
  return { cwd, git, write, commit, initial, push };
}

test('skips prose, README text, root notices and documentation artwork without installing dependencies', (t) => {
  // Arrange
  const repository = fixture(t);
  const files = [
    'README.md',
    'CONTRIBUTING.md',
    'docs/guide.mdx',
    'docs/reference.rst',
    'docs/help.adoc',
    'docs/long-form.asciidoc',
    'docs/explanation.markdown',
    'docs/notes.txt',
    'packages/demo/README-install.txt',
    'docs/uppercase.TXT',
    'packages/demo/README-UPPER.TXT',
    'plugins/example/README.md',
    'libs/backend/mcp/plugins/codex/README.md',
    'LICENSE',
    'NOTICE.txt',
    'COPYING',
    'docs/images/example.svg',
    '.github/assets/wortlaut-hero.png',
    'docs/screen with spaces.webp',
  ];
  files.forEach((path) => repository.write(path, 'documentation update\n'));
  const after = repository.commit();

  // Act
  const result = repository.push(repository.initial, after);

  // Assert
  assert.equal(result.documentationOnly, true);
  assert.equal(result.changedFiles, files.length);
});

test(
  'preserves a newline inside a documentation path',
  {
    skip: process.platform === 'win32' && 'Windows file names cannot contain newlines.',
  },
  (t) => {
    // Arrange
    const repository = fixture(t);
    repository.write('docs/screen with\na newline.webp');
    const after = repository.commit();

    // Act
    const result = repository.push(repository.initial, after);

    // Assert
    assert.equal(result.documentationOnly, true);
    assert.equal(result.changedFiles, 1);
  },
);

test('runs full verification for runtime, workflow, configuration and operational Markdown changes', (t) => {
  const repository = fixture(t);
  const paths = [
    'src/runtime.ts',
    '.github/workflows/ci.yml',
    'package.json',
    'docs/example.mjs',
    'docs/example.html',
    'apps/desktop/assets/icons/wortlaut.png',
    'src/template.txt',
    'AGENTS.md',
    'docs/SKILL.md',
    'CLAUDE.md',
    'CODEX.md',
    'GEMINI.md',
    'packages/example/claude.md',
    '.agents/skills/project/SKILL.md',
    '.claude/commands/explain.md',
    '.codex/instructions.md',
    '.opencode/rules.md',
    '.github/instructions/testing.md',
    '.vscode/notes.md',
    '.design-sync/NOTES.md',
    'docs/.ds-sync/NOTES.md',
    'packages/demo/.agents/instructions.md',
    'docs/prompt/example.md',
    'docs/skill/README.md',
    'packages/.github/config.md',
    'docs/.vscode/notes.md',
    '.github/assets/notes.md',
    '.github/assets/example.txt',
    '.github/assets/script.js',
    'libs/backend/ai/prompts/translate.md',
    'libs/backend/mcp/plugins/codex/skills/wortlaut/README.md',
  ];
  for (const path of paths) {
    // Arrange
    const before = repository.git('rev-parse', 'HEAD');
    repository.write('README.md', `Mixed change with ${path}\n`);
    repository.write(path);
    const after = repository.commit();

    // Act
    const result = repository.push(before, after);

    // Assert
    assert.equal(result.documentationOnly, false, path);
  }
});

test('examines the complete push rather than only its last documentation commit', (t) => {
  // Arrange
  const repository = fixture(t);
  repository.write('src/runtime.ts');
  repository.commit();
  repository.write('README.md', 'Updated docs after code.\n');
  const after = repository.commit();

  // Act
  const result = repository.push(repository.initial, after);

  // Assert
  assert.equal(result.documentationOnly, false);
  assert.equal(result.changedFiles, 2);
});

test('compares pull requests from their merge base without attributing unrelated base-branch code', (t) => {
  // Arrange
  const repository = fixture(t);
  repository.write('README.md', 'PR documentation.\n');
  const head = repository.commit();
  repository.git('reset', '--hard', repository.initial);
  repository.write('src/unrelated.ts');
  const base = repository.commit();

  // Act
  const result = classifyCiChanges(
    {
      eventName: 'pull_request',
      event: { pull_request: { base: { sha: base }, head: { sha: head } } },
    },
    repository,
  );

  // Assert
  assert.equal(result.documentationOnly, true);
  assert.equal(result.changedFiles, 1);
});

test('compares the complete merge-group base and head', (t) => {
  // Arrange
  const repository = fixture(t);
  repository.write('docs/guide.md');
  const head = repository.commit();

  // Act
  const result = classifyCiChanges(
    {
      eventName: 'merge_group',
      event: { merge_group: { base_sha: repository.initial, head_sha: head } },
    },
    repository,
  );

  // Assert
  assert.equal(result.documentationOnly, true);
});

test('counts both rename paths so code moved into documentation still verifies', (t) => {
  // Arrange
  const repository = fixture(t);
  repository.write('src/runtime.ts');
  const before = repository.commit();
  mkdirSync(join(repository.cwd, 'docs'), { recursive: true });
  renameSync(join(repository.cwd, 'src/runtime.ts'), join(repository.cwd, 'docs/runtime.md'));
  const after = repository.commit();

  // Act
  const result = repository.push(before, after);

  // Assert
  assert.equal(result.documentationOnly, false);
  assert.equal(result.changedFiles, 2);
});

test('accepts a documentation deletion while refusing empty or incomplete comparisons', (t) => {
  const repository = fixture(t);
  rmSync(join(repository.cwd, 'README.md'));
  const deleted = repository.commit();
  assert.equal(repository.push(repository.initial, deleted).documentationOnly, true);
  assert.equal(repository.push(deleted, deleted).documentationOnly, false);
  assert.equal(repository.push('0'.repeat(40), deleted).documentationOnly, false);
  assert.equal(repository.push('--all', deleted).documentationOnly, false);
  assert.equal(
    classifyCiChanges({ eventName: 'pull_request', event: {} }, repository).documentationOnly,
    false,
  );
});

test('always verifies manual, reusable and unknown event requests', () => {
  // Arrange
  const contexts = [
    { eventName: 'workflow_dispatch', event: {} },
    { eventName: 'workflow_call', event: {} },
    { eventName: 'unknown', event: {} },
    { eventName: 'push', event: {}, forceVerification: true },
  ];

  for (const context of contexts) {
    // Act
    const result = classifyCiChanges(context, { cwd: '/not-a-checkout' });

    // Assert
    assert.equal(result.documentationOnly, false);
  }
});

test('always verifies forced pushes without reading their removed history', (t) => {
  // Arrange
  const repository = fixture(t);

  // Act
  const result = classifyCiChanges(
    {
      eventName: 'push',
      event: { forced: true, before: 'f'.repeat(40), after: repository.initial },
    },
    repository,
  );

  // Assert
  assert.equal(result.documentationOnly, false);
  assert.equal(result.changedFiles, 0);
});

test('fails classification when a valid-looking comparison is unavailable locally', (t) => {
  const repository = fixture(t);
  assert.throws(() => repository.push('f'.repeat(40), repository.initial));
});

test('the actual Quality Gate requires successful matrix checks for code and documentation', () => {
  // Arrange
  const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const gate = workflow.slice(workflow.indexOf('\n  quality-gate:'));
  const script = gate
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^          /u, ''))
    .join('\n');
  assert.ok(script.includes('case '));

  for (const changes of ['success', 'failure', 'cancelled', 'skipped']) {
    for (const documentation of ['true', 'false', '']) {
      for (const verify of ['success', 'failure', 'cancelled', 'skipped']) {
        // Act
        const result = spawnSync('bash', ['-e', '-c', script], {
          encoding: 'utf8',
          env: {
            ...process.env,
            CHANGES_RESULT: changes,
            DOCUMENTATION_ONLY: documentation,
            VERIFY_RESULT: verify,
          },
        });

        // Assert
        const allowed =
          changes === 'success' &&
          ['true', 'false'].includes(documentation) &&
          verify === 'success';
        assert.equal(result.status === 0, allowed, `${changes}:${documentation}:${verify}`);
      }
    }
  }
});

test('documentation keeps every platform check while running only an explanation on Ubuntu', () => {
  // Arrange
  const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const verify = workflow.slice(
    workflow.indexOf('\n  verify:'),
    workflow.indexOf('\n  quality-gate:'),
  );
  const job = verify.split('    steps:')[0];
  assert.doesNotMatch(job, /^    if:/mu);
  assert.match(job, /^    name: Build and exercise desktop \(\$\{\{ matrix.os \}\}\)$/mu);
  assert.match(job, /os: \[ubuntu-latest, macos-latest, windows-latest\]/u);
  const runnerExpression = job.match(/^    runs-on: \$\{\{ (.+) \}\}$/mu)?.[1];
  assert.ok(runnerExpression);
  const runnerFor = new Function('needs', 'matrix', `return ${runnerExpression};`);
  const decision = (documentationOnly) => ({
    changes: { outputs: { documentation_only: documentationOnly } },
  });
  const steps = verify
    .split('    steps:\n')[1]
    .split(/^      - /mu)
    .filter((step) => step.trim());

  // Act / Assert: documentation spends no native runner and enables no checkout, install or test step.
  for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    assert.equal(runnerFor(decision('true'), { os }), 'ubuntu-latest');
    assert.equal(runnerFor(decision('false'), { os }), os);
  }
  let explanations = 0;
  for (const step of steps) {
    const condition = step.match(/^        if: (.+)$/mu)?.[1];
    assert.ok(condition, `Unguarded matrix step: ${step.split('\n')[0]}`);
    const expression = condition.replace(/^\$\{\{ (.+) \}\}$/u, '$1');
    const enabled = new Function(
      'needs',
      'runner',
      'cancelled',
      'always',
      `return Boolean(${expression});`,
    );
    if (
      enabled(
        decision('true'),
        { os: 'Linux' },
        () => false,
        () => true,
      )
    ) {
      explanations++;
      assert.match(step, /^        run: echo /mu);
      assert.doesNotMatch(step, /(?:uses:|yarn |node |corepack )/u);
      assert.equal(
        enabled(
          decision('false'),
          { os: 'Linux' },
          () => false,
          () => true,
        ),
        false,
      );
    }
  }
  assert.equal(explanations, 1);
});

test('release preparation consumes the classification while explicit reusable calls force verification', () => {
  // Arrange
  const workflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8');
  const configure = workflow.slice(
    workflow.indexOf('\n  configure:'),
    workflow.indexOf('\n  build:'),
  );
  const condition = configure.match(/^    if: (.+)$/mu)?.[1];
  assert.ok(condition);
  assert.match(configure, /^    needs: changes$/mu);
  const shouldPrepare = new Function('github', 'inputs', 'needs', `return Boolean(${condition});`);
  const github = { repository_id: '1444820071', ref: 'refs/heads/main' };
  const decision = (documentationOnly) => ({
    changes: { outputs: { documentation_only: documentationOnly } },
  });

  // Act / Assert: the production expression must require an explicit full-verification classification.
  assert.equal(shouldPrepare(github, {}, decision('true')), false);
  assert.equal(shouldPrepare(github, {}, decision('')), false);
  assert.equal(shouldPrepare(github, {}, decision('false')), true);
  assert.equal(shouldPrepare({ ...github, repository_id: 'other' }, {}, decision('false')), false);
  assert.equal(shouldPrepare({ ...github, ref: 'refs/heads/dev' }, {}, decision('false')), false);
  assert.equal(
    shouldPrepare({ ...github, ref: 'refs/heads/dev' }, { rehearsal: true }, decision('false')),
    true,
  );

  const input = workflow.slice(
    workflow.indexOf('      force_verification:'),
    workflow.indexOf('      rehearsal:'),
  );
  assert.match(input, /^        default: true$/mu);
  assert.match(input, /^        type: boolean$/mu);
  const forceExpression = workflow.match(/FORCE_VERIFICATION: \$\{\{ (.+) \}\}/u)?.[1];
  assert.ok(forceExpression);
  const shouldForce = new Function('inputs', `return Boolean(${forceExpression});`);
  assert.equal(shouldForce({}), false);
  assert.equal(shouldForce({ force_verification: true }), true);
  assert.equal(shouldForce({ rehearsal: true }), true);

  // Downstream jobs retain GitHub's default success condition, so skipped preparation cannot publish.
  const build = workflow.slice(
    workflow.indexOf('\n  build:'),
    workflow.indexOf('\n  rehearse-publication:'),
  );
  assert.match(build, /^    needs: configure$/mu);
  const publish = workflow.slice(
    workflow.indexOf('\n  publish:'),
    workflow.indexOf('\n  refresh-dependabot:'),
  );
  assert.match(publish, /^    needs: \[configure, build\]$/mu);
  assert.doesNotMatch(publish.split('    steps:')[0], /(?:always|!cancelled)\(\)/u);
});

test('the Actions CLI publishes an explicit decision and fails without publishing a skip on Git errors', (t) => {
  // Arrange
  const repository = fixture(t);
  repository.write('README.md', 'CLI docs.\n');
  const after = repository.commit();
  const eventPath = join(repository.cwd, 'event.json');
  const outputPath = join(repository.cwd, 'output.txt');
  const cli = join(root, '.github/scripts/classifyCiChanges.mjs');
  writeFileSync(eventPath, JSON.stringify({ before: repository.initial, after }));
  const env = {
    ...process.env,
    GITHUB_EVENT_NAME: 'push',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: outputPath,
    FORCE_VERIFICATION: 'false',
  };

  // Act
  const result = spawnSync(process.execPath, [cli], { cwd: repository.cwd, env, encoding: 'utf8' });

  // Assert
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(outputPath, 'utf8'), 'documentation_only=true\n');

  writeFileSync(outputPath, '');
  writeFileSync(eventPath, JSON.stringify({ before: 'f'.repeat(40), after }));
  const failure = spawnSync(process.execPath, [cli], {
    cwd: repository.cwd,
    env,
    encoding: 'utf8',
  });
  assert.equal(failure.status, 1);
  assert.equal(readFileSync(outputPath, 'utf8'), '');
});
