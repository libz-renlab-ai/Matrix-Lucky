import { describe, it, expect } from 'vitest';
import { extractTaste, type CommitFingerprint } from '../commit-taste.js';

describe('extractTaste', () => {
  it('returns empty results for empty commit list', () => {
    const result = extractTaste([]);
    expect(result.topPaths).toEqual([]);
    expect(result.styleHints).toEqual([]);
  });

  it('identifies top-touched paths by frequency', () => {
    const commits: CommitFingerprint[] = [
      { author: 'alice', subject: 'feat: add scorer', files: ['packages/core/scorer.ts', 'packages/core/index.ts'] },
      { author: 'bob',   subject: 'fix: scorer edge case', files: ['packages/core/scorer.ts'] },
      { author: 'alice', subject: 'feat: add matcher', files: ['packages/core/matcher.ts'] },
      { author: 'bob',   subject: 'fix: matcher crash',   files: ['packages/core/scorer.ts', 'packages/core/matcher.ts'] },
    ];
    const { topPaths } = extractTaste(commits);
    expect(topPaths[0]).toBe('packages/core/scorer.ts');   // 3 hits
    expect(topPaths).toContain('packages/core/matcher.ts');
  });

  it('detects conventional-commits style hint when both feat and fix prefixes are present', () => {
    const commits: CommitFingerprint[] = [
      { author: 'dev', subject: 'feat: add internet rag', files: ['src/rag.ts'] },
      { author: 'dev', subject: 'fix: typo in readme',    files: ['README.md'] },
    ];
    const { styleHints } = extractTaste(commits);
    expect(styleHints).toContain('conventional-commits');
  });

  it('does NOT add conventional-commits hint if only feat (no fix) present', () => {
    const commits: CommitFingerprint[] = [
      { author: 'dev', subject: 'feat: initial', files: ['src/index.ts'] },
    ];
    const { styleHints } = extractTaste(commits);
    expect(styleHints).not.toContain('conventional-commits');
  });
});
