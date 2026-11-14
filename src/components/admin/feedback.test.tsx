import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { LanguageProvider } from '../../context/LanguageContext';
import { FeedbackProvider, useConfirm, useToast, type ConfirmOptions } from './feedback';

const question: ConfirmOptions = {
  title: 'Supprimer ?',
  text: 'Ce sera définitif.',
  confirmLabel: 'Oui',
  cancelLabel: 'Non',
};

function Harness({ onAnswer, options = question }: { onAnswer(ok: boolean): void; options?: ConfirmOptions }) {
  const ask = useConfirm();
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={async () => onAnswer(await ask(options))}>ask</button>
      <button type="button" onClick={() => toast('Enregistré')}>toast</button>
    </>
  );
}

function renderHarness(props: Parameters<typeof Harness>[0]) {
  render(
    <LanguageProvider>
      <FeedbackProvider>
        <Harness {...props} />
      </FeedbackProvider>
    </LanguageProvider>
  );
}

describe('FeedbackProvider', () => {
  it('asks in a dialog with its title and text, and resolves true on confirm', async () => {
    const answers: boolean[] = [];
    renderHarness({ onAnswer: (ok) => answers.push(ok) });
    fireEvent.click(screen.getByRole('button', { name: 'ask' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Supprimer ?' });
    expect(dialog).toHaveAccessibleDescription('Ce sera définitif.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Oui' }));
    await waitFor(() => expect(answers).toEqual([true]));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('resolves false on cancel and on Escape', async () => {
    const answers: boolean[] = [];
    renderHarness({ onAnswer: (ok) => answers.push(ok) });
    fireEvent.click(screen.getByRole('button', { name: 'ask' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Non' }));
    await waitFor(() => expect(answers).toEqual([false]));

    fireEvent.click(screen.getByRole('button', { name: 'ask' }));
    fireEvent.keyDown(await screen.findByRole('alertdialog'), { key: 'Escape' });
    await waitFor(() => expect(answers).toEqual([false, false]));
  });

  it('starts on the safe answer, so a stray Enter does not confirm', async () => {
    renderHarness({ onAnswer: () => {} });
    fireEvent.click(screen.getByRole('button', { name: 'ask' }));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Non' })).toHaveFocus());
  });

  it('marks a destructive confirm as such', async () => {
    renderHarness({ onAnswer: () => {}, options: { ...question, danger: true } });
    fireEvent.click(screen.getByRole('button', { name: 'ask' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Oui' })).toHaveClass('btn-danger');
  });

  it('shows a toast with the message', async () => {
    renderHarness({ onAnswer: () => {} });
    fireEvent.click(screen.getByRole('button', { name: 'toast' }));
    const region = screen.getByRole('region', { name: /Notifications/ });
    expect(await within(region).findByText('Enregistré')).toBeInTheDocument();
    // Screen readers hear it through Radix's live announcement.
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((el) => el.textContent?.includes('Enregistré'))).toBe(true)
    );
  });

  it('refuses to be used outside the provider', () => {
    const Lonely = () => {
      useToast();
      return null;
    };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs the thrown error
    expect(() => render(<Lonely />)).toThrow(/FeedbackProvider/);
    quiet.mockRestore();
  });
});
