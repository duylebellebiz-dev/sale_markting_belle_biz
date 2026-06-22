/**
 * Handles OAuth connect flows for Facebook and Google Ads, and the resulting
 * AdConnection (one OAuth login / token, owned by one staff member) + AdAccount
 * (one fanpage / ad account discovered under that login) records.
 *
 * IMPORTANT — developer app setup required:
 *   Facebook: create an app at developers.facebook.com, add the Marketing API product,
 *             submit for App Review to get "ads_read" in production.
 *             Set: FB_APP_ID, FB_APP_SECRET
 *   Google:   create credentials at console.cloud.google.com, enable the Google Ads API,
 *             apply for a developer token in Google Ads Manager.
 *             Set: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN
 *
 * Redirect URIs you must register (must match exactly):
 *   Facebook: {APP_URL}/ads/connect/facebook/callback
 *   Google:   {APP_URL}/ads/connect/google/callback
 *
 * One login can expose MANY fanpages/ad accounts — a staff member who manages several
 * fanpages connects ONCE; every ad account found under that login becomes its own
 * AdAccount row, all sharing the same AdConnection (and therefore the same token).
 */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt } from '../common/crypto';
import { AdAccountStatus, AdProvider } from '@prisma/client';

const FB_API_VERSION = 'v21.0';
const FB_DIALOG_URL = `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth`;
const FB_TOKEN_URL = `https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`;
const FB_API = `https://graph.facebook.com/${FB_API_VERSION}`;
const FB_LONG_LIVED_SCOPE = 'ads_read';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_API = 'https://googleads.googleapis.com/v18';
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

