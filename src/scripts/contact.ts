/**
 * THE BOLT — contact dialog behaviour.
 *
 * Any [data-contact-open] trigger opens the one <dialog>; submit fetches an invisible
 * Turnstile token and POSTs JSON to /api/contact. Same status discipline as the request
 * band: a settled outcome clears after a beat (or on the next keystroke), so the dialog is
 * always ready for another message.
 */
import { getTurnstileToken } from './turnstile';

type Kind = 'idle' | 'sending' | 'ok' | 'error';

const SETTLE_MS = 6000;
let opener: HTMLElement | null = null;
let settleTimer: number | undefined;

function setStatus(form: HTMLFormElement, kind: Kind, msg = ''): void {
  const status = form.querySelector<HTMLElement>('[data-contact-status]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = kind === 'sending';
  window.clearTimeout(settleTimer);
  if (kind === 'ok' || kind === 'error') {
    settleTimer = window.setTimeout(() => setStatus(form, 'idle'), SETTLE_MS);
  }
  if (!status) return;
  status.classList.toggle('sr', kind === 'idle');
  status.dataset.kind = kind;
  status.textContent =
    kind === 'sending'
      ? 'Sending…'
      : kind === 'ok'
        ? "Message sent — thank you. We'll be in touch."
        : kind === 'error'
          ? msg || "Couldn't send — please try again."
          : '';
}

async function onSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const form = e.currentTarget as HTMLFormElement;
  const fd = new FormData(form);

  // Honeypot filled → a bot. Pretend success, send nothing.
  if (String(fd.get('website') ?? '').trim()) {
    setStatus(form, 'ok');
    form.reset();
    return;
  }

  const name = String(fd.get('name') ?? '').trim();
  const email = String(fd.get('email') ?? '').trim();
  const message = String(fd.get('message') ?? '').trim();
  if (!name || !email || !message) {
    setStatus(form, 'error', 'Please fill in name, email, and a message.');
    return;
  }

  setStatus(form, 'sending');
  try {
    const token = await getTurnstileToken();
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        category: String(fd.get('category') ?? ''),
        name,
        email,
        company: String(fd.get('company') ?? '').trim(),
        message,
        website: '',
        token,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (res.ok && data.ok) {
      setStatus(form, 'ok');
      form.reset();
    } else {
      setStatus(form, 'error', data.error);
    }
  } catch {
    setStatus(form, 'error', 'Network error. Please try again.');
  }
}

function mount(): void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-contact]');
  if (!dialog) return;

  document.querySelectorAll<HTMLElement>('[data-contact-open]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      opener = btn;
      dialog.showModal();
    });
  });

  if (dialog.dataset.bound) return;
  dialog.dataset.bound = '1';

  dialog.querySelector('[data-contact-close]')?.addEventListener('click', () => dialog.close());
  // Hand focus back to whichever trigger opened the dialog (Esc, close button or backdrop).
  dialog.addEventListener('close', () => {
    opener?.focus();
    opener = null;
  });
  // Click on the backdrop (the dialog element itself, outside the form) closes.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  const form = dialog.querySelector<HTMLFormElement>('[data-contact-form]');
  if (form) {
    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', () => {
      const kind = form.querySelector<HTMLElement>('[data-contact-status]')?.dataset.kind;
      if (kind === 'ok' || kind === 'error') setStatus(form, 'idle');
    });
  }
}

document.addEventListener('astro:page-load', mount);

export {};
