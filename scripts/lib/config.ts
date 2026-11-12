/**
 * A salon's launch config, `salons/<slug>.json` (see salons/README.md), and its validation.
 * Mirrors provision_salon's rules so mistakes are reported, all at once and by field, before
 * anything is written. Pure: no file or network access.
 */
import { isHexColor } from '../../src/lib/palette';
import { normalizeHost } from '../../src/lib/host';

export type Bilingual = { fr: string; ar?: string };

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface ServiceConfig {
  id: string;
  category: 'coiffure' | 'beaute';
  name: Bilingual;
  description?: Bilingual;
  price: number;
  duration: number;
  photo?: string;
}

export interface StylistConfig {
  id: string;
  name: string;
  role?: Bilingual;
  services: string[];
  /** Left out: the salon's open days. */
  workdays?: Weekday[];
  photo?: string;
}

export interface SalonConfig {
  id: string;
  name: Bilingual;
  color: string;
  domains: string[];
  address: Bilingual;
  city: Bilingual;
  whatsapp: string;
  instagram?: string;
  facebook?: string;
  story?: Bilingual;
  storyIntro?: Bilingual;
  founder?: { name: Bilingual; role?: Bilingual };
  claims?: { yearsOpen?: number; clientCount?: number; rating?: number; reviewCount?: number };
  /** "HH:MM-HH:MM" or "closed". */
  hours: Record<Weekday, string>;
  services: ServiceConfig[];
  stylists: StylistConfig[];
  owner: { email: string };
  heroPhoto?: string;
}

export class ConfigError extends Error {
  constructor(readonly errors: string[]) {
    super(`Invalid salon config:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** True for a photo given as a file under salons/<slug>/photos/ (not an https:// URL). */
export function isLocalPhoto(ref: string): boolean {
  return !ref.startsWith('https://');
}

/** "09:00-18:00" -> ["09:00", "18:00"]; null for "closed" or a malformed value. */
export function parseHoursRange(value: string): [string, string] | null {
  const m = /^((?:[01]\d|2[0-3]):(?:00|15|30|45))-((?:[01]\d|2[0-3]):(?:00|15|30|45))$/.exec(value);
  return m && m[1] < m[2] ? [m[1], m[2]] : null;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const ITEM_ID_RE = /^[a-z0-9][a-z0-9-]{1,59}$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const show = (v: unknown) => JSON.stringify(v);

/** Same normalisation as private.normalize_phone. */
function normalizePhone(p: string): string {
  const v = p.replace(/[\s.()-]/g, '');
  if (v.startsWith('+213')) return '0' + v.slice(4);
  if (v.startsWith('00213')) return '0' + v.slice(5);
  return v;
}

export function parseSalonConfig(json: unknown): SalonConfig {
  const errors: string[] = [];
  const err = (field: string, message: string) => errors.push(`${field}: ${message}`);

  if (!isObj(json)) throw new ConfigError(['the config must be a JSON object']);

  const text = (o: Obj, key: string, field: string, opts: { required?: boolean; min?: number; max?: number } = {}) => {
    const v = o[key];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      if (opts.required) err(field, 'required');
      return undefined;
    }
    if (typeof v !== 'string') return void err(field, `must be text, got ${show(v)}`);
    const t = v.trim();
    if (opts.min !== undefined && t.length < opts.min) err(field, `must be at least ${opts.min} characters`);
    if (opts.max !== undefined && t.length > opts.max) err(field, `must be at most ${opts.max} characters`);
    return t;
  };

  const bilingual = (o: Obj, key: string, field: string, opts: { required?: boolean; min?: number; max?: number } = {}) => {
    const v = o[key];
    if (v === undefined || v === null) {
      if (opts.required) err(field, 'required ({"fr": "…", "ar": "…"})');
      return undefined;
    }
    if (!isObj(v)) return void err(field, `must be {"fr": "…", "ar": "…"}, got ${show(v)}`);
    const fr = text(v, 'fr', `${field}.fr`, { ...opts, required: true });
    const ar = text(v, 'ar', `${field}.ar`, { max: opts.max });
    for (const k of Object.keys(v)) if (k !== 'fr' && k !== 'ar') err(`${field}.${k}`, 'unknown key (use "fr" and "ar")');
    return fr === undefined ? undefined : ar === undefined ? { fr } : { fr, ar };
  };

  const httpsUrl = (o: Obj, key: string, field: string) => {
    const v = text(o, key, field);
    if (v !== undefined && !/^https:\/\/\S+$/.test(v)) err(field, `must start with https://, got ${show(v)}`);
    return v;
  };

  const photo = (o: Obj, key: string, field: string) => {
    const v = text(o, key, field);
    if (v === undefined || !isLocalPhoto(v)) return v;
    if (v.startsWith('/') || v.includes('\\') || v.split('/').some((part) => part === '..' || part === '' || part === '.')) {
      err(field, `${show(v)} must be an https:// URL or a file name inside salons/<slug>/photos/`);
    }
    return v;
  };

  const integer = (o: Obj, key: string, field: string, min: number, max: number) => {
    const v = o[key];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      return void err(field, `must be a whole number from ${min} to ${max}, got ${show(v)}`);
    }
    return v;
  };

