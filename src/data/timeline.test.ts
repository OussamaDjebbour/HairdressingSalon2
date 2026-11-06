import { describe, it, expect } from 'vitest';
import { layoutLanes } from './timeline';

// Minutes since midnight keep the cases readable.
const at = (id: string, start: string, end: string) => {
  const m = (t: string) => {
    const [h, mm] = t.split(':').map(Number);
    return h * 60 + mm;
  };
  return { id, start: m(start), end: m(end) };
};

describe('layoutLanes', () => {
  it('gives non-overlapping bookings the full width', () => {
    const lanes = layoutLanes([at('a', '10:00', '11:00'), at('b', '13:00', '14:00')]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 1 });
    expect(lanes.get('b')).toEqual({ lane: 0, lanes: 1 });
  });

  it('puts two bookings at the same time side by side', () => {
    const lanes = layoutLanes([at('a', '10:00', '11:00'), at('b', '10:00', '11:00')]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 });
  });

  it('treats back-to-back bookings as not overlapping', () => {
    const lanes = layoutLanes([at('a', '10:00', '11:00'), at('b', '11:00', '12:00')]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 1 });
    expect(lanes.get('b')).toEqual({ lane: 0, lanes: 1 });
  });

  it('reuses a freed lane inside a group and sizes the whole group alike', () => {
    // a overlaps b, b overlaps c, a and c touch only end-to-start.
    const lanes = layoutLanes([
      at('a', '10:00', '11:00'),
      at('b', '10:30', '11:30'),
      at('c', '11:00', '12:00'),
    ]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('c')).toEqual({ lane: 0, lanes: 2 });
  });

  it('does not depend on input order', () => {
    const lanes = layoutLanes([
      at('c', '10:00', '11:00'),
      at('a', '09:00', '12:00'),
      at('b', '10:00', '10:30'),
    ]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 3 });
    expect(new Set([lanes.get('b')?.lane, lanes.get('c')?.lane])).toEqual(new Set([1, 2]));
    expect(lanes.get('b')?.lanes).toBe(3);
  });
});
