// #region Imports
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// #endregion

function authorizationJob() {
    const lines = readFileSync('.github/workflows/dependabot-auto-merge.yml', 'utf8').split('\n');
    const start = lines.findIndex((line) => (/^ +authorize:\s*$/u).test(line));
    assert.ok(start >= 0);
    const indent = lines[start].length - lines[start].trimStart().length;
    const sibling = new RegExp(`^ {${indent}}[A-Za-z0-9_-]+:\\s*$`, 'u');
    const end = lines.findIndex((line, index) => index > start && sibling.test(line));
    return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

test('orders isolated current native authorization after branch reconciliation even when reconciliation retains blockers', () => {
    // Arrange
    // Act
    const job = authorizationJob();
    // Assert
    assert.match(job, /^\s+needs: reconcile\s*$/mu);
    assert.match(job, /always\(\)/u);
    assert.match(job, /github\.ref == 'refs\/heads\/main'/u);
    assert.doesNotMatch(job, /workflow_run\.(?:conclusion|event)/u);
});

test('retains read-only source/PR scopes and excludes dependency or PR-artifact execution from authorization', () => {
    // Arrange
    // Act
    const job = authorizationJob();
    // Assert
    assert.match(job, /^\s+contents: read\s*$/mu);
    assert.match(job, /^\s+pull-requests: read\s*$/mu);
    assert.match(job, /^\s+actions: write\s*$/mu);
    assert.match(job, /ref:\s*\$\{\{\s*github\.event\.repository\.default_branch\s*\}\}/u);
    assert.match(job, /persist-credentials: false/u);
    assert.match(job, /package-manager-cache: false/u);
    assert.doesNotMatch(job, /^\s+(?:contents|pull-requests): write\s*$/mu);
    assert.doesNotMatch(job, /\b(?:yarn install|npm ci|npm install|pnpm install)\b|actions\/download-artifact/u);
});
