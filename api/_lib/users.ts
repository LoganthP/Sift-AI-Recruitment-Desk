import type { Profile, PublicUser } from '../../shared/schemas';
import { HttpError } from './ai';
import { kv } from './kv';

type StoredUser = {
  id: string;
  email: string;
  name: string;
  accountType: string;
  profile: Profile | null;
  profileComplete: boolean;
  createdAt: number;
  passwordHash: string;
  salt: string;
};

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ITERATIONS = 60_000;

/** PBKDF2-SHA256 via Web Crypto (available on Edge and Node). */
async function derive(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS }, key, 256);
  return b64(bits);
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const strip = ({ passwordHash: _p, salt: _s, ...u }: StoredUser): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  accountType: 'organisation',
  profile: u.profile,
  profileComplete: u.profileComplete,
  createdAt: u.createdAt,
});

async function load(id: string) {
  const raw = await kv.get(`user:${id}`);
  return raw ? (JSON.parse(raw) as StoredUser) : null;
}

export async function createUser(input: { accountType?: string; name: string; email: string; password: string; profile?: Profile }) {
  const id = crypto.randomUUID();
  const claimed = await kv.set(`user:email:${input.email}`, id, { nx: true });
  if (!claimed) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const user: StoredUser = {
    id,
    email: input.email,
    name: input.name,
    accountType: 'organisation',
    profile: input.profile ?? null,
    profileComplete: !!input.profile,
    createdAt: Date.now(),
    passwordHash: await derive(input.password, salt),
    salt: b64(salt),
  };
  await kv.set(`user:${id}`, JSON.stringify(user));
  return strip(user);
}

export async function verifyLogin(email: string, password: string, _accountType?: string) {
  await ensureDemoUsers();
  const id = await kv.get(`user:email:${email}`);
  const user = id ? await load(id) : null;
  if (!user || !safeEqual(await derive(password, unb64(user.salt)), user.passwordHash)) {
    throw new HttpError(401, 'That email and password combination is not correct.');
  }
  if (user.accountType === 'candidate') {
    throw new HttpError(403, 'This account type is no longer supported. Please create a recruiter account.');
  }
  return strip(user);
}

export async function getUser(id: string) {
  const u = await load(id);
  if (!u) throw new HttpError(401, 'Your account was not found. Sign in again.');
  return strip(u);
}

export async function saveProfile(id: string, profile: Profile) {
  const u = await load(id);
  if (!u) throw new HttpError(401, 'Your account was not found. Sign in again.');
  if (profile.type !== 'organisation') throw new HttpError(400, 'Profile type does not match the account.');
  const next: StoredUser = { ...u, profile, profileComplete: true, name: profile.fullName };
  await kv.set(`user:${id}`, JSON.stringify(next));
  return strip(next);
}

/* Demo recruiter account so reviewers can try the app immediately. */
let seeded = false;
export function _resetDemoSeeded() { seeded = false; }
export async function ensureDemoUsers() {
  if (seeded) return;
  const pw = process.env.DEMO_PASSWORD || 'Demo@123';
  const email = (process.env.DEMO_EMAIL || 'recruiter@demo.com').toLowerCase();
  const profile: Profile = {
    type: 'organisation',
    fullName: 'Demo Recruiter',
    designation: 'Talent Acquisition Lead',
    company: 'Northwind Analytics',
    companySize: '201-1000',
    industry: 'Software and AI',
    location: 'Bengaluru',
    hiringFor: ['AI/ML Engineer', 'Data Scientist'],
  };

  const existingId = await kv.get(`user:email:${email}`);
  if (existingId) {
    const existingUser = await load(existingId);
    if (existingUser) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const updated: StoredUser = {
        ...existingUser,
        accountType: 'organisation',
        name: 'Demo Recruiter',
        profile,
        profileComplete: true,
        passwordHash: await derive(pw, salt),
        salt: b64(salt),
      };
      await kv.set(`user:${existingId}`, JSON.stringify(updated));
    }
  } else {
    try {
      await createUser({
        accountType: 'organisation',
        name: 'Demo Recruiter',
        email,
        password: pw,
        profile,
      });
    } catch {}
  }
  seeded = true;
}
