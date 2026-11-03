// #region Imports

import { describe, expect, it } from 'vitest';
import { mcpClientName, mcpLevelAllows } from './Mcp';

// #endregion

describe('mcpLevelAllows', () => {
    it.each([
        ['read', 'read', true],
        ['read', 'propose', false],
        ['read', 'write', false],
        ['propose', 'read', true],
        ['propose', 'propose', true],
        ['propose', 'write', false],
        ['write', 'read', true],
        ['write', 'propose', true],
        ['write', 'write', true]
    ] as const)('at %s, a tool that needs %s: %s', (level, needed, allowed) => {
        // act
        const result = mcpLevelAllows(level, needed);

        // assert
        expect(result).toBe(allowed);
    });
});

describe('mcpClientName', () => {
    it('names the clients it knows and leaves the others as they are', () => {
        // act and assert
        expect(mcpClientName('claude-code')).toBe('Claude Code');
        expect(mcpClientName('codex-mcp-client')).toBe('Codex');
        expect(mcpClientName('some editor')).toBe('some editor');
    });
});
