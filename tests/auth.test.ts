import { describe, it, expect } from 'vitest';
import app from '../api/_lib/app';
import { sign } from 'hono/jwt';
import { kv } from '../api/_lib/kv';
import fs from 'node:fs';
import path from 'node:path';

describe('B. Auth and Accounts', () => {
  const secret = process.env.AUTH_SECRET || 'sift-dev-secret-change-me';

  it('B.1 Recruiter signup always creates an organisation account', async () => {
    const orgEmail = `org_${Date.now()}@test.com`;
    const resOrg = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Acme Recruiter',
        email: orgEmail,
        password: 'password123',
      }),
    });
    expect(resOrg.status).toBe(200);
    const orgData = await resOrg.json();
    expect(orgData.user.accountType).toBe('organisation');
    expect(orgData.token).toBeDefined();
    expect((orgData.user as any).workStatus).toBeUndefined();
  });

  it('B.2 Duplicate email gets 409; invalid email or short password gets 400', async () => {
    const email = `dup_${Date.now()}@test.com`;
    const res1 = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Original',
        email,
        password: 'password123',
      }),
    });
    expect(res1.status).toBe(200);

    // Duplicate signup
    const resDup = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate',
        email,
        password: 'password123',
      }),
    });
    expect(resDup.status).toBe(409);
    const dupErr = await resDup.json();
    expect(dupErr.error).toContain('already exists');

    // Invalid email -> 400
    const resBadEmail = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Email',
        email: 'invalid-email',
        password: 'password123',
      }),
    });
    expect(resBadEmail.status).toBe(400);
    const badEmailErr = await resBadEmail.json();
    expect(badEmailErr.error).toBe('Enter a valid email address.');

    // Short password -> 400
    const resShortPw = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Short Pw',
        email: `shortpw_${Date.now()}@test.com`,
        password: '123',
      }),
    });
    expect(resShortPw.status).toBe(400);
    const shortPwErr = await resShortPw.json();
    expect(shortPwErr.error).toBe('Password must be at least 6 characters.');
  });

  it('B.3 Login works with correct password, fails with wrong password, and ignores accountType', async () => {
    const email = `login_${Date.now()}@test.com`;
    await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Login Test',
        email,
        password: 'password123',
      }),
    });

    // Valid login
    const resOk = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    expect(resOk.status).toBe(200);

    // Login passing legacy accountType field also works cleanly
    const resWithField = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123', accountType: 'organisation' }),
    });
    expect(resWithField.status).toBe(200);

    // Wrong password -> 401
    const resWrongPw = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrongpassword' }),
    });
    expect(resWrongPw.status).toBe(401);
    const wrongPwErr = await resWrongPw.json();
    expect(wrongPwErr.error).toBe('That email and password combination is not correct.');
  });

  it('(a) the demo recruiter logs in with Demo@123 and lands on /app', async () => {
    const resRecruiter = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'recruiter@demo.com', password: 'Demo@123' }),
    });
    expect(resRecruiter.status).toBe(200);
    const recData = await resRecruiter.json();
    expect(recData.user.email).toBe('recruiter@demo.com');
    expect(recData.user.accountType).toBe('organisation');
    expect(recData.user.profileComplete).toBe(true);
    expect(recData.token).toBeDefined();
  });

  it('(b) the recruiter signup -> onboarding -> dashboard flow works', async () => {
    const email = `flow_recruiter_${Date.now()}@test.com`;

    // 1. Signup
    const resSignup = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Lead Recruiter',
        email,
        password: 'password123',
      }),
    });
    expect(resSignup.status).toBe(200);
    const signupData = await resSignup.json();
    expect(signupData.user.profileComplete).toBe(false);
    const authHdr = `Bearer ${signupData.token}`;

    // 2. Onboarding (profile completion)
    const resProfile = await app.request('/api/me/profile', {
      method: 'PUT',
      headers: { Authorization: authHdr, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'organisation',
        fullName: 'Lead Recruiter',
        designation: 'Head of Talent Acquisition',
        company: 'Stripe India',
        companySize: '51-200',
        industry: 'Fintech',
        location: 'Bengaluru',
        hiringFor: ['Backend Engineer', 'React Lead'],
      }),
    });
    expect(resProfile.status).toBe(200);
    const profileData = await resProfile.json();
    expect(profileData.user.profileComplete).toBe(true);
    expect(profileData.user.profile.company).toBe('Stripe India');

    // 3. Dashboard access (/api/me)
    const resMe = await app.request('/api/me', {
      headers: { Authorization: authHdr },
    });
    expect(resMe.status).toBe(200);
    const meData = await resMe.json();
    expect(meData.user.profileComplete).toBe(true);
    expect(meData.user.name).toBe('Lead Recruiter');
    expect(meData.user.accountType).toBe('organisation');
  });

  it('(c) a candidate-type login request is rejected cleanly', async () => {
    const candEmail = `legacy_candidate_${Date.now()}@test.com`;
    const candId = `cand_legacy_${Date.now()}`;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const enc = new TextEncoder();
    const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
    const key = await crypto.subtle.importKey('raw', enc.encode('password123'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 60_000 }, key, 256);
    const passwordHash = b64(bits);

    // Inject legacy candidate directly into KV
    await kv.set(`user:email:${candEmail}`, candId);
    await kv.set(
      `user:${candId}`,
      JSON.stringify({
        id: candId,
        email: candEmail,
        name: 'Old Candidate',
        accountType: 'candidate',
        profile: null,
        profileComplete: true,
        createdAt: Date.now(),
        passwordHash,
        salt: b64(salt),
      })
    );

    // Attempt login as candidate
    const resCandLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: candEmail, password: 'password123' }),
    });
    expect(resCandLogin.status).toBe(403);
    const err = await resCandLogin.json();
    expect(err.error).toBe('This account type is no longer supported. Please create a recruiter account.');
  });

  it('(d) the landing and auth pages show no candidate/fresher/student UI', () => {
    const authPath = path.resolve(process.cwd(), 'src/pages/Auth.tsx');
    const landingPath = path.resolve(process.cwd(), 'src/pages/Landing.tsx');

    const authContent = fs.readFileSync(authPath, 'utf8');
    const landingContent = fs.readFileSync(landingPath, 'utf8');

    const forbiddenTerms = [
      'fresher',
      'Fresher',
      'candidate@demo',
      'Candidates tab',
      'I’m a candidate',
      'looking for a job',
      'CandidateProfile',
      'workStatus',
    ];

    for (const term of forbiddenTerms) {
      expect(authContent).not.toContain(term);
      expect(landingContent).not.toContain(term);
    }

    // Verify recruiter-only text is present
    expect(authContent).toContain('Recruiter sign in');
    expect(authContent).toContain('Create recruiter account');
    expect(authContent).not.toContain('Candidates');

    expect(landingContent).toContain('Start hiring');
    expect(landingContent).not.toContain('I’m looking for a job');
    expect(landingContent).not.toContain('#audiences');
  });

  it('B.5 JWT token verification: missing/tampered/expired gets 401; public routes stay open', async () => {
    // Public routes work without token
    const resHealth = await app.request('/api/health');
    expect(resHealth.status).toBe(200);

    // Protected route /api/me without token -> 401
    const resNoToken = await app.request('/api/me');
    expect(resNoToken.status).toBe(401);
    const noTokErr = await resNoToken.json();
    expect(noTokErr.error).toBe('Sign in to continue.');

    // Tampered token -> 401
    const resTampered = await app.request('/api/me', {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature' },
    });
    expect(resTampered.status).toBe(401);
    const tamperedErr = await resTampered.json();
    expect(tamperedErr.error).toBe('Your session expired. Sign in again.');

    // Expired token -> 401
    const expToken = await sign(
      { sub: 'some-user', email: 'test@demo.com', type: 'organisation', exp: Math.floor(Date.now() / 1000) - 60 },
      secret,
      'HS256'
    );
    const resExpired = await app.request('/api/me', {
      headers: { Authorization: `Bearer ${expToken}` },
    });
    expect(resExpired.status).toBe(401);
    const expErr = await resExpired.json();
    expect(expErr.error).toBe('Your session expired. Sign in again.');
  });

  it('B.6 Organisation profile validation: empty company or hiringFor gets 400; valid profile sets profileComplete', async () => {
    const email = `profile_val_${Date.now()}@test.com`;
    const signupRes = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Profile Tester',
        email,
        password: 'password123',
      }),
    });
    const { token } = await signupRes.json();
    const authHdr = `Bearer ${token}`;

    // 1. Missing / empty hiringFor -> 400
    const resEmptyHiring = await app.request('/api/me/profile', {
      method: 'PUT',
      headers: { Authorization: authHdr, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'organisation',
        fullName: 'Profile Tester',
        designation: 'Tech Recruiter',
        company: 'Acme Inc',
        companySize: '11-50',
        industry: 'Tech',
        location: 'Bengaluru',
        hiringFor: [],
      }),
    });
    expect(resEmptyHiring.status).toBe(400);

    // 2. Short designation -> 400
    const resShortDesig = await app.request('/api/me/profile', {
      method: 'PUT',
      headers: { Authorization: authHdr, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'organisation',
        fullName: 'Profile Tester',
        designation: 'A',
        company: 'Acme Inc',
        companySize: '11-50',
        industry: 'Tech',
        location: 'Bengaluru',
        hiringFor: ['Engineers'],
      }),
    });
    expect(resShortDesig.status).toBe(400);

    // 3. Valid organisation profile -> 200
    const resValid = await app.request('/api/me/profile', {
      method: 'PUT',
      headers: { Authorization: authHdr, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'organisation',
        fullName: 'Profile Tester',
        designation: 'Tech Recruiter',
        company: 'Acme Inc',
        companySize: '11-50',
        industry: 'Tech',
        location: 'Bengaluru',
        hiringFor: ['Engineers'],
      }),
    });
    expect(resValid.status).toBe(200);
    const updated = await resValid.json();
    expect(updated.user.profileComplete).toBe(true);
    expect(updated.user.profile.company).toBe('Acme Inc');
  });
});
