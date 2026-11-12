import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { isInPortal, useSheetDialog } from './useSheetDialog';
import type { SheetMotionState } from './useSheetMotion';

interface SheetProps {
  title: ReactNode;
  /** A short line under the title. */
  lead?: ReactNode;
  /** Backdrop, Escape and ✕ all go through here. */
  onRequestClose(): void;
  /** From useSheetMotion: slides up while entering, down while closing. */
  motion: SheetMotionState;
  children: ReactNode;
}

/**
 * The admin's bottom sheet (a centred card from `sm`): its title and ✕ stay in place while
 * the content scrolls under them, with room at the bottom above the phone's home bar.
 * It slides up on open and down on close (phones); from `sm` it fades and grows instead.
 * With reduced motion it only fades.
 */
export function Sheet({ title, lead, onRequestClose, motion, children }: SheetProps) {
  const shown = motion === 'open';
  const { t } = useLang();
  const titleId = useId();
  const dialogRef = useSheetDialog(onRequestClose);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-rose-950/40 transition-opacity ${
        motion === 'closing' ? 'duration-200 ease-in pointer-events-none' : 'duration-300 ease-silk'
      } ${shown ? 'opacity-100' : 'opacity-0'}`}
      onClick={(e) => {
        // A tap inside an open menu or calendar (portalled, but a React child of the sheet) is not a backdrop tap.
        if (!isInPortal(e.target)) onRequestClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-state={motion}
        onClick={(e) => e.stopPropagation()}
        className={`sheet-panel w-full sm:max-w-md overflow-y-auto overscroll-contain bg-cream-50 rounded-t-3xl sm:rounded-3xl shadow-lift focus:outline-none
          transition-[transform,opacity] motion-reduce:transition-opacity motion-reduce:transform-none ${
          motion === 'closing' ? 'duration-200 ease-in' : 'duration-300 ease-silk'
        } ${shown ? 'translate-y-0 sm:scale-100 sm:opacity-100' : 'translate-y-full sm:translate-y-0 sm:scale-95 sm:opacity-0 motion-reduce:opacity-0'}`}
      >
        <div className="sticky top-0 z-20 flex items-start justify-between gap-3 bg-cream-50 border-b border-cream-200 px-5 sm:px-6 pt-5 sm:pt-6 pb-4">
          <div className="min-w-0">
            <h2 id={titleId} className="flex items-center gap-2.5 font-display text-xl font-semibold text-rose-900">{title}</h2>
            {lead && <p className="mt-1 text-sm text-rose-600">{lead}</p>}
          </div>
          <button type="button" onClick={onRequestClose} className="btn-ghost btn-sm tap -me-2 -mt-2 shrink-0" aria-label={t('admin.sheet.close')}>
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <div className="sheet-body px-5 sm:px-6 pt-4">{children}</div>
      </div>
    </div>
  );
}
