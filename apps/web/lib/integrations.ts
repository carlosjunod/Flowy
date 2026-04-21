import PocketBase, { ClientResponseError } from 'pocketbase';

export type IntegrationProvider = 'google';
export type IntegrationStatus = 'active' | 'revoked' | 'error';

export interface IntegrationRecord {
  id: string;
  user: string;
  provider: IntegrationProvider;
  provider_sub?: string;
  provider_email?: string;
  access_token?: string;
  refresh_token?: string;
  access_token_expires_at?: string;
  scopes?: string[];
  last_sync_at?: string;
  last_history_id?: string;
  status: IntegrationStatus;
  error_msg?: string;
  created: string;
  updated: string;
}

function pbServer(): PocketBase {
  return new PocketBase(process.env.PB_URL ?? process.env.NEXT_PUBLIC_PB_URL ?? 'http://localhost:8090');
}

async function authAdmin(pb: PocketBase): Promise<void> {
  const email = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD are required');
  await pb.admins.authWithPassword(email, password);
}

export async function getAdminPb(): Promise<PocketBase> {
  const pb = pbServer();
  await authAdmin(pb);
  return pb;
}

export async function findIntegration(
  pb: PocketBase,
  userId: string,
  provider: IntegrationProvider,
): Promise<IntegrationRecord | null> {
  try {
    const safeUser = userId.replace(/"/g, '');
    const record = await pb
      .collection('integrations')
      .getFirstListItem<IntegrationRecord>(`user = "${safeUser}" && provider = "${provider}"`);
    return record;
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

export interface UpsertIntegrationInput {
  userId: string;
  provider: IntegrationProvider;
  providerSub?: string;
  providerEmail?: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: Date;
  scopes: string[];
}

export async function upsertIntegration(
  pb: PocketBase,
  input: UpsertIntegrationInput,
): Promise<IntegrationRecord> {
  const existing = await findIntegration(pb, input.userId, input.provider);
  const data: Record<string, unknown> = {
    user: input.userId,
    provider: input.provider,
    provider_sub: input.providerSub ?? '',
    provider_email: input.providerEmail ?? '',
    access_token: input.accessToken,
    access_token_expires_at: input.accessTokenExpiresAt.toISOString(),
    scopes: input.scopes,
    status: 'active',
    error_msg: '',
  };
  // Only overwrite refresh_token when Google returned one — otherwise preserve
  // the existing value (refresh tokens are issued once per consent grant).
  if (input.refreshToken) data.refresh_token = input.refreshToken;

  if (existing) {
    return pb.collection('integrations').update<IntegrationRecord>(existing.id, data);
  }
  if (!input.refreshToken) {
    // First-time connect without a refresh token means we'll lose access the
    // moment the short-lived access token expires — treat as configuration bug.
    throw new Error('REFRESH_TOKEN_REQUIRED');
  }
  data.refresh_token = input.refreshToken;
  return pb.collection('integrations').create<IntegrationRecord>(data);
}

export async function deleteIntegration(pb: PocketBase, id: string): Promise<void> {
  await pb.collection('integrations').delete(id);
}

export async function markIntegrationError(
  pb: PocketBase,
  id: string,
  message: string,
): Promise<void> {
  await pb.collection('integrations').update(id, {
    status: 'error',
    error_msg: message.slice(0, 500),
  });
}
