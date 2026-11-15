import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Scissors, Sparkles } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import type { PhotoChange } from '../../data/salonSettings';
import { PhotoError, preparePhoto } from '../../lib/photo';
import { SmartImage } from '../SmartImage';

interface Props {
  id: string;
  currentUrl: string;
  category: 'coiffure' | 'beaute';
  value: PhotoChange;
  onChange(v: PhotoChange): void;
  onBusyChange(busy: boolean): void;
  demo: boolean;
}

export function ServicePhotoField({ id, currentUrl, category, value, onChange, onBusyChange, demo }: Props) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoNote, setDemoNote] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const blob = value.kind === 'new' ? value.blob : null;
  useEffect(() => {
    if (!blob) { setPreview(null); return; }
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const shown = blob ? preview : value.kind === 'remove' ? null : currentUrl || null;
  const Icon = category === 'beaute' ? Sparkles : Scissors;

  const open = () => {
    if (demo) { setDemoNote(true); return; }
    inputRef.current?.click();
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    onBusyChange(true);
    try {
      onChange({ kind: 'new', blob: await preparePhoto(file) });
    } catch (err) {
      setError(t(`settings.error.${err instanceof PhotoError ? err.code : 'photo_unreadable'}`));
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <div>
      <span className="label" id={`${id}-label`}>{t('settings.services.photo')}</span>
      <div className="flex items-center gap-3">
        <div className="w-32 shrink-0">
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
              <button type="button" className="btn-secondary btn-sm tap" onClick={open}>{t('settings.services.changePhoto')}</button>
              <button type="button" className="btn-ghost btn-sm tap" onClick={() => { setError(null); setDemoNote(false); onChange({ kind: 'remove' }); }}>
                {t('settings.services.removePhoto')}
              </button>
            </>
          ) : (
            <button type="button" className="btn-secondary btn-sm tap" onClick={open}>
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
      {demoNote && <p role="status" className="mt-2 text-sm text-rose-600">{t('settings.services.photoDemo')}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-rust-600">{error}</p>}
    </div>
  );
}
