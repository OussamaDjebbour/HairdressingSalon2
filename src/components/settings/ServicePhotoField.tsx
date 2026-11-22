import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import type { PhotoChange } from '../../data/salonSettings';
import { PhotoError, preparePhoto } from '../../lib/photo';
import { SmartImage } from '../SmartImage';
import type { StoredCategory } from '../../data/categories';
import { categoryIcon } from '../serviceIcons';

interface Props {
  id: string;
  currentUrl: string;
  category: StoredCategory;
  value: PhotoChange;
  onChange(v: PhotoChange): void;
  onBusyChange(busy: boolean): void;
  demo: boolean;
  /** True while the form is saving: the photo can't change then. */
  disabled?: boolean;
}

export function ServicePhotoField({ id, currentUrl, category, value, onChange, onBusyChange, demo, disabled = false }: Props) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const locked = busy || disabled;

  const blob = value.kind === 'new' ? value.blob : null;
  useEffect(() => {
    if (!blob) { setPreview(null); return; }
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const shown = blob ? preview : value.kind === 'remove' ? null : currentUrl || null;
  const Icon = categoryIcon(category);

  const open = () => {
    if (demo) { setDemoNote(true); return; }
    inputRef.current?.click();
  };

  const remove = () => {
    if (demo) { setDemoNote(true); return; }
    setError(null);
    onChange({ kind: 'remove' });
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    const mine = ++latest.current;
    setError(null);
    setBusy(true);
    onBusyChange(true);
    try {
      const blob = await preparePhoto(file);
      if (mine === latest.current) onChange({ kind: 'new', blob });
    } catch (err) {
      if (mine === latest.current) setError(t(`settings.error.${err instanceof PhotoError ? err.code : 'photo_unreadable'}`));
    } finally {
      if (mine === latest.current) { setBusy(false); onBusyChange(false); }
    }
  };

  return (
    <div>
      <span className="label" id={`${id}-label`}>{t('settings.services.photo')}</span>
      <div className="flex items-center gap-3">
        <div className={`w-32 shrink-0 ${busy ? 'opacity-50' : ''}`} aria-busy={busy}>
          {shown ? (
            <SmartImage src={shown} alt="" aspect="aspect-[16/11]" rounded="rounded-xl" />
          ) : (
            <div className="aspect-[16/11] rounded-xl bg-cream-100 flex items-center justify-center text-gold-600">
              <Icon className="w-7 h-7" strokeWidth={1.5} aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="flex flex-col items-start gap-1">
          {shown ? (
            <>
              <button type="button" className="btn-secondary btn-sm tap" onClick={open} disabled={locked}>{t('settings.services.changePhoto')}</button>
              <button type="button" className="btn-ghost btn-sm tap" onClick={remove} disabled={locked}>
                {t('settings.services.removePhoto')}
              </button>
            </>
          ) : (
            <button type="button" className="btn-secondary btn-sm tap" onClick={open} disabled={locked}>
              <ImagePlus className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" /> {t('settings.services.addPhoto')}
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        className="hidden"
        aria-labelledby={`${id}-label`}
        tabIndex={-1}
        onChange={(e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          void onPick(file).then(() => { input.value = ''; });
        }}
      />
      {busy && <p role="status" className="mt-2 text-sm text-rose-600">{t('settings.services.photoPreparing')}</p>}
      {demoNote && <p role="status" className="mt-2 text-sm text-rose-600">{t('settings.services.photoDemo')}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-rust-600">{error}</p>}
    </div>
  );
}
