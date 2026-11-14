import type { Session } from '@supabase/supabase-js';
import { supabase, resetCloudUser } from './supabase';

/** A signed-in player with a real (email + password) account. Anonymous players have no Account. */
export interface Account {
  id: string;
  email: string;
  /** Chosen after signing up; null until then. */
  username: string | null;
}

/** Why the account changed: a fresh sign-up, a log-in, a log-out, or a profile edit. */
export type AuthChange = 'signup' | 'login' | 'logout' | 'update';

export type AuthResult = { ok: true; account: Account } | { ok: false; error: string };

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 6;
const USERNAME_RE = /^[\p{L}\p{N}_\- ]+$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toAccount(session: Session | null): Account | null {
  const u = session?.user;
  if (!u || u.is_anonymous || !u.email) return null;
  const name = (u.user_metadata as { username?: unknown } | undefined)?.username;
  return { id: u.id, email: u.email, username: typeof name === 'string' && name.trim() ? name : null };
}

/** Turns Supabase error text into short, kid-friendly messages. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'That email already has an account — try logging in.';
  // Only happens if "Confirm email" is switched on in Supabase; the game expects it off.
  if (m.includes('email not confirmed')) return 'Accounts are not set up correctly yet — please tell a grown-up.';
  if (m.includes('password') && (m.includes('least') || m.includes('short') || m.includes('weak'))) return `Password needs at least ${PASSWORD_MIN} characters.`;
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many tries — wait a minute and try again.';
  if (m.includes('fetch') || m.includes('network')) return 'Could not reach the server. Check your internet connection.';
  return message;
}

export function validateEmail(email: string): string | null {
  return EMAIL_RE.test(email.trim()) ? null : 'Enter a valid email address.';
}

export function validatePassword(password: string): string | null {
  return password.length >= PASSWORD_MIN ? null : `Password needs at least ${PASSWORD_MIN} characters.`;
}

export function validateUsername(name: string): string | null {
  const n = name.trim();
  if (n.length < USERNAME_MIN || n.length > USERNAME_MAX) return `Pick a name with ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(n)) return 'Use only letters, numbers, spaces, - and _.';
  return null;
}

type Listener = (account: Account | null, change: AuthChange) => void;

/**
 * Email + password accounts (Supabase Auth). Players without an account keep
 * playing as an anonymous Supabase user; logging in swaps the session so cloud
 * saves follow the account to any device. The username lives in user metadata.
 */
class AuthService {
  private account: Account | null = null;
  private listeners = new Set<Listener>();
  readonly ready: Promise<void>;

  constructor() {
    this.ready = supabase
      ? supabase.auth
          .getSession()
          .then(({ data }) => {
            this.account = toAccount(data.session);
          })
          .catch(() => {})
      : Promise.resolve();
  }

  /** Accounts need the Supabase env vars; without them the game is local-only. */
  get available(): boolean {
    return !!supabase;
  }

  get current(): Account | null {
    return this.account;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(account: Account | null, change: AuthChange): void {
    this.account = account;
    resetCloudUser();
    for (const fn of this.listeners) fn(account, change);
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'Accounts are not available right now.' };
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { ok: false, error: friendly(error.message) };
    // Supabase hides "already registered" behind an empty identities list.
    if (data.user && data.user.identities?.length === 0) return { ok: false, error: friendly('already registered') };
    // No email verification: with "Confirm email" off, sign-up returns a session straight away.
    // If it didn't, try logging in so the player is never sent to their inbox.
    let session = data.session;
    if (!session) {
      const login = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (login.error) return { ok: false, error: friendly(login.error.message) };
      session = login.data.session;
    }
    const account = toAccount(session);
    if (!account) return { ok: false, error: 'Could not create the account. Please try again.' };
    this.set(account, 'signup');
    return { ok: true, account };
  }

  async logIn(email: string, password: string): Promise<AuthResult> {
    if (!supabase) return { ok: false, error: 'Accounts are not available right now.' };
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: friendly(error.message) };
    const account = toAccount(data.session);
    if (!account) return { ok: false, error: 'Could not log in. Please try again.' };
    this.set(account, 'login');
    return { ok: true, account };
  }

  async setUsername(name: string): Promise<AuthResult> {
    if (!supabase || !this.account) return { ok: false, error: 'Log in first.' };
    const { data, error } = await supabase.auth.updateUser({ data: { username: name.trim() } });
    if (error) return { ok: false, error: friendly(error.message) };
    const account: Account = { ...this.account, username: (data.user?.user_metadata as { username?: string }).username ?? name.trim() };
    this.set(account, 'update');
    return { ok: true, account };
  }

  async logOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut().catch(() => {});
    this.set(null, 'logout');
  }
}

export const Auth = new AuthService();
