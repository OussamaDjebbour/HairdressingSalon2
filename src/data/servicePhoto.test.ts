import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
const from = vi.fn((_bucket: string) => ({ upload, remove }));
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), storage: { from: (b: string) => from(b) } },
}));

import { saveServiceWithPhoto, ServiceSaveError, toSettingsError, type SaveServiceInput } from './salonSettings';

const input = (id: string | null): SaveServiceInput => ({
  id, name: { fr: 'Coupe', ar: 'قص' }, description: null, category: 'coiffure', price: 3000, duration: 45, sortOrder: null,
});
const blob = new Blob(['x'], { type: 'image/jpeg' });

beforeEach(() => {
  rpc.mockReset(); upload.mockReset(); remove.mockReset(); from.mockClear();
  upload.mockResolvedValue({ data: {}, error: null });
  remove.mockResolvedValue({ data: [], error: null });
});

describe('saveServiceWithPhoto', () => {
  it('keep: only saves the service', async () => {
    rpc.mockResolvedValueOnce({ data: 's1', error: null });
    expect(await saveServiceWithPhoto(input('s1'), { kind: 'keep' })).toBe('s1');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('admin_save_service');
    expect(from).not.toHaveBeenCalled();
  });

  it('new: uploads, saves, links, removes the old file', async () => {
    rpc.mockResolvedValueOnce({ data: 'new1', error: null })
      .mockResolvedValueOnce({ data: 'elegance/uploads/old.jpg', error: null });
    expect(await saveServiceWithPhoto(input(null), { kind: 'new', blob })).toBe('new1');
    expect(from).toHaveBeenCalledWith('salon-photos');
    const path = upload.mock.calls[0][0] as string;
    expect(path).toMatch(/^elegance\/uploads\/[0-9a-f-]{36}\.jpg$/);
    expect(upload.mock.calls[0][2]).toEqual({ contentType: 'image/jpeg', upsert: false });
    expect(rpc.mock.calls[0][0]).toBe('admin_save_service');
    expect(rpc.mock.calls[0][1].p_id).toBeNull();
    expect(rpc.mock.calls[1]).toEqual(['admin_set_service_photo', { p_id: 'new1', p_path: path }]);
    expect(remove).toHaveBeenCalledWith(['elegance/uploads/old.jpg']);
  });

  it('remove: clears the path, no remove when nothing to delete', async () => {
    rpc.mockResolvedValueOnce({ data: 's1', error: null }).mockResolvedValueOnce({ data: null, error: null });
    await saveServiceWithPhoto(input('s1'), { kind: 'remove' });
    expect(rpc.mock.calls[1]).toEqual(['admin_set_service_photo', { p_id: 's1', p_path: null }]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('invalid_photo after create: cleans up upload and reports the new id', async () => {
    rpc.mockResolvedValueOnce({ data: 'new1', error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'invalid_photo' } });
    const err = await saveServiceWithPhoto(input(null), { kind: 'new', blob }).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceSaveError);
    expect(err.code).toBe('invalid_photo');
    expect(err.serviceId).toBe('new1');
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });

  it('upload error: upload_failed, no rpc', async () => {
    upload.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const err = await saveServiceWithPhoto(input(null), { kind: 'new', blob }).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceSaveError);
    expect(err.code).toBe('upload_failed');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a failing remove of the old file still resolves', async () => {
    rpc.mockResolvedValueOnce({ data: 's1', error: null })
      .mockResolvedValueOnce({ data: 'elegance/uploads/old.jpg', error: null });
    remove.mockRejectedValueOnce(new Error('x'));
    expect(await saveServiceWithPhoto(input('s1'), { kind: 'new', blob })).toBe('s1');
  });

  it('admin_save_service fails after upload: file removed, no id, no photo rpc', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'unknown_service' } });
    const err = await saveServiceWithPhoto(input('s1'), { kind: 'new', blob }).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceSaveError);
    expect(err.serviceId).toBeNull();
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['admin_save_service']);
  });

  it('photo rpc fails on an existing service: serviceId stays null', async () => {
    rpc.mockResolvedValueOnce({ data: 's1', error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'invalid_photo' } });
    const err = await saveServiceWithPhoto(input('s1'), { kind: 'new', blob }).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceSaveError);
    expect(err.code).toBe('invalid_photo');
    expect(err.serviceId).toBeNull();
  });

  it('toSettingsError returns the code of a ServiceSaveError', () => {
    expect(toSettingsError(new ServiceSaveError('invalid_photo', null))).toBe('invalid_photo');
    expect(toSettingsError(new ServiceSaveError('upload_failed', 'x'))).toBe('upload_failed');
  });

  it('lost photo rpc response (unknown error): the uploaded file is kept', async () => {
    rpc.mockResolvedValueOnce({ data: 's1', error: null }).mockRejectedValueOnce(new Error('Failed to fetch'));
    const err = await saveServiceWithPhoto(input('s1'), { kind: 'new', blob }).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceSaveError);
    expect(err.code).toBe('unknown');
    expect(remove).not.toHaveBeenCalled();
  });

  it('photo rpc fails with a known code: the uploaded file is removed', async () => {
    rpc.mockResolvedValueOnce({ data: 's1', error: null })
      .mockRejectedValueOnce({ message: 'invalid_photo' });
    await saveServiceWithPhoto(input('s1'), { kind: 'new', blob }).catch((e) => e);
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
  });
});
