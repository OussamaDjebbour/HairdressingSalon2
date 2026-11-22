import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { countText } from '../../data/formatters';
import { useAllServices, useCategories } from '../../data/queries';
import {
  categoryInUseCount, toSettingsError, useDeleteCategory, useReorderCategories, useSaveCategory,
} from '../../data/salonSettings';
import { QueryFallback, queriesReady } from './QueryFallback';
import { useConfirm, useToast } from '../admin/feedback';

const ERROR_KEYS = ['invalid_category', 'not_found', 'not_authorized', 'demo_disabled'];

export function CategoriesSettings() {
  const { t, lang } = useLang();
  const categoriesQuery = useCategories();
  const servicesQuery = useAllServices();
  const save = useSaveCategory();
  const reorder = useReorderCategories();
  const del = useDeleteCategory();
  const ask = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [fr, setFr] = useState('');
  const [ar, setAr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  if (!queriesReady([categoriesQuery, servicesQuery])) {
    return <QueryFallback queries={[categoriesQuery, servicesQuery]} />;
  }
  const categories = categoriesQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const countOf = (id: string) => services.filter((s) => s.customCategoryId === id).length;

  const fail = (err: unknown) => {
    const code = toSettingsError(err);
    if (code === 'invalid_name') return setError(t('settings.categories.invalidName'));
    setError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
  };

  const resetForm = () => { setEditing(null); setFr(''); setAr(''); setError(null); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = { fr: fr.trim(), ar: ar.trim() };
    if (name.fr.length < 2 || name.fr.length > 60) return setError(t('settings.categories.invalidName'));
    setError(null);
    save.mutate({ id: editing, name }, {
      onSuccess: () => { resetForm(); toast(t('settings.toast.categorySaved')); },
      onError: fail,
    });
  };

  const move = (index: number, by: -1 | 1) => {
    const ids = categories.map((c) => c.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    setRowError(null);
    reorder.mutate(ids, { onError: fail });
  };

  const remove = async (id: string) => {
    const ok = await ask({
      title: t('settings.categories.deleteTitle'),
      text: t('settings.categories.deleteText'),
      confirmLabel: t('settings.categories.deleteYes'),
      cancelLabel: t('settings.services.cancel'),
      danger: true,
    });
    if (!ok) return;
    setRowError(null);
    del.mutate(id, {
      onSuccess: () => {
        if (editing === id) resetForm();
        toast(t('settings.toast.categoryDeleted'));
      },
      onError: (err) => {
        if (toSettingsError(err) === 'category_in_use') {
          setRowError({ id, text: countText(t, lang, 'settings.categories.inUse', categoryInUseCount(err)) });
        } else fail(err);
      },
    });
  };

  const busy = reorder.isPending || del.isPending;

  return (
    <div className="space-y-5">
      <section className="card p-4 space-y-3">
        {categories.length === 0 ? (
          <p className="text-sm text-rose-600">{t('settings.categories.none')}</p>
        ) : (
          <ul className="space-y-2">
            {categories.map((c, i) => {
              const n = countOf(c.id);
              return (
                <li key={c.id} className="space-y-1">
                  <div className="flex items-center gap-1 text-rose-800">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium truncate">{c.name[lang]}</span>
                      <span className="block text-sm text-rose-700/80">
                        {t(n === 1 || n === 0 ? 'settings.categories.count1' : 'settings.categories.count').replace('{n}', String(n))}
                      </span>
                    </span>
                    <button type="button" className="btn-ghost btn-sm shrink-0 min-w-[44px] min-h-[44px]"
                      aria-label={t('settings.categories.up')} disabled={i === 0 || busy} onClick={() => move(i, -1)}>
                      <ArrowUp className="w-4 h-4" strokeWidth={1.8} aria-hidden />
                    </button>
                    <button type="button" className="btn-ghost btn-sm shrink-0 min-w-[44px] min-h-[44px]"
                      aria-label={t('settings.categories.down')} disabled={i === categories.length - 1 || busy} onClick={() => move(i, 1)}>
                      <ArrowDown className="w-4 h-4" strokeWidth={1.8} aria-hidden />
                    </button>
                    <button type="button" className="btn-ghost btn-sm shrink-0 min-w-[44px] min-h-[44px]"
                      aria-label={t('settings.categories.edit')}
                      onClick={() => { setEditing(c.id); setFr(c.name.fr); setAr(c.name.ar); setError(null); }}>
                      <Pencil className="w-4 h-4" strokeWidth={1.8} aria-hidden />
                    </button>
                    <button type="button" className="btn-ghost btn-sm shrink-0 min-w-[44px] min-h-[44px]"
                      aria-label={t('settings.categories.delete')} disabled={busy} onClick={() => void remove(c.id)}>
                      <Trash2 className="w-4 h-4" strokeWidth={1.8} aria-hidden />
                    </button>
                  </div>
                  {rowError?.id === c.id && <p role="alert" className="text-sm text-rust-600">{rowError.text}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form className="card p-4 space-y-3" noValidate onSubmit={submit}>
        <div>
          <label className="label" htmlFor="category-fr">{t('settings.categories.nameFr')}</label>
          <input id="category-fr" className="input" maxLength={60} value={fr} onChange={(e) => setFr(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="category-ar">{t('settings.categories.nameAr')}</label>
          <input id="category-ar" className="input" dir="rtl" maxLength={60} value={ar} onChange={(e) => setAr(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-rust-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={save.isPending}>
            {editing ? t('settings.services.save') : t('settings.categories.add')}
          </button>
          {editing && <button type="button" className="btn-secondary" onClick={resetForm}>{t('settings.services.cancel')}</button>}
        </div>
      </form>
    </div>
  );
}
