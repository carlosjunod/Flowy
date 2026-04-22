const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  sent: boolean;
  reason?: string;
}

/**
 * Sends a push notification via Expo Push. Tokens are expected to be Expo push tokens
 * stored on the user record. Falls back to a no-op when the token is missing or when
 * Expo returns a ticket error, so a push failure never aborts digest generation.
 */
export async function sendPush(pushToken: string | undefined, payload: PushPayload): Promise<PushResult> {
  if (!pushToken) return { sent: false, reason: 'no_token' };

  const body = {
    to: pushToken,
    title: payload.title,
    body: payload.body,
    sound: 'default',
    priority: 'high',
    data: payload.data ?? {},
  };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { sent: false, reason: `http_${res.status}:${text.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => null)) as
      | { data?: { status?: string; message?: string } }
      | null;
    const status = json?.data?.status;
    if (status && status !== 'ok') {
      return { sent: false, reason: `ticket_${status}:${json?.data?.message ?? ''}` };
    }
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sent: false, reason: `exception:${msg}` };
  }
}
