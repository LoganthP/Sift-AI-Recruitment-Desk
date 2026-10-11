import { describe, it, expect } from 'vitest';
import app from '../api/_lib/app';
import { sign } from 'hono/jwt';

describe('C. Saved Searches (History)', () => {
  const secret = process.env.AUTH_SECRET || 'sift-dev-secret-change-me';

  async function createToken(sub: string, email: string) {
    const token = await sign(
      { sub, email, type: 'organisation', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
      'HS256'
    );
    return `Bearer ${token}`;
  }

  it('C.1 create -> save -> rename -> list -> get -> delete with accurate summary computation', async () => {
    const userA = await createToken('user-a-1', 'usera1@test.com');

    // 1. Create project
    const resCreate = await app.request('/api/projects', {
      method: 'POST',
      headers: { Authorization: userA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Frontend Search' }),
    });
    expect(resCreate.status).toBe(200);
    const created = await resCreate.json();
    const pid = created.project.id;
    expect(pid).toBeDefined();
    expect(created.project.title).toBe('Frontend Search');

    // 2. Save project with state (JD, 2 ready CVs, ranking with recruiter override score, questions, market, strings)
    const stateData = {
      step: 4,
      jd: { role: 'Senior React Dev', keySkills: ['React', 'TypeScript'] },
      cvs: [
        { id: 'cv-1', fileName: 'alice.pdf', status: 'ready' },
        { id: 'cv-2', fileName: 'bob.docx', status: 'ready' },
        { id: 'cv-3', fileName: 'pending.pdf', status: 'uploading' }, // not ready
      ],
      ranking: {
        rankedAt: new Date().toISOString(),
        results: [
          { id: 'cv-1', nameGuess: 'Alice', score: 80, override: { score: 95, note: 'Great presentation' } },
          { id: 'cv-2', nameGuess: 'Bob', score: 88 },
        ],
      },
      questions: { questions: ['Q1'] },
      market: { insights: [] },
      strings: { linkedin: {} },
    };

    const resSave = await app.request(`/api/projects/${pid}`, {
      method: 'PUT',
      headers: { Authorization: userA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: stateData, title: 'Updated Frontend Search' }),
    });
    expect(resSave.status).toBe(200);
    const saved = await resSave.json();
    const summary = saved.project;
    expect(summary.title).toBe('Updated Frontend Search');
    expect(summary.role).toBe('Senior React Dev');
    expect(summary.candidates).toBe(2); // only ready CVs
    expect(summary.top).toEqual({ name: 'Alice', score: 95 }); // 95 due to override (beats Bob's 88)
    expect(summary.completed).toBe(7); // all 7 steps completed
    expect(summary.updatedAt).toBeGreaterThan(0);

    // 3. Rename project
    const resRename = await app.request(`/api/projects/${pid}`, {
      method: 'PATCH',
      headers: { Authorization: userA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed Search' }),
    });
    expect(resRename.status).toBe(200);
    const renamed = await resRename.json();
    expect(renamed.project.title).toBe('Renamed Search');

    // 4. List projects
    const resList = await app.request('/api/projects', {
      headers: { Authorization: userA },
    });
    expect(resList.status).toBe(200);
    const listed = await resList.json();
    expect(listed.projects.some((p: any) => p.id === pid && p.title === 'Renamed Search')).toBe(true);

    // 5. Get project
    const resGet = await app.request(`/api/projects/${pid}`, {
      headers: { Authorization: userA },
    });
    expect(resGet.status).toBe(200);
    const retrieved = await resGet.json();
    expect(retrieved.project.id).toBe(pid);
    expect(retrieved.project.data.jd.role).toBe('Senior React Dev');

    // 6. Delete project
    const resDel = await app.request(`/api/projects/${pid}`, {
      method: 'DELETE',
      headers: { Authorization: userA },
    });
    expect(resDel.status).toBe(200);

    // Get deleted project -> 404
    const resGetAfterDel = await app.request(`/api/projects/${pid}`, {
      headers: { Authorization: userA },
    });
    expect(resGetAfterDel.status).toBe(404);
  });

  it('C.2 User A can never read, rename or delete User B searches (returns 404)', async () => {
    const userA = await createToken('user-isolated-a', 'usera@isolated.com');
    const userB = await createToken('user-isolated-b', 'userb@isolated.com');

    // User A creates a project
    const resCreate = await app.request('/api/projects', {
      method: 'POST',
      headers: { Authorization: userA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: "User A's Private Search" }),
    });
    const { project } = await resCreate.json();
    const pid = project.id;

    // User B attempts to read -> 404
    const resGetB = await app.request(`/api/projects/${pid}`, {
      headers: { Authorization: userB },
    });
    expect(resGetB.status).toBe(404);

    // User B attempts to rename -> 404
    const resRenameB = await app.request(`/api/projects/${pid}`, {
      method: 'PATCH',
      headers: { Authorization: userB, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hacked by B' }),
    });
    expect(resRenameB.status).toBe(404);

    // User B attempts to delete -> User A's project remains untouched
    await app.request(`/api/projects/${pid}`, {
      method: 'DELETE',
      headers: { Authorization: userB },
    });
    const resCheckA = await app.request(`/api/projects/${pid}`, {
      headers: { Authorization: userA },
    });
    expect(resCheckA.status).toBe(200);
  });

  it('C.3 Save over size limit returns 413 with friendly message', async () => {
    const userA = await createToken('user-size-a', 'usersize@test.com');
    const resCreate = await app.request('/api/projects', {
      method: 'POST',
      headers: { Authorization: userA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Size Test Search' }),
    });
    const { project } = await resCreate.json();

    // Create payload exceeding 900,000 bytes
    const hugePayload = {
      largeBlob: 'x'.repeat(950_000),
    };

    const resSave = await app.request(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { Authorization: userA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: hugePayload }),
    });
    expect(resSave.status).toBe(413);
    const err = await resSave.json();
    expect(err.error).toBe('This search is too large to save. Remove some CVs and try again.');
  });

  it('C.4 Renaming with empty title or title > 90 characters returns 400', async () => {
    const userA = await createToken('user-rename-a', 'userrename@test.com');
    const resCreate = await app.request('/api/projects', {
      method: 'POST',
      headers: { Authorization: userA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Rename Constraints' }),
    });
    const { project } = await resCreate.json();

    // 1. Empty title
    const resEmpty = await app.request(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { Authorization: userA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    expect(resEmpty.status).toBe(400);
    const emptyErr = await resEmpty.json();
    expect(emptyErr.error).toBe('Title cannot be empty.');

    // 2. Over 90 characters
    const resLong = await app.request(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { Authorization: userA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'a'.repeat(95) }),
    });
    expect(resLong.status).toBe(400);
  });
});