  const array = (o: Obj, key: string, field: string): unknown[] => {
    const v = o[key];
    if (Array.isArray(v)) return v;
    err(field, v === undefined || v === null ? 'required (a list)' : `must be a list, got ${show(v)}`);
    return [];
  };

  const known = new Set([
    'id', 'name', 'color', 'domains', 'address', 'city', 'whatsapp', 'instagram', 'facebook', 'story',
    'storyIntro', 'founder', 'claims', 'hours', 'services', 'stylists', 'owner', 'heroPhoto',
  ]);
  for (const k of Object.keys(json)) if (!known.has(k)) err(k, 'unknown key');

  // salon
  const id = text(json, 'id', 'id', { required: true });
  if (id !== undefined && !ID_RE.test(id)) {
    err('id', `${show(id)} must be 2-40 lowercase letters, digits or "-" (e.g. "sara-beaute")`);
  }
  const name = bilingual(json, 'name', 'name', { required: true, min: 2, max: 80 });
  const color = text(json, 'color', 'color', { required: true });
  if (color !== undefined && !isHexColor(color)) err('color', `${show(color)} is not a colour like "#9D4B5F" (#RRGGBB)`);

  const domains = array(json, 'domains', 'domains').flatMap((d, i) => {
    if (typeof d !== 'string' || !DOMAIN_RE.test(normalizeHost(d)) || normalizeHost(d).length > 253) {
      err(`domains[${i}]`, `${show(d)} is not a domain name like "sara-salon.com"`);
      return [];
    }
    return [d.trim()];
  });

  const address = bilingual(json, 'address', 'address', { required: true, max: 200 });
  const city = bilingual(json, 'city', 'city', { required: true, max: 200 });
  const whatsapp = text(json, 'whatsapp', 'whatsapp', { required: true });
  if (whatsapp !== undefined && !/^0[5-7]\d{8}$/.test(normalizePhone(whatsapp))) {
    err('whatsapp', `${show(whatsapp)} is not an Algerian mobile number (05/06/07 + 8 digits, or +213 …)`);
  }
  const instagram = httpsUrl(json, 'instagram', 'instagram');
  const facebook = httpsUrl(json, 'facebook', 'facebook');
  const story = bilingual(json, 'story', 'story', { max: 1000 });
  const storyIntro = bilingual(json, 'storyIntro', 'storyIntro', { max: 1000 });

