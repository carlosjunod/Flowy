import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

function buildAasa(): Record<string, unknown> {
  const teamId = process.env.APPLE_TEAM_ID ?? 'TEAMIDMISSING';
  const bundleId = process.env.APPLE_CLIENT_ID ?? 'app.tryflowy.app';
  const appID = `${teamId}.${bundleId}`;

  return {
    applinks: {
      apps: [],
      details: [
        {
          appID,
          appIDs: [appID],
          paths: ['/item/*', '/chat', '/inbox', '/settings', 'NOT /login', 'NOT /api/*'],
          components: [
            { '/': '/item/*' },
            { '/': '/chat' },
            { '/': '/inbox' },
            { '/': '/settings' },
          ],
        },
      ],
    },
    webcredentials: {
      apps: [appID],
    },
  };
}

export function GET(): NextResponse {
  const body = buildAasa();
  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
