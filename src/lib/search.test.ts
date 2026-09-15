import { describe, expect, it } from 'vitest';
import { matchesGameTitle } from './search';

describe('matchesGameTitle', () => {
    it.each([
        ['Code Quest', 'code', true],
        ['The Puzzle Forge', 'PUZZLE', true],
        ['Strategy Studio', 'studio', true],
        ['Code Quest', 'adventure', false],
        ['Code Quest', '  ', true],
        ['Code Quest', '', true],
    ])('matches %j against %j as %j', (title, query, expected) => {
        expect(matchesGameTitle(title, query)).toBe(expected);
    });
});
