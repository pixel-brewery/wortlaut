// #region Imports
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { readCurrentMergedDependabot } from './readCurrentMergedDependabot.mjs';
import { verificationPolicy } from './verificationPolicy.mjs';
// #endregion

const source = 'a'.repeat(40);
const head = 'b'.repeat(40);
const prefix = 'repos/pixel-brewery/wortlaut';
const context = {
    eventName: 'schedule',
    repository: 'pixel-brewery/wortlaut',
    repositoryId: 1444820071,
    defaultBranch: 'main'
};

function controlled() {
    const repo = {
        id: 1444820071,
        name: 'wortlaut',
        full_name: 'pixel-brewery/wortlaut',
        private: false,
        fork: false,
        visibility: 'public',
        default_branch: 'main'
    };
    const pull = {
        number: 7,
        state: 'closed',
        draft: false,
        merged: true,
        merged_at: '2026-11-26T11:31:31Z',
        merge_commit_sha: source,
        user: { id: 49699333,
            login: 'dependabot[bot]',
            type: 'Bot' },
        base: { ref: 'main',
            repo },
        head: { sha: head,
            ref: 'dependabot/npm_and_yarn/frameworks',
            repo }
    };
    const state = {
        repo,
        pull,
        full: undefined,
        associations: undefined,
        main: source,
        nextMain: source,
        protected: true
    };
    let reads = 0;
    const request = ((implementation) => Object.assign(mock.fn(implementation), { originalImplementation: implementation }))(
        (method, path) => {
            if (method !== 'GET') throw new Error('Read-only recovery attempted a write.');
            if (path === 'repositories/1444820071') return state.repo;
            if (path === `${prefix}/branches/main`) return { name: 'main',
                commit: { sha: ++reads === 1 ? state.main : state.nextMain } };
            if (path === `${prefix}/commits/${source}/pulls?per_page=100`) return state.associations ?? [{ ...state.pull,
                merged: undefined }];
            if (path === `${prefix}/pulls/7`) return state.full ?? state.pull;
            if (path === `${prefix}/rules/branches/main`) return state.protected
                ? [
                    { type: 'pull_request' },
                    {
                        type: 'required_status_checks',
                        parameters: {
                            strict_required_status_checks_policy: true,
                            required_status_checks: verificationPolicy.requiredChecks.map((context) => ({
                                context,
                                integration_id: 15368
                            }))
                        }
                    }
                ]
                : [];
            throw new Error('Unexpected recovery metadata route.');
        }
    );
    return { state,
        request };
}

describe('Current merged dependency recovery', () => {
    it('binds a simple REST association to the separately confirmed actual current merge', async() => {
    // Arrange
        const fixture = controlled();
        // Act
        const result = await readCurrentMergedDependabot(context, fixture);
        // Assert
        assert.deepEqual(result, { number: 7,
            sha: source });
        assert.equal(
            fixture.request.mock.calls
                .map((call) => call.arguments)
                .every(([method]) => method === 'GET'),
            true
        );
        assert.equal(
            fixture.request.mock.calls
                .map((call) => call.arguments)
                .some(([, path]) => path.includes('state=closed')),
            false
        );
    });

    for (const [_label, change] of [
        [
            'unmerged full PR',
            (s) => {
                s.full = { ...s.pull,
                    merged: false };
            }
        ],
        [
            'another full PR number',
            (s) => {
                s.full = { ...s.pull,
                    number: 8 };
            }
        ],
        [
            'spoofed bot ID',
            (s) => {
                s.pull.user.id = 1;
            }
        ],
        [
            'human source PR',
            (s) => {
                s.pull.user = { id: 1,
                    login: 'maintainer',
                    type: 'User' };
            }
        ],
        [
            'draft',
            (s) => {
                s.pull.draft = true;
            }
        ],
        [
            'open PR',
            (s) => {
                s.pull.state = 'open';
            }
        ],
        [
            'another integration branch',
            (s) => {
                s.pull.base.ref = 'dev';
            }
        ],
        [
            'another repository',
            (s) => {
                s.pull.head.repo = { ...s.repo,
                    id: 1 };
            }
        ],
        [
            'old source',
            (s) => {
                s.pull.merge_commit_sha = head;
            }
        ],
        [
            'malformed merge date',
            (s) => {
                s.pull.merged_at = 'unknown';
            }
        ],
        [
            'source moves before dispatch',
            (s) => {
                s.nextMain = head;
            }
        ],
        [
            'no protection',
            (s) => {
                s.protected = false;
            }
        ],
        [
            'ambiguous association',
            (s) => {
                s.associations = [
                    { ...s.pull,
                        merged: undefined },
                    { ...s.pull,
                        number: 8,
                        merged: undefined }
                ];
            }
        ]
    ]) {
        it('retains no automatic continuation for ' + _label + '', async() => {
            // Arrange
            const fixture = controlled();
            change(fixture.state);
            // Act
            const result = await readCurrentMergedDependabot(context, fixture);
            // Assert
            assert.equal(result, undefined);
            assert.equal(
                fixture.request.mock.calls
                    .map((call) => call.arguments)
                    .every(([method]) => method === 'GET'),
                true
            );
        });
    }
});
