import { describe, it, expect } from 'vitest';
import { rankSources, type RagSource } from '../internet-rag.js';

const NOW = 1_700_000_000_000;

describe('rankSources', () => {
  it('returns empty array for empty input', () => {
    expect(rankSources([], 'transformer attention', NOW)).toEqual([]);
  });

  it('ranks by lexical overlap with query tokens', () => {
    const sources: RagSource[] = [
      { url: 'https://arxiv.org/a', title: 'Attention Is All You Need', domain: 'paper' },
      { url: 'https://blog.com/b', title: 'Random unrelated post', domain: 'blog' },
      { url: 'https://docs.com/c', title: 'Attention mechanism guide', domain: 'docs' },
    ];
    const ranked = rankSources(sources, 'attention mechanism', NOW);
    // "Attention mechanism guide" matches 2 tokens → should be #1 or #2 over "Attention Is All You Need" (1 token)
    expect(ranked[0]?.title).toBe('Attention mechanism guide');
    expect(ranked[ranked.length - 1]?.title).toBe('Random unrelated post');
  });

  it('uses domain tier as tie-breaker (paper > docs > blog)', () => {
    const sources: RagSource[] = [
      { url: 'https://blog.com/x', title: 'gradient descent overview', domain: 'blog' },
      { url: 'https://docs.com/y', title: 'gradient descent overview', domain: 'docs' },
      { url: 'https://arxiv.org/z', title: 'gradient descent overview', domain: 'paper' },
    ];
    const ranked = rankSources(sources, 'gradient descent overview', NOW);
    expect(ranked[0]?.domain).toBe('paper');
    expect(ranked[1]?.domain).toBe('docs');
    expect(ranked[2]?.domain).toBe('blog');
  });
});
