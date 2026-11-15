import { Auth, USERNAME_MAX, validateEmail, validatePassword, validateUsername, type Account } from '../persistence/Auth';
import { h, setText } from './dom';
import { ICONS } from './icons';
import { t } from '../i18n';

export type AuthMode = 'login' | 'signup' | 'username' | 'account';

/**
 * Log in / sign up dialog. Only an email and password are needed; the commander
 * name (username) is asked right after the first sign-in.
 */
export class AuthDialog {
  private static open: AuthDialog | null = null;

  readonly el: HTMLElement;
  private card: HTMLElement;
  private returnFocus: Element | null = document.activeElement;

  static show(parent: HTMLElement, mode?: AuthMode): AuthDialog {
    AuthDialog.open?.close();
    const account = Auth.current;
    const start = mode ?? (account ? (account.username ? 'account' : 'username') : 'login');
    return (AuthDialog.open = new AuthDialog(parent, start));
  }

  private constructor(parent: HTMLElement, mode: AuthMode) {
    this.card = h('div', { class: 'auth-card' });
    this.el = h('div', { class: 'auth-modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'auth-title' } }, [this.card]);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      e.stopPropagation();
    });
    parent.append(this.el);
    this.render(mode);
  }

  close(): void {
    if (AuthDialog.open === this) AuthDialog.open = null;
    this.el.classList.add('done');
    window.setTimeout(() => this.el.remove(), 250);
    (this.returnFocus as HTMLElement | null)?.focus?.();
  }

  private render(mode: AuthMode): void {
    this.card.replaceChildren(
      h('button', { class: 'icon-btn small auth-close', html: ICONS.close, attrs: { type: 'button', 'aria-label': t('Close') }, on: { click: () => this.close() } }),
      ...this.content(mode),
    );
    this.card.querySelector<HTMLInputElement>('input')?.focus();
  }

  private content(mode: AuthMode): HTMLElement[] {
    switch (mode) {
      case 'login':
      case 'signup':
        return this.credentials(mode);
      case 'username':
        return this.usernameForm();
      case 'account':
        return this.accountView(Auth.current);
    }
  }

  private credentials(mode: 'login' | 'signup'): HTMLElement[] {
    const signup = mode === 'signup';
    const email = h('input', { attrs: { type: 'email', name: 'email', autocomplete: 'email', required: '', inputmode: 'email', placeholder: 'you@example.com' } });
    const password = h('input', {
      attrs: { type: 'password', name: 'password', autocomplete: signup ? 'new-password' : 'current-password', required: '', placeholder: signup ? t('At least 6 characters') : '' },
    });
    const reveal = h('button', {
      class: 'auth-reveal',
      text: t('Show'),
      attrs: { type: 'button', 'aria-label': t('Show password'), 'aria-pressed': 'false' },
      on: {
        click: () => {
          const show = password.type === 'password';
          password.type = show ? 'text' : 'password';
          setText(reveal, show ? t('Hide') : t('Show'));
          reveal.setAttribute('aria-pressed', String(show));
        },
      },
    });
    const error = h('p', { class: 'auth-error', attrs: { role: 'alert' } });
    const submit = h('button', { class: 'btn primary big', text: signup ? t('Create account') : t('Log in'), attrs: { type: 'submit' } });

    const form = h('form', { class: 'auth-form', attrs: { novalidate: '' } }, [
      field(t('Email'), email),
      field(t('Password'), h('div', { class: 'auth-password' }, [password, reveal])),
      error,
      submit,
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const problem = validateEmail(email.value) ?? validatePassword(password.value);
      if (problem) return setText(error, problem);
      setText(error, '');
      await busy(submit, signup ? t('Creating…') : t('Logging in…'), async () => {
        const r = signup ? await Auth.signUp(email.value, password.value) : await Auth.logIn(email.value, password.value);
        if (!r.ok) return setText(error, r.error);
        if (!r.account.username) return this.render('username');
        this.close();
      });
    });

    return [
      h('span', { class: 'eyebrow', text: signup ? t('New commander') : t('Welcome back') }),
      h('h2', { text: signup ? t('Create your account') : t('Log in'), attrs: { id: 'auth-title' } }),
      h('p', { class: 'auth-lead', text: t('Your colony is saved to your account, so you can keep playing on any device.') }),
      form,
      h('p', { class: 'auth-switch' }, [
        signup ? `${t('Already have an account?')} ` : `${t('New here?')} `,
        h('button', { class: 'link-btn', text: signup ? t('Log in') : t('Create an account'), attrs: { type: 'button' }, on: { click: () => this.render(signup ? 'login' : 'signup') } }),
      ]),
    ];
  }

