// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { confirmContinue, existingSalonLines } from './existing';

describe('existingSalonLines', () => {
  it("shows the stored salon's name and domains before anything is written", () => {
    const lines = existingSalonLines('sara', { name: 'Sara Beauty', domains: ['sara-salon.com', 'rdv.sara.com'] }, { slug: 'sara', reapply: false });
    expect(lines[0]).toBe('Salon "sara" already exists: "Sara Beauty", domains: sara-salon.com, rdv.sara.com.');
    expect(lines.join('\n')).toMatch(/salons\/sara\.json, stop now/);
    expect(lines.join('\n')).toMatch(/keep the owner's edits/);
  });

  it('says when the salon has no domain, and what --reapply-settings overwrites', () => {
    const lines = existingSalonLines('sara', { name: 'Sara', domains: [] }, { slug: 'sara', reapply: true });
    expect(lines[0]).toMatch(/domains: none\.$/);
    expect(lines.join('\n')).toMatch(/overwritten with salons\/sara\.json: hours/);
  });
});

describe('confirmContinue', () => {
  it('continues without asking with --yes', async () => {
    const ask = vi.fn();
    expect(await confirmContinue({ yes: true }, { interactive: false, ask })).toBe('continue');
    expect(ask).not.toHaveBeenCalled();
  });

  it('needs --yes when nobody can answer', async () => {
    const ask = vi.fn();
    expect(await confirmContinue({ yes: false }, { interactive: false, ask })).toBe('needs-yes');
    expect(ask).not.toHaveBeenCalled();
  });

  it('continues only on y/yes; anything else (including Enter) stops', async () => {
    for (const [answer, result] of [['y', 'continue'], [' YES ', 'continue'], ['', 'stopped'], ['n', 'stopped'], ['oui', 'stopped']]) {
      expect(await confirmContinue({ yes: false }, { interactive: true, ask: async () => answer })).toBe(result);
    }
  });
});
