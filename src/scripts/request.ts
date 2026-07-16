/**
 * THE BOLT — song request form.
 *
 * Enhances the request <form>: on submit it fetches an invisible Turnstile token and POSTs JSON
 * to /api/request, showing an inline status. Without JS the plain <form> still POSTs (the
 * endpoint reads form-encoded too); Turnstile just isn't attached, which is fine when the server
 * secret is unset. Re-binds on every view-transition navigation.
 */
import { getTurnstileToken } from './turnstile';

type Kind = 'idle' | 'sending' | 'ok' | 'error';

function setStatus(form: HTMLFormElement, kind: Kind, msg = ''): void {
  const status = form.querySelector<HTMLElement>('[data-request-status]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = kind === 'sending';
  if (!status) return;
  status.classList.toggle('sr', kind === 'idle');
  status.dataset.kind = kind;
  status.textContent =
    kind === 'sending'
      ? 'Sending…'
      : kind === 'ok'
        ? 'Request received — thanks. We read every one.'
        : kind === 'error'
          ? msg || 'Something went wrong. Please try again.'
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

  const song = String(fd.get('song') ?? '').trim();
  if (!song) {
    setStatus(form, 'error', 'Please enter a song.');
    return;
  }

  setStatus(form, 'sending');
  try {
    const token = await getTurnstileToken();
    const res = await fetch('/api/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ song, website: '', token }),
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
  const form = document.querySelector<HTMLFormElement>('[data-request-form]');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', onSubmit);
}

document.addEventListener('astro:page-load', mount);

export {};
