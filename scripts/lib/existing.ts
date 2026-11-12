/**
 * What `pnpm new-salon` shows and asks before it writes anything to a salon id that already
 * exists: a typo or a copied file could otherwise overwrite another salon's branding and domains.
 * Pure except for the prompt it is given.
 */

/** The salon currently stored under the id, as read from the database. */
export interface CurrentSalon {
  name: string;
  domains: string[];
}

/** The lines printed about an existing salon: what it is now, and what this run will change. */
export function existingSalonLines(id: string, current: CurrentSalon, { slug, reapply }: { slug: string; reapply: boolean }): string[] {
  const domains = current.domains.length ? current.domains.join(', ') : 'none';
  return [
    `Salon "${id}" already exists: "${current.name}", domains: ${domains}.`,
    `If that is not the salon of salons/${slug}.json, stop now and give the file another "id".`,
    reapply
      ? `--reapply-settings: its name, colours, photo, story, claims, domains (when listed) and owner are updated, and the owner's ` +
        `own edits in Réglages are overwritten with salons/${slug}.json: hours, address, WhatsApp, links, services and prices, stylists and their days.`
      : `Its name, colours, photo, story, claims, domains (when listed) and owner are updated; hours, contact info, services ` +
        "and stylists keep the owner's edits (--reapply-settings to overwrite them).",
  ];
}

export interface Prompt {
  /** False when nobody can answer (no terminal): then only --yes continues. */
  interactive: boolean;
  ask(question: string): Promise<string>;
}

export type Answer = 'continue' | 'stopped' | 'needs-yes';

/** Asks "Continue? [y/N]"; --yes answers for the product owner. Anything but y/yes stops. */
export async function confirmContinue({ yes }: { yes: boolean }, prompt: Prompt): Promise<Answer> {
  if (yes) return 'continue';
  if (!prompt.interactive) return 'needs-yes';
  const answer = await prompt.ask('Continue? [y/N] ');
  return /^y(es)?$/i.test(answer.trim()) ? 'continue' : 'stopped';
}
