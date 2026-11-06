import { describe, it, expect } from 'vitest';
import { clientMessage, toWaNumber, waLink } from './whatsapp';

const booking = {
  clientName: 'Yasmine',
  startsAt: new Date('2030-01-08T09:00:00Z'), // 10:00 in Algiers
  serviceName: { fr: 'Coupe & Brushing', ar: 'قص' },
};

describe('toWaNumber', () => {
  it('turns a local Algerian mobile into the international form wa.me expects', () => {
    expect(toWaNumber('0555123456')).toBe('213555123456');
  });
});

describe('waLink', () => {
  it('builds a wa.me link with an encoded message', () => {
    expect(waLink('213555123456', 'a b')).toBe('https://wa.me/213555123456?text=a%20b');
    expect(waLink('213555123456')).toBe('https://wa.me/213555123456');
  });
});

describe('clientMessage', () => {
  it('writes the confirmation in French', () => {
    expect(clientMessage('confirmed', { ...booking, lang: 'fr' })).toBe(
      'Bonjour Yasmine, votre rendez-vous du Mardi 8 janvier à 10:00 (Coupe & Brushing) chez Élégance est confirmé. À bientôt !'
    );
  });

  it('writes the confirmation in Arabic for Arabic-speaking clients', () => {
    const text = clientMessage('confirmed', { ...booking, lang: 'ar' });
    expect(text).toContain('تم تأكيد موعدكِ');
    expect(text).toContain('10:00');
  });

  it('has cancelled and moved variants', () => {
    expect(clientMessage('cancelled', { ...booking, lang: 'fr' })).toContain('est annulé');
    expect(clientMessage('moved', { ...booking, lang: 'fr' })).toContain('a été déplacé au Mardi 8 janvier à 10:00');
  });
});
