import { describe, it, expect } from 'vitest';
import { scoreTechChoice, rankTechChoices, type TechChoice } from '../tech-taste.js';

const DAYJS: TechChoice = {
  name: 'dayjs',
  strengths: ['lightweight', 'immutable', 'timezone'],
  weaknesses: ['legacy', 'large-bundle'],
};

const MOMENT: TechChoice = {
  name: 'moment',
  strengths: ['legacy', 'mature', 'locale'],
  weaknesses: ['large-bundle', 'mutable'],
};

describe('scoreTechChoice', () => {
  it('returns 0 for empty context', () => {
    expect(scoreTechChoice(DAYJS, '')).toBe(0);
  });

  it('increases score for matching strength tokens', () => {
    const score = scoreTechChoice(DAYJS, 'lightweight timezone picker');
    expect(score).toBeGreaterThan(0);
  });

  it('decreases score for matching weakness tokens', () => {
    const score = scoreTechChoice(DAYJS, 'large-bundle legacy project');
    expect(score).toBeLessThan(0);
  });

  it('moment scores higher than dayjs for legacy large-bundle context', () => {
    const ctx = 'legacy mature locale i18n';
    expect(scoreTechChoice(MOMENT, ctx)).toBeGreaterThan(scoreTechChoice(DAYJS, ctx));
  });
});

describe('rankTechChoices', () => {
  it('returns empty array for empty input', () => {
    expect(rankTechChoices([], 'lightweight')).toEqual([]);
  });

  it('ranks dayjs first for lightweight immutable context', () => {
    const ranked = rankTechChoices([MOMENT, DAYJS], 'lightweight immutable dates');
    expect(ranked[0]!.name).toBe('dayjs');
  });

  it('ranks moment first for legacy locale context', () => {
    const ranked = rankTechChoices([DAYJS, MOMENT], 'legacy locale mature');
    expect(ranked[0]!.name).toBe('moment');
  });

  it('preserves original order on tie (score 0 vs 0)', () => {
    const a: TechChoice = { name: 'a', strengths: ['foo'], weaknesses: [] };
    const b: TechChoice = { name: 'b', strengths: ['bar'], weaknesses: [] };
    const ranked = rankTechChoices([a, b], 'unrelated context xyz');
    expect(ranked[0]!.name).toBe('a');
    expect(ranked[1]!.name).toBe('b');
  });
});
