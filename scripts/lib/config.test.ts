// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConfigError, parseSalonConfig } from './config';

const example = () =>
  JSON.parse(readFileSync(new URL('../../salons/example.json', import.meta.url), 'utf8'));

/** The readable message parseSalonConfig throws for `json`. */
function errorOf(json: unknown): string {
  try {
    parseSalonConfig(json);
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return (e as Error).message;
  }
  throw new Error('expected parseSalonConfig to throw');
}

describe('parseSalonConfig', () => {
  it('accepts salons/example.json', () => {
    const config = parseSalonConfig(example());
    expect(config.id).toBe('example');
    expect(config.name.fr).toBe('Salon Exemple');
    expect(config.services).toHaveLength(3);
    expect(config.stylists[0].workdays).toEqual(['tuesday', 'wednesday', 'thursday', 'saturday']);
    expect(config.owner.email).toBe('owner@salon-exemple.example');
  });

  it('rejects a bad colour, naming the field', () => {
    const json = { ...example(), color: 'rose' };
    expect(errorOf(json)).toMatch(/color: .*"rose".*#RRGGBB/);
  });

  it('rejects a stylist offering an unknown service, naming the stylist and the id', () => {
    const json = example();
    json.stylists[1].services = ['example-soin-visage', 'example-manucure'];
    expect(errorOf(json)).toMatch(/stylists\[1\]\.services: unknown service "example-manucure"/);
  });

  it('rejects a weekday like "9-18", naming the day and the expected format', () => {
    const json = example();
    json.hours.tuesday = '9-18';
    expect(errorOf(json)).toMatch(/hours\.tuesday: "9-18" .*"09:00-18:00".*"closed"/);
  });

  it('rejects a missing owner email', () => {
    const json = example();
    delete json.owner.email;
    expect(errorOf(json)).toMatch(/owner\.email: required/);
  });

  it('lists every problem at once', () => {
    const json = { ...example(), color: '#12', whatsapp: '0123' };
    delete json.hours.sunday;
    const message = errorOf(json);
    expect(message).toMatch(/color:/);
    expect(message).toMatch(/whatsapp:/);
    expect(message).toMatch(/hours\.sunday: required/);
  });

  it('rejects hours that are not in 15-minute steps or end before they start', () => {
    const json = example();
    json.hours.wednesday = '09:10-18:00';
    json.hours.thursday = '18:00-09:00';
    const message = errorOf(json);
    expect(message).toMatch(/hours\.wednesday:/);
    expect(message).toMatch(/hours\.thursday:/);
  });

  it('rejects a stylist working on a closed day and duplicate ids', () => {
    const json = example();
    json.stylists[0].workdays = ['monday'];
    json.services[1].id = 'example-coupe';
    const message = errorOf(json);
    expect(message).toMatch(/stylists\[0\]\.workdays: "monday" is a closed day/);
    expect(message).toMatch(/services\[1\]\.id: "example-coupe" is used twice/);
  });

  it('rejects photo paths that leave the photos folder', () => {
    const json = { ...example(), heroPhoto: '../secret.jpg' };
    expect(errorOf(json)).toMatch(/heroPhoto:/);
  });

  it('rejects an invalid domain', () => {
    const json = { ...example(), domains: ['https://sara.com/'] };
    expect(errorOf(json)).toMatch(/domains\[0\]:/);
  });

  it('checks the rating: 1 to 5 with one decimal', () => {
    const json = example();
    json.claims.rating = 1.1;
    expect(parseSalonConfig(json).claims?.rating).toBe(1.1);
    json.claims.rating = 4.75;
    expect(errorOf(json)).toMatch(/claims\.rating: .*4\.75/);
  });

  it('rejects a non-object', () => {
    expect(errorOf([])).toMatch(/object/);
  });
});
