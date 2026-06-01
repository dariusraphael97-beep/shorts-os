import { describe, it, expect } from 'vitest';
import { scoreDescriptionSeo, scoreHookFromTranscript } from '@/lib/agents/review/components';

// ---------------------------------------------------------------------------
// scoreDescriptionSeo
// ---------------------------------------------------------------------------
describe('scoreDescriptionSeo', () => {
  const keywords = ['history', 'vienna', 'archive', 'revolution'];

  it('description with 3 of 4 keywords scores strictly higher than same-length description with 0 of 4', () => {
    const richDesc =
      'This video dives into the history of vienna, drawing on archive footage and documents. ' +
      'A compelling look at the events that shaped the city over decades of change and transformation.';
    const flatDesc =
      'This video explores fascinating topics from around the world. ' +
      'A compelling look at the events that shaped society over decades of change and remarkable transformation found everywhere.';

    const rich = scoreDescriptionSeo({ description: richDesc, nicheKeywords: keywords });
    const flat = scoreDescriptionSeo({ description: flatDesc, nicheKeywords: keywords });

    expect(rich.score).toBeGreaterThan(flat.score);
  });

  it('empty description scores low and verdict is fail', () => {
    const result = scoreDescriptionSeo({ description: '', nicheKeywords: keywords });
    expect(result.score).toBeLessThan(0.3);
    expect(result.verdict).toBe('fail');
  });

  it('empty description is never verdict pass', () => {
    const result = scoreDescriptionSeo({ description: '', nicheKeywords: keywords });
    expect(result.verdict).not.toBe('pass');
  });

  it('very short description (< 50 chars) is penalized relative to healthy-length description', () => {
    const shortDesc = 'Check this out!';
    const goodDesc =
      'This video covers the history and archive records of vienna during the revolution period. ' +
      'A fascinating dive into the documents and events of the era with detailed analysis.';

    const short = scoreDescriptionSeo({ description: shortDesc, nicheKeywords: keywords });
    const good = scoreDescriptionSeo({ description: goodDesc, nicheKeywords: keywords });

    expect(good.score).toBeGreaterThan(short.score);
  });

  it('description hitting all keywords in healthy length band returns pass', () => {
    const desc =
      'This deep-dive covers the history of vienna and the revolution, with rare archive footage ' +
      'and primary source documents brought back to life in this comprehensive exploration.';
    const result = scoreDescriptionSeo({ description: desc, nicheKeywords: keywords });
    expect(result.verdict).toBe('pass');
  });

  it('returns ComponentScore shape with score in [0, 1]', () => {
    const result = scoreDescriptionSeo({
      description: 'Short but passable description text here.',
      nicheKeywords: ['history'],
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(['pass', 'needs_work', 'fail']).toContain(result.verdict);
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it('suggestions array is populated with missing keyword suggestion when keywords are absent', () => {
    const result = scoreDescriptionSeo({
      description:
        'This video is about something entirely different with no matching keywords at all in this longer text.',
      nicheKeywords: ['history', 'vienna', 'archive'],
    });
    expect(result.suggestions.length).toBeGreaterThan(0);
    const kw = result.suggestions.find((s) => s.component === 'description_seo');
    expect(kw).toBeDefined();
  });

  it('suggestions include lengthen suggestion when description is too short', () => {
    const result = scoreDescriptionSeo({ description: 'Too short.', nicheKeywords: [] });
    const lengthenSuggestion = result.suggestions.find((s) =>
      s.suggestion_text.toLowerCase().includes('lengthen') ||
      s.suggestion_text.toLowerCase().includes('longer') ||
      s.suggestion_text.toLowerCase().includes('description')
    );
    expect(lengthenSuggestion).toBeDefined();
  });

  it('all suggestions have component === description_seo', () => {
    const result = scoreDescriptionSeo({ description: '', nicheKeywords: ['history', 'vienna'] });
    for (const s of result.suggestions) {
      expect(s.component).toBe('description_seo');
    }
  });
});

// ---------------------------------------------------------------------------
// scoreHookFromTranscript
// ---------------------------------------------------------------------------
describe('scoreHookFromTranscript', () => {
  it('empty hook returns verdict fail', () => {
    const result = scoreHookFromTranscript({ firstThreeSecondsText: '' });
    expect(result.verdict).toBe('fail');
  });

  it('whitespace-only hook returns verdict fail', () => {
    const result = scoreHookFromTranscript({ firstThreeSecondsText: '   \t\n  ' });
    expect(result.verdict).toBe('fail');
  });

  it('hook rich in cue words scores strictly higher than flat cue-less hook of similar length', () => {
    const richHook = "You won't believe what happened here. Stop and watch this — here's why it matters.";
    const flatHook = 'Today we are going to look at something that occurred in the past in this country area.';

    const rich = scoreHookFromTranscript({ firstThreeSecondsText: richHook });
    const flat = scoreHookFromTranscript({ firstThreeSecondsText: flatHook });

    expect(rich.score).toBeGreaterThan(flat.score);
  });

  it('hook with many cue words returns verdict pass', () => {
    const hook = "Did you know the secret behind this? Wait — you won't believe what happened. Imagine if you never knew this.";
    const result = scoreHookFromTranscript({ firstThreeSecondsText: hook });
    expect(result.verdict).toBe('pass');
  });

  it('returns ComponentScore shape with score in [0, 1]', () => {
    const result = scoreHookFromTranscript({ firstThreeSecondsText: 'Here is a hook.' });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(['pass', 'needs_work', 'fail']).toContain(result.verdict);
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  it('weak hook suggestions have component === hook', () => {
    const result = scoreHookFromTranscript({ firstThreeSecondsText: 'Hello everyone today.' });
    for (const s of result.suggestions) {
      expect(s.component).toBe('hook');
    }
  });

  it('weak hook populates suggestions with curiosity-gap advice', () => {
    const result = scoreHookFromTranscript({ firstThreeSecondsText: 'Today we will look at this topic.' });
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('a leading question mark triggers a cue hit', () => {
    // A hook that starts with "?" — unlikely in practice but the cue should fire
    const result = scoreHookFromTranscript({ firstThreeSecondsText: 'What if everything you knew was wrong?' });
    const noQ = scoreHookFromTranscript({ firstThreeSecondsText: 'Everything you knew is not wrong at all here.' });
    expect(result.score).toBeGreaterThan(noQ.score);
  });

  it('a leading number/stat triggers a cue hit', () => {
    const statHook = scoreHookFromTranscript({ firstThreeSecondsText: '5 things you need to know about this topic right now today.' });
    const noStatHook = scoreHookFromTranscript({ firstThreeSecondsText: 'The things you need to know about this topic right now today.' });
    expect(statHook.score).toBeGreaterThan(noStatHook.score);
  });
});
