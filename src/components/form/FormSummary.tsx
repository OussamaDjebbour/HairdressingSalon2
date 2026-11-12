import { useLang } from '../../context/LanguageContext';
import { countText } from '../../data/formatters';

/** "2 champs à corriger." — announced once after a submit that fails validation. */
export function FormSummary({ count }: { count: number }) {
  const { t, lang } = useLang();
  if (count <= 0) return null;
  return (
    <p role="alert" className="field-error">
      {countText(t, lang, 'form.summary', count)}
    </p>
  );
}
