import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROUTE = '../../apps/web/app/.well-known/apple-app-site-association/route.js';

describe('GET /.well-known/apple-app-site-association', () => {
  const originalTeamId = process.env.APPLE_TEAM_ID;
  const originalClientId = process.env.APPLE_CLIENT_ID;

  beforeEach(() => {
    process.env.APPLE_TEAM_ID = 'ABC1234XYZ';
    process.env.APPLE_CLIENT_ID = 'app.tryflowy.app';
  });

  afterEach(() => {
    if (originalTeamId === undefined) delete process.env.APPLE_TEAM_ID;
    else process.env.APPLE_TEAM_ID = originalTeamId;
    if (originalClientId === undefined) delete process.env.APPLE_CLIENT_ID;
    else process.env.APPLE_CLIENT_ID = originalClientId;
  });

  it('returns 200 with Content-Type: application/json', async () => {
    const { GET } = await import(ROUTE);
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  it('includes appID built from APPLE_TEAM_ID and APPLE_CLIENT_ID', async () => {
    const { GET } = await import(ROUTE);
    const res = GET();
    const body = await res.json();
    expect(body.applinks.details[0].appID).toBe('ABC1234XYZ.app.tryflowy.app');
    expect(body.applinks.details[0].appIDs).toEqual(['ABC1234XYZ.app.tryflowy.app']);
    expect(body.webcredentials.apps).toEqual(['ABC1234XYZ.app.tryflowy.app']);
  });

  it('declares deep link paths and excludes login + api', async () => {
    const { GET } = await import(ROUTE);
    const res = GET();
    const body = await res.json();
    const paths = body.applinks.details[0].paths as string[];
    expect(paths).toContain('/item/*');
    expect(paths).toContain('/chat');
    expect(paths).toContain('/inbox');
    expect(paths).toContain('NOT /login');
    expect(paths).toContain('NOT /api/*');
  });

  it('includes modern components array for iOS 13+ matching', async () => {
    const { GET } = await import(ROUTE);
    const res = GET();
    const body = await res.json();
    expect(body.applinks.details[0].components).toBeDefined();
    expect(body.applinks.details[0].components.length).toBeGreaterThan(0);
  });
});