  let founder: SalonConfig['founder'];
  if (json.founder !== undefined && json.founder !== null) {
    if (!isObj(json.founder)) err('founder', 'must be {"name": {"fr", "ar"}, "role": {"fr", "ar"}}');
    else {
      const fname = bilingual(json.founder, 'name', 'founder.name', { required: true, max: 80 });
      const frole = bilingual(json.founder, 'role', 'founder.role', { max: 80 });
      if (fname) founder = frole ? { name: fname, role: frole } : { name: fname };
    }
  }

  let claims: SalonConfig['claims'];
  if (json.claims !== undefined && json.claims !== null) {
    if (!isObj(json.claims)) err('claims', 'must be {"yearsOpen", "clientCount", "rating", "reviewCount"}');
    else {
      const c = json.claims;
      for (const k of Object.keys(c)) {
        if (!['yearsOpen', 'clientCount', 'rating', 'reviewCount'].includes(k)) err(`claims.${k}`, 'unknown key');
      }
      claims = {
        yearsOpen: integer(c, 'yearsOpen', 'claims.yearsOpen', 1, 200),
        clientCount: integer(c, 'clientCount', 'claims.clientCount', 1, 10_000_000),
        reviewCount: integer(c, 'reviewCount', 'claims.reviewCount', 1, 10_000_000),
      };
      if (c.rating !== undefined && c.rating !== null) {
        if (typeof c.rating !== 'number' || c.rating < 1 || c.rating > 5 || Math.abs(c.rating * 10 - Math.round(c.rating * 10)) > 1e-9) {
          err('claims.rating', `must be a number from 1 to 5 with one decimal (e.g. 4.8), got ${show(c.rating)}`);
        } else claims.rating = c.rating;
      }
    }
  }

  // hours
  const hours = {} as Record<Weekday, string>;
  if (!isObj(json.hours)) err('hours', 'required: {"monday": "closed", "tuesday": "09:00-18:00", …} for all 7 days');
  else {
    const h = json.hours;
    for (const k of Object.keys(h)) if (!(WEEKDAYS as readonly string[]).includes(k)) err(`hours.${k}`, `unknown day (use ${WEEKDAYS.join(', ')})`);
    for (const day of WEEKDAYS) {
      const v = h[day];
      if (v === undefined || v === null) err(`hours.${day}`, 'required ("HH:MM-HH:MM" or "closed")');
      else if (v !== 'closed' && (typeof v !== 'string' || !parseHoursRange(v))) {
        err(`hours.${day}`, `${show(v)} must be "HH:MM-HH:MM" in 15-minute steps, opening before closing (e.g. "09:00-18:00"), or "closed"`);
      } else hours[day] = v as string;
    }
  }
  const openDays = new Set(WEEKDAYS.filter((d) => hours[d] !== undefined && hours[d] !== 'closed'));

  // services
  const serviceIds = new Set<string>();
  const services = array(json, 'services', 'services').flatMap((s, i): ServiceConfig[] => {
    const f = `services[${i}]`;
    if (!isObj(s)) {
      err(f, 'must be an object');
      return [];
    }
    for (const k of Object.keys(s)) {
      if (!['id', 'category', 'name', 'description', 'price', 'duration', 'photo'].includes(k)) err(`${f}.${k}`, 'unknown key');
    }
    const sid = text(s, 'id', `${f}.id`, { required: true });
    if (sid !== undefined) {
      if (!ITEM_ID_RE.test(sid)) err(`${f}.id`, `${show(sid)} must be lowercase letters, digits or "-" (e.g. "sara-coupe")`);
      else if (serviceIds.has(sid)) err(`${f}.id`, `${show(sid)} is used twice`);
      serviceIds.add(sid);
    }
    const category = s.category;
    if (category !== 'coiffure' && category !== 'beaute') err(`${f}.category`, `must be "coiffure" or "beaute", got ${show(category)}`);
    const sname = bilingual(s, 'name', `${f}.name`, { required: true, min: 2, max: 80 });
    const description = bilingual(s, 'description', `${f}.description`, { max: 500 });
    const price = integer(s, 'price', `${f}.price`, 0, 1_000_000);
    if (s.price === undefined) err(`${f}.price`, 'required (in DA)');
    const duration = integer(s, 'duration', `${f}.duration`, 15, 600);
    if (s.duration === undefined) err(`${f}.duration`, 'required (in minutes)');
    else if (duration !== undefined && duration % 15 !== 0) err(`${f}.duration`, `${duration} must be a multiple of 15 minutes`);
    const sphoto = photo(s, 'photo', `${f}.photo`);
    if (sid === undefined || !sname || price === undefined || duration === undefined) return [];
    return [{
      id: sid, category: category as ServiceConfig['category'], name: sname, price, duration,
      ...(description && { description }), ...(sphoto && { photo: sphoto }),
    }];
  });

