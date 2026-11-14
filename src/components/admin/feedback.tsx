import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Toast from '@radix-ui/react-toast';
import { Check, X } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';

export interface ConfirmOptions {
  title: string;
  /** A line under the title saying what will happen. */
  text?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** The change can't be undone (cancelling a booking, wiping the demo): the confirm button is red. */
  danger?: boolean;
}

/** Resolves true when the owner confirms; false on cancel, Escape, or another question replacing it. */
type Confirm = (options: ConfirmOptions) => Promise<boolean>;
/** Shows a short "done" message at the bottom of the screen for a few seconds. */
type Notify = (message: string) => void;

const ConfirmContext = createContext<Confirm | null>(null);
const ToastContext = createContext<Notify | null>(null);

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside FeedbackProvider (AdminShell provides it)');
  return confirm;
}

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast must be used inside FeedbackProvider (AdminShell provides it)');
  return notify;
}

const TOAST_MS = 3500;
/** Toasts kept on screen at once; an older one makes room for a new one. */
const MAX_TOASTS = 3;

/**
 * The admin's confirm dialog and "done" toasts, in place of the browser's confirm() and of
 * actions that finished silently. Both are portalled to <body>, above the sheets.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { t } = useLang();

  const [question, setQuestion] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setQuestion(options);
      }),
    []
  );

  const answer = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setQuestion(null);
  };

  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const nextId = useRef(0);

  const notify = useCallback<Notify>((message) => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { id, message }]);
  }, []);

  // Removed once its exit animation has had time to play.
  const remove = (id: number) => window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 300);

  return (
    <Toast.Provider swipeDirection="down" duration={TOAST_MS} label={t('admin.toast.region')}>
      <ConfirmContext.Provider value={confirm}>
        <ToastContext.Provider value={notify}>{children}</ToastContext.Provider>
      </ConfirmContext.Provider>

      {toasts.map((item) => (
        <Toast.Root key={item.id} type="foreground" onOpenChange={(open) => !open && remove(item.id)} className="toast">
          <span className="grid place-items-center w-7 h-7 shrink-0 rounded-full bg-sage-100 text-sage-700">
            <Check className="w-4 h-4" strokeWidth={2.4} aria-hidden="true" />
          </span>
          <Toast.Title className="flex-1 min-w-0 text-sm font-medium">{item.message}</Toast.Title>
          <Toast.Close
            aria-label={t('admin.sheet.close')}
            className="tap -me-2 grid place-items-center shrink-0 rounded-full text-rose-700 hover:text-rose-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <X className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className="toast-viewport" />

      <AlertDialog.Root open={question !== null} onOpenChange={(open) => !open && answer(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-60 grid place-items-center overflow-y-auto p-4 bg-rose-950/40 animate-fadeIn">
            {question && (
              <AlertDialog.Content
                // No description line: say so, rather than point at a missing element.
                {...(question.text ? {} : { 'aria-describedby': undefined })}
                className="w-full max-w-sm rounded-3xl bg-cream-50 p-6 shadow-lift animate-dialogIn focus:outline-none"
              >
                <AlertDialog.Title className="font-display text-xl font-semibold text-rose-900">{question.title}</AlertDialog.Title>
                {question.text && <AlertDialog.Description className="mt-2 text-sm text-rose-700">{question.text}</AlertDialog.Description>}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                  <AlertDialog.Cancel className="btn-secondary btn-sm h-11 flex-1">{question.cancelLabel}</AlertDialog.Cancel>
                  <AlertDialog.Action
                    onClick={() => answer(true)}
                    className={`${question.danger ? 'btn-danger' : 'btn-primary'} btn-sm h-11 flex-1`}
                  >
                    {question.confirmLabel}
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            )}
          </AlertDialog.Overlay>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Toast.Provider>
  );
}