  private usernameForm(): HTMLElement[] {
    const current = Auth.current?.username ?? '';
    const name = h('input', { attrs: { type: 'text', name: 'username', autocomplete: 'nickname', maxlength: String(USERNAME_MAX), placeholder: t('Commander Nova'), value: current } });
    const error = h('p', { class: 'auth-error', attrs: { role: 'alert' } });
    const submit = h('button', { class: 'btn primary big', text: t('Save name'), attrs: { type: 'submit' } });
    const form = h('form', { class: 'auth-form', attrs: { novalidate: '' } }, [field(t('Commander name'), name), error, submit]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const problem = validateUsername(name.value);
      if (problem) return setText(error, problem);
      setText(error, '');
      await busy(submit, t('Saving…'), async () => {
        const r = await Auth.setUsername(name.value);
        if (!r.ok) return setText(error, r.error);
        this.close();
      });
    });
    return [
      h('span', { class: 'eyebrow', text: current ? t('Your profile') : `${t('Account created')} 🎉` }),
      h('h2', { text: current ? t('Change your name') : t('Pick your commander name'), attrs: { id: 'auth-title' } }),
      h('p', { class: 'auth-lead', text: t('This is the name your crew will call you. Don’t use your real full name.') }),
      form,
    ];
  }

  private accountView(account: Account | null): HTMLElement[] {
    if (!account) return this.credentials('login');
    return [
      h('span', { class: 'eyebrow', text: t('Signed in') }),
      h('h2', { text: account.username ?? t('Commander'), attrs: { id: 'auth-title' } }),
      h('p', { class: 'auth-lead', text: account.email }),
      h('p', { class: 'muted', text: t('Your colony saves to this account automatically.') }),
      h('div', { class: 'auth-actions' }, [
        h('button', { class: 'btn', text: t('Change name'), attrs: { type: 'button' }, on: { click: () => this.render('username') } }),
        h('button', {
          class: 'btn danger',
          text: t('Log out'),
          attrs: { type: 'button' },
          on: {
            click: async () => {
              await Auth.logOut();
              this.close();
            },
          },
        }),
      ]),
    ];
  }
}

function field(label: string, control: HTMLElement): HTMLElement {
  return h('label', { class: 'auth-field' }, [h('span', { text: label }), control]);
}

async function busy(btn: HTMLButtonElement, label: string, run: () => Promise<unknown>): Promise<void> {
  const text = btn.textContent ?? '';
  btn.disabled = true;
  setText(btn, label);
  try {
    await run();
  } finally {
    btn.disabled = false;
    setText(btn, text);
  }
}

/** Small "Log in" / commander-name button that opens the dialog and follows the account. */
export function accountButton(parent: HTMLElement, className = 'btn'): HTMLButtonElement {
  const label = h('span');
  const btn = h('button', { class: `${className} account-btn`, attrs: { type: 'button' }, on: { click: () => AuthDialog.show(parent) } }, [
    h('span', { class: 'btn-icon', html: ICONS.user }),
    label,
  ]);
  const update = () => {
    const a = Auth.current;
    setText(label, a ? (a.username ?? t('Set your name')) : t('Log in / Sign up'));
    btn.title = a ? t('Signed in as {email}', { email: a.email }) : t('Log in to save your colony to your account');
  };
  Auth.onChange(update);
  Auth.ready.then(update);
  update();
  if (!Auth.available) btn.hidden = true;
  return btn;
}