  // stylists
  const stylistIds = new Set<string>();
  const stylists = array(json, 'stylists', 'stylists').flatMap((s, i): StylistConfig[] => {
    const f = `stylists[${i}]`;
    if (!isObj(s)) {
      err(f, 'must be an object');
      return [];
    }
    for (const k of Object.keys(s)) {
      if (!['id', 'name', 'role', 'services', 'workdays', 'photo'].includes(k)) err(`${f}.${k}`, 'unknown key');
    }
    const sid = text(s, 'id', `${f}.id`, { required: true });
    if (sid !== undefined) {
      if (!ITEM_ID_RE.test(sid)) err(`${f}.id`, `${show(sid)} must be lowercase letters, digits or "-" (e.g. "sara-yasmine")`);
      else if (stylistIds.has(sid)) err(`${f}.id`, `${show(sid)} is used twice`);
      stylistIds.add(sid);
    }
    const sname = text(s, 'name', `${f}.name`, { required: true, max: 80 });
    const role = bilingual(s, 'role', `${f}.role`, { max: 80 });
    const svc = array(s, 'services', `${f}.services`).filter((x): x is string => {
      if (typeof x === 'string' && serviceIds.has(x)) return true;
      err(`${f}.services`, `unknown service ${show(x)} (not in "services")`);
      return false;
    });
    let workdays: Weekday[] | undefined;
    if (s.workdays !== undefined) {
      workdays = array(s, 'workdays', `${f}.workdays`).filter((d): d is Weekday => {
        if (!(WEEKDAYS as readonly unknown[]).includes(d)) {
          err(`${f}.workdays`, `${show(d)} is not a day (use ${WEEKDAYS.join(', ')})`);
          return false;
        }
        if (Object.keys(hours).length === 7 && !openDays.has(d as Weekday)) {
          err(`${f}.workdays`, `${show(d)} is a closed day`);
          return false;
        }
        return true;
      });
    }
    const sphoto = photo(s, 'photo', `${f}.photo`);
    if (sid === undefined || sname === undefined) return [];
    return [{
      id: sid, name: sname, services: svc,
      ...(role && { role }), ...(workdays && { workdays }), ...(sphoto && { photo: sphoto }),
    }];
  });

  // owner
  let email: string | undefined;
  if (!isObj(json.owner)) err('owner', 'required: {"email": "…"}');
  else {
    email = text(json.owner, 'email', 'owner.email', { required: true });
    if (email !== undefined && !EMAIL_RE.test(email)) err('owner.email', `${show(email)} is not an email address`);
  }

  const heroPhoto = photo(json, 'heroPhoto', 'heroPhoto');

  if (errors.length) throw new ConfigError(errors);

  return {
    id: id!, name: name!, color: color!, domains, address: address!, city: city!, whatsapp: whatsapp!,
    hours, services, stylists, owner: { email: email!.toLowerCase() },
    ...(instagram && { instagram }), ...(facebook && { facebook }), ...(story && { story }),
    ...(storyIntro && { storyIntro }), ...(founder && { founder }), ...(claims && { claims }),
    ...(heroPhoto && { heroPhoto }),
  };
}
