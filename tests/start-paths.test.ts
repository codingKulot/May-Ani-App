import { describe, expect, test } from 'bun:test';
import { START_PATHS, startPath } from '@/data/startPaths';

describe('Learning Center "Start here" paths', () => {
  test('ids are unique and findable', () => {
    const ids = START_PATHS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(startPath(id)?.id).toBe(id);
    expect(startPath('nope')).toBeUndefined();
  });

  test('every path has steps, a checklist, mistakes, help, reading and videos', () => {
    for (const p of START_PATHS) {
      expect(p.steps.length).toBeGreaterThanOrEqual(5);
      expect(p.before.length).toBeGreaterThan(0);
      expect(p.mistakes.length).toBeGreaterThan(0);
      expect(p.help.length).toBeGreaterThan(0);
      expect(p.read.length).toBeGreaterThan(0);
      expect(p.watch.length).toBeGreaterThan(0);
      for (const s of p.steps) expect(s.title && s.body).toBeTruthy();
    }
  });

  test('links are https, name their publisher, and videos point to YouTube', () => {
    for (const p of START_PATHS) {
      for (const l of [...p.read, ...p.watch]) {
        expect(l.url.startsWith('https://')).toBe(true);
        expect(l.source.length).toBeGreaterThan(0);
      }
      for (const v of p.watch) expect(new URL(v.url).hostname).toBe('www.youtube.com');
      // each path links at least one official (government or public research) source
      expect([...p.read, ...p.watch].some((l) => l.official)).toBe(true);
    }
  });
});