// Tokens close to expiry within this window trigger a refresh attempt.
const REFRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class AdOAuthService {
  private readonly logger = new Logger(AdOAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── State signing ──────────────────────────────────────────────────────────
  // The OAuth state param encodes the businessId, the connecting userId, and a
  // timestamp, signed with HMAC-SHA256 using JWT_SECRET so we can verify it in the
  // callback without a DB lookup. Each staff member's own userId is carried through
  // so the resulting tokens are stored against THEM, not shared business-wide.

  private buildState(businessId: string, userId: string): string {
    const ts = Date.now().toString();
    const payload = `${businessId}:${userId}:${ts}`;
    const secret = process.env.JWT_SECRET ?? '';
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
  }

  private verifyState(state: string): { businessId: string; userId: string } {
    let raw: string;
    try {
      raw = Buffer.from(state, 'base64url').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid OAuth state (decode error)');
    }
    const parts = raw.split(':');
    if (parts.length !== 4) throw new BadRequestException('Invalid OAuth state (format)');
    const [businessId, userId, ts, sig] = parts;

    const secret = process.env.JWT_SECRET ?? '';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${businessId}:${userId}:${ts}`)
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      throw new BadRequestException('Invalid OAuth state (signature mismatch)');
    }
    // Reject states older than 15 minutes
    if (Date.now() - parseInt(ts, 10) > 15 * 60 * 1000) {
      throw new BadRequestException('OAuth state expired — please try connecting again');
    }
    return { businessId, userId };
  }

  // ── Credential helpers ─────────────────────────────────────────────────────

  private getFbCredentials() {
    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    if (!appId || !appSecret) {
      throw new BadRequestException(
        'Facebook Ads is not configured. Set FB_APP_ID and FB_APP_SECRET in your .env file. ' +
          'You must first create a developer app at developers.facebook.com and complete App Review.',
      );
    }
    return { appId, appSecret, redirectUri: `${appUrl}/ads/connect/facebook/callback` };
  }

  private getGoogleCredentials() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Google Ads is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file. ' +
          'You must create OAuth credentials at console.cloud.google.com, enable the Google Ads API, ' +
          'and apply for a developer token in your Google Ads Manager account.',
      );
    }
    return { clientId, clientSecret, redirectUri: `${appUrl}/ads/connect/google/callback` };
  }

  private getGoogleDeveloperToken(): string {
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!devToken) {
      throw new BadRequestException(
        'GOOGLE_ADS_DEVELOPER_TOKEN is not set. See .env.example for setup instructions.',
      );
    }
    return devToken;
  }

  // ── Facebook ───────────────────────────────────────────────────────────────

  buildFacebookAuthUrl(businessId: string, userId: string): string {
    const { appId, redirectUri } = this.getFbCredentials();
    const state = this.buildState(businessId, userId);
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      scope: FB_LONG_LIVED_SCOPE,
      state,
      response_type: 'code',
    });
    return `${FB_DIALOG_URL}?${params.toString()}`;
  }

  async handleFacebookCallback(code: string, state: string): Promise<{ businessId: string; userId: string; accountsFound: number }> {
    const { businessId, userId } = this.verifyState(state);
    const { appId, appSecret, redirectUri } = this.getFbCredentials();

    // 1. Exchange code → short-lived user access token
    const shortRes = await this.jsonFetch<{ access_token: string }>(
      `${FB_TOKEN_URL}?${new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      })}`,
    );

    // 2. Exchange short-lived token → long-lived token (~60 days)
    const longRes = await this.jsonFetch<{ access_token: string; expires_in?: number }>(
      `${FB_TOKEN_URL}?${new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortRes.access_token,
      })}`,
    );

    const expiresIn = longRes.expires_in ?? 55 * 24 * 3600; // default 55 days if not provided
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
    const accessToken = longRes.access_token;

    const connection = await this.upsertConnection({
      businessId,
      userId,
      provider: 'facebook',
      accessToken: encrypt(accessToken),
      refreshToken: '',
      tokenExpiresAt,
      status: 'active',
    });

    // 3. Discover every ad account this token can see — a staff member managing
    //    several fanpages gets all of them in one connect, no repeat OAuth needed.
    const discovered = await this.fbFetchAllPages<{ id: string; name: string }>(
      `${FB_API}/me/adaccounts`,
      { fields: 'id,name', access_token: accessToken, limit: '100' },
    );

    for (const acc of discovered) {
      await this.upsertDiscoveredAccount(businessId, connection.id, 'facebook', acc.id, acc.name);
    }

    return { businessId, userId, accountsFound: discovered.length };
  }

  // ── Google ─────────────────────────────────────────────────────────────────

  buildGoogleAuthUrl(businessId: string, userId: string): string {
    const { clientId, redirectUri } = this.getGoogleCredentials();
    const state = this.buildState(businessId, userId);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: GOOGLE_ADS_SCOPE,
      state,
      response_type: 'code',
      access_type: 'offline',   // required to receive a refresh_token
      prompt: 'consent',        // force consent so we always get refresh_token
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async handleGoogleCallback(code: string, state: string): Promise<{ businessId: string; userId: string; accountsFound: number }> {
    const { businessId, userId } = this.verifyState(state);
    const { clientId, clientSecret, redirectUri } = this.getGoogleCredentials();

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const res = await this.jsonFetch<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    }>(GOOGLE_TOKEN_URL, { method: 'POST', body });

    const tokenExpiresAt = new Date(Date.now() + res.expires_in * 1000);

    const connection = await this.upsertConnection({
      businessId,
      userId,
      provider: 'google',
      accessToken: encrypt(res.access_token),
      refreshToken: res.refresh_token ? encrypt(res.refresh_token) : '',
      tokenExpiresAt,
      status: 'active',
    });

    // Discover every Google Ads customer (account) accessible under this login.
    const devToken = this.getGoogleDeveloperToken();
    const headers = this.googleHeaders(res.access_token, devToken);
    let discoveredCount = 0;
    try {
      const listRes = await this.jsonFetch<{ resourceNames?: string[] }>(
        `${GOOGLE_API}/customers:listAccessibleCustomers`,
        { headers },
      );
      for (const resourceName of listRes.resourceNames ?? []) {
        const customerId = resourceName.replace('customers/', '').replace(/-/g, '');
        let accountName = customerId;
        try {
          const nameRes = await this.jsonFetch<{ results?: Array<{ customer?: { descriptiveName?: string } }> }>(
            `${GOOGLE_API}/customers/${customerId}/googleAds:search`,
            { method: 'POST', headers, body: JSON.stringify({ query: 'SELECT customer.descriptive_name FROM customer LIMIT 1' }) },
          );
          accountName = nameRes.results?.[0]?.customer?.descriptiveName ?? customerId;
        } catch { /* non-fatal — keep the bare customerId as the label */ }

        await this.upsertDiscoveredAccount(businessId, connection.id, 'google', customerId, accountName);
        discoveredCount++;
      }
    } catch (err) {
      this.logger.warn(`Failed to discover Google Ads accounts after connect: ${err}`);
      // The connection itself still succeeded — accounts can be (re)discovered on next sync attempt.
    }

    return { businessId, userId, accountsFound: discoveredCount };
  }

  // ── Token refresh ──────────────────────────────────────────────────────────

  /**
   * Returns a valid (possibly refreshed) access token for the given AdConnection row.
   * Throws BadRequestException with a clear message if the token is expired and cannot
   * be refreshed (e.g. Facebook — must re-auth).
   */
  async getValidAccessToken(connectionId: string): Promise<string> {
    const connection = await this.prisma.adConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });

    const needsRefresh =
      !connection.tokenExpiresAt ||
      connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS;

    if (!needsRefresh) {
      return decrypt(connection.accessToken);
    }

    if (connection.provider === 'google' && connection.refreshToken) {
      return this.refreshGoogleToken(connectionId, connection.refreshToken);
    }

    // Facebook (no refresh token) or Google without refresh token — must re-authenticate
    await this.markConnectionDisconnected(connectionId);

    const providerLabel = connection.provider === 'facebook' ? 'Facebook' : 'Google';
    throw new BadRequestException(
      `Your ${providerLabel} Ads connection has expired. Please reconnect via AI Settings → Ad Accounts.`,
    );
  }

  private async refreshGoogleToken(connectionId: string, encryptedRefreshToken: string): Promise<string> {
    const { clientId, clientSecret } = this.getGoogleCredentials();
    const refreshToken = decrypt(encryptedRefreshToken);

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    let res: { access_token: string; expires_in: number };
    try {
      res = await this.jsonFetch<{ access_token: string; expires_in: number }>(
        GOOGLE_TOKEN_URL,
        { method: 'POST', body },
      );
    } catch (err) {
      this.logger.warn(`Google token refresh failed for AdConnection ${connectionId}: ${err}`);
      await this.markConnectionDisconnected(connectionId);
      throw new BadRequestException(
        'Google Ads token refresh failed. Please reconnect via AI Settings → Ad Accounts.',
      );
    }

    const tokenExpiresAt = new Date(Date.now() + res.expires_in * 1000);
    await this.prisma.adConnection.update({
      where: { id: connectionId },
      data: { accessToken: encrypt(res.access_token), tokenExpiresAt, status: 'active' },
    });

    return res.access_token;
  }

  private async markConnectionDisconnected(connectionId: string): Promise<void> {
    await this.prisma.adConnection.update({ where: { id: connectionId }, data: { status: 'disconnected' } });
    await this.prisma.adAccount.updateMany({ where: { connectionId }, data: { status: 'disconnected' } });
  }

  // ── Connection listing / disconnect ─────────────────────────────────────────
  // A connection (OAuth login) belongs to exactly the staff member who created it.

  async listConnections(businessId: string, userId: string) {
    return this.prisma.adConnection.findMany({
      where: { businessId, userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        provider: true,
        tokenExpiresAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        adAccounts: { select: { id: true, accountName: true, externalAccountId: true, status: true } },
        // accessToken / refreshToken are NEVER returned
      },
    });
  }

  async disconnectConnection(connectionId: string, businessId: string, userId: string): Promise<void> {
    const result = await this.prisma.adConnection.updateMany({
      where: { id: connectionId, businessId, userId },
      data: { status: 'disconnected', accessToken: '', refreshToken: '' },
    });
    if (result.count === 0) throw new BadRequestException('Connection not found');
    await this.prisma.adAccount.updateMany({ where: { connectionId }, data: { status: 'disconnected' } });
  }

  // ── Account listing / visibility ────────────────────────────────────────────
  // A user sees an AdAccount if: they are the business owner, OR they own the
  // underlying connection, OR a connection owner / owner explicitly shared it
  // with them via AdAccountAccess.

  async listAccounts(businessId: string, userId: string, isOwner: boolean) {
    const where = isOwner
      ? { businessId }
      : {
          businessId,
          OR: [{ connection: { userId } }, { accessGrants: { some: { userId } } }],
        };

    return this.prisma.adAccount.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        connection: { select: { userId: true, status: true, tokenExpiresAt: true, user: { select: { fullName: true, email: true } } } },
        accessGrants: { select: { userId: true, user: { select: { fullName: true, email: true } } } },
      },
    });
  }

  /** Returns null when the caller (owner) can see everything, otherwise the list of visible AdAccount ids. */
  async visibleAdAccountIds(businessId: string, userId: string, isOwner: boolean): Promise<string[] | null> {
    if (isOwner) return null;
    const accounts = await this.prisma.adAccount.findMany({
      where: { businessId, OR: [{ connection: { userId } }, { accessGrants: { some: { userId } } }] },
      select: { id: true },
    });
    return accounts.map((a) => a.id);
  }

  async canAccessAccount(adAccountId: string, businessId: string, userId: string, isOwner: boolean): Promise<boolean> {
    if (isOwner) {
      return (await this.prisma.adAccount.count({ where: { id: adAccountId, businessId } })) > 0;
    }
    const count = await this.prisma.adAccount.count({
      where: {
        id: adAccountId,
        businessId,
        OR: [{ connection: { userId } }, { accessGrants: { some: { userId } } }],
      },
    });
    return count > 0;
  }

  /** Stop tracking ONE fanpage/ad account without touching the rest of the connection. */
  async disconnectAccount(adAccountId: string, businessId: string, userId: string, isOwner: boolean): Promise<void> {
    const where = isOwner
      ? { id: adAccountId, businessId }
      : { id: adAccountId, businessId, connection: { userId } };
    const result = await this.prisma.adAccount.updateMany({ where, data: { status: 'disconnected' } });
    if (result.count === 0) {
      throw new BadRequestException('Ad account not found, or you do not own the connection it belongs to.');
    }
  }

  // ── Sharing one fanpage with a teammate ─────────────────────────────────────
  // Only the owner of the business, or the staff member who connected it, can
  // grant/revoke a teammate's view — sharing must not be self-service for viewers.

  async shareAccount(adAccountId: string, granteeUserId: string, businessId: string, requesterId: string, isOwner: boolean) {
    await this.assertCanManageSharing(adAccountId, businessId, requesterId, isOwner);
    const grantee = await this.prisma.user.findFirst({ where: { id: granteeUserId, businessId } });
    if (!grantee) throw new BadRequestException('That staff member was not found in this business.');

    return this.prisma.adAccountAccess.upsert({
      where: { adAccountId_userId: { adAccountId, userId: granteeUserId } },
      create: { adAccountId, userId: granteeUserId },
      update: {},
    });
  }

  async revokeAccess(adAccountId: string, granteeUserId: string, businessId: string, requesterId: string, isOwner: boolean): Promise<void> {
    await this.assertCanManageSharing(adAccountId, businessId, requesterId, isOwner);
    await this.prisma.adAccountAccess.deleteMany({ where: { adAccountId, userId: granteeUserId } });
  }

  private async assertCanManageSharing(adAccountId: string, businessId: string, requesterId: string, isOwner: boolean): Promise<void> {
    if (isOwner) return;
    const owns = await this.prisma.adAccount.count({
      where: { id: adAccountId, businessId, connection: { userId: requesterId } },
    });
    if (owns === 0) {
      throw new BadRequestException('Only the business owner or the person who connected this account can manage sharing.');
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async upsertConnection(data: {
    businessId: string;
    userId: string;
    provider: AdProvider;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
    status: AdAccountStatus;
  }) {
    return this.prisma.adConnection.upsert({
      where: { userId_provider: { userId: data.userId, provider: data.provider } },
      create: data,
      update: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tokenExpiresAt: data.tokenExpiresAt,
        status: data.status,
      },
    });
  }

  private async upsertDiscoveredAccount(
    businessId: string,
    connectionId: string,
    provider: AdProvider,
    externalAccountId: string,
    accountName: string,
  ) {
    await this.prisma.adAccount.upsert({
      where: { connectionId_externalAccountId: { connectionId, externalAccountId } },
      create: { businessId, connectionId, provider, externalAccountId, accountName, status: 'active' },
      update: { accountName, status: 'active' },
    });
  }

  private googleHeaders(accessToken: string, devToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Thin fetch wrapper that throws a descriptive error when the response is not OK.
   */
  private async jsonFetch<T>(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: URLSearchParams | string },
  ): Promise<T> {
    const options: RequestInit = {
      method: init?.method ?? 'GET',
      headers: init?.headers ?? (init?.body instanceof URLSearchParams ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      body: init?.body?.toString(),
    };
    const res = await fetch(url, options);
    const json = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      // FB wraps errors in { error: { message, type, code } }
      // Google wraps in { error: '...', error_description: '...' } or { error: { message } }
      const fbMsg = (json.error as Record<string, unknown> | undefined)?.message as string | undefined;
      const googleMsg = json.error_description as string | undefined ?? json.error as string | undefined;
      const message = fbMsg ?? googleMsg ?? `HTTP ${res.status}`;
      this.logger.error(`OAuth HTTP error ${res.status} from ${url}: ${message}`);
      throw new BadRequestException(`Ad platform error: ${message}`);
    }
    return json as T;
  }

  private async fbFetchAllPages<T>(url: string, params: Record<string, string>): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | null = `${url}?${new URLSearchParams(params)}`;

    while (nextUrl) {
      const data = await this.jsonFetch<{ data: T[]; paging?: { next?: string } }>(nextUrl);
      results.push(...data.data);
      nextUrl = data.paging?.next ?? null;
    }

    return results;
  }
}
