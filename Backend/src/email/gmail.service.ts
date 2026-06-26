/**
 * Gmail API integration (§11.12) — the two-way 1:1 reply channel only.
 * NEVER used for bulk/campaign sending (that's ResendEmailService).
 *
 * One Gmail mailbox is connected per Business, by the owner, via OAuth.
 * Reuses the SAME Google OAuth app credentials as Google Ads (GOOGLE_CLIENT_ID/
 * GOOGLE_CLIENT_SECRET) — same pattern as AdOAuthService, separate redirect URI.
 *
 * Required scopes: gmail.send + gmail.readonly.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { GmailConnectionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt } from '../common/crypto';
import { NotificationsService } from '../notifications/notifications.service';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

const REFRESH_WINDOW_MS = 5 * 60 * 1000;

export interface ParsedInboundMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: Date;
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Credentials (reused from Google Ads) ────────────────────────────────────

  private getCredentials() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Gmail is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.',
      );
    }
    return { clientId, clientSecret, redirectUri: `${appUrl}/email/gmail/callback` };
  }

  // ── OAuth state signing (mirrors AdOAuthService) ────────────────────────────

  private buildState(businessId: string): string {
    const ts = Date.now().toString();
    const payload = `${businessId}:${ts}`;
    const secret = process.env.JWT_SECRET ?? '';
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
  }

  private verifyState(state: string): { businessId: string } {
    let raw: string;
    try {
      raw = Buffer.from(state, 'base64url').toString('utf8');
    } catch {
      throw new BadRequestException('Invalid OAuth state (decode error)');
    }
    const parts = raw.split(':');
    if (parts.length !== 3) throw new BadRequestException('Invalid OAuth state (format)');
    const [businessId, ts, sig] = parts;
    const secret = process.env.JWT_SECRET ?? '';
    const expected = crypto.createHmac('sha256', secret).update(`${businessId}:${ts}`).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      throw new BadRequestException('Invalid OAuth state (signature mismatch)');
    }
    if (Date.now() - parseInt(ts, 10) > 15 * 60 * 1000) {
      throw new BadRequestException('OAuth state expired — please try connecting again');
    }
    return { businessId };
  }

  // ── Connect / callback / disconnect ─────────────────────────────────────────

  buildAuthUrl(businessId: string): string {
    const { clientId, redirectUri } = this.getCredentials();
    const state = this.buildState(businessId);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: GMAIL_SCOPES,
      state,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<{ businessId: string; emailAddress: string }> {
    const { businessId } = this.verifyState(state);
    const { clientId, clientSecret, redirectUri } = this.getCredentials();

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenRes = await this.jsonFetch<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    }>(GOOGLE_TOKEN_URL, { method: 'POST', body });

    if (!tokenRes.refresh_token) {
      throw new BadRequestException(
        'Google did not return a refresh token. Disconnect any prior Gmail access for this app at myaccount.google.com/permissions and try connecting again.',
      );
    }

    const profile = await this.jsonFetch<{ emailAddress: string; historyId: string }>(
      `${GMAIL_API}/profile`,
      { headers: { Authorization: `Bearer ${tokenRes.access_token}` } },
    );

    const tokenExpiresAt = new Date(Date.now() + tokenRes.expires_in * 1000);

    await this.prisma.gmailConnection.upsert({
      where: { businessId },
      create: {
        businessId,
        emailAddress: profile.emailAddress,
        accessToken: encrypt(tokenRes.access_token),
        refreshToken: encrypt(tokenRes.refresh_token),
        tokenExpiresAt,
        historyId: profile.historyId,
        status: GmailConnectionStatus.connected,
      },
      update: {
        emailAddress: profile.emailAddress,
        accessToken: encrypt(tokenRes.access_token),
        refreshToken: encrypt(tokenRes.refresh_token),
        tokenExpiresAt,
        historyId: profile.historyId,
        status: GmailConnectionStatus.connected,
      },
    });

    return { businessId, emailAddress: profile.emailAddress };
  }

  async getConnection(businessId: string) {
    const conn = await this.prisma.gmailConnection.findUnique({
      where: { businessId },
      select: { emailAddress: true, status: true, createdAt: true, updatedAt: true },
    });
    return conn;
  }

  async disconnect(businessId: string): Promise<void> {
    const result = await this.prisma.gmailConnection.deleteMany({ where: { businessId } });
    if (!result.count) throw new BadRequestException('No Gmail connection found for this business.');
  }

  // ── Token refresh ────────────────────────────────────────────────────────────

  private async getValidAccessToken(businessId: string): Promise<string> {
    const conn = await this.prisma.gmailConnection.findUnique({ where: { businessId } });
    if (!conn || conn.status !== GmailConnectionStatus.connected) {
      throw new BadRequestException('Gmail is not connected for this business.');
    }

    const needsRefresh =
      !conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS;
    if (!needsRefresh) return decrypt(conn.accessToken);

    const { clientId, clientSecret } = this.getCredentials();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decrypt(conn.refreshToken),
    });

    let res: { access_token: string; expires_in: number };
    try {
      res = await this.jsonFetch<{ access_token: string; expires_in: number }>(GOOGLE_TOKEN_URL, {
        method: 'POST',
        body,
      });
    } catch (err) {
      this.logger.warn(`Gmail token refresh failed for business ${businessId}: ${err}`);
      await this.prisma.gmailConnection.update({
        where: { businessId },
        data: { status: GmailConnectionStatus.error },
      });
      throw new BadRequestException('Gmail token refresh failed. Please reconnect Gmail in Settings.');
    }

    const tokenExpiresAt = new Date(Date.now() + res.expires_in * 1000);
    await this.prisma.gmailConnection.update({
      where: { businessId },
      data: { accessToken: encrypt(res.access_token), tokenExpiresAt, status: GmailConnectionStatus.connected },
    });
    return res.access_token;
  }

  // ── Polling for replies (§ Part 3) — called only by the reminders cron, never the frontend ──

  async pollAll(): Promise<void> {
    const connections = await this.prisma.gmailConnection.findMany({
      where: { status: GmailConnectionStatus.connected },
    });
    for (const conn of connections) {
      try {
        await this.pollOne(conn.businessId);
      } catch (err) {
        this.logger.warn(`Gmail poll failed for business ${conn.businessId}: ${err}`);
      }
    }
  }

  private async pollOne(businessId: string): Promise<void> {
    const conn = await this.prisma.gmailConnection.findUnique({ where: { businessId } });
    if (!conn || conn.status !== GmailConnectionStatus.connected) return;

    const accessToken = await this.getValidAccessToken(businessId);
    const headers = { Authorization: `Bearer ${accessToken}` };

    if (!conn.historyId) {
      // First poll after connect — seed the cursor only, don't backfill the whole mailbox.
      const profile = await this.jsonFetch<{ historyId: string }>(`${GMAIL_API}/profile`, { headers });
      await this.prisma.gmailConnection.update({
        where: { businessId },
        data: { historyId: profile.historyId },
      });
      return;
    }

    let historyRes: {
      history?: Array<{ messagesAdded?: Array<{ message: { id: string; threadId: string } }> }>;
      historyId: string;
    };
    try {
      historyRes = await this.jsonFetch(
        `${GMAIL_API}/history?startHistoryId=${conn.historyId}&historyTypes=messageAdded`,
        { headers },
      );
    } catch (err) {
      // historyId too old (404) — resync the cursor without backfilling.
      this.logger.warn(`Gmail history.list failed for business ${businessId}, resyncing cursor: ${err}`);
      const profile = await this.jsonFetch<{ historyId: string }>(`${GMAIL_API}/profile`, { headers });
      await this.prisma.gmailConnection.update({ where: { businessId }, data: { historyId: profile.historyId } });
      return;
    }

    const messageIds = new Set<string>();
    for (const h of historyRes.history ?? []) {
      for (const added of h.messagesAdded ?? []) {
        messageIds.add(added.message.id);
      }
    }

    for (const messageId of messageIds) {
      await this.ingestMessage(businessId, conn.emailAddress, messageId, headers);
    }

    await this.prisma.gmailConnection.update({
      where: { businessId },
      data: { historyId: historyRes.historyId },
    });
  }

  private async ingestMessage(
    businessId: string,
    ownMailbox: string,
    messageId: string,
    headers: Record<string, string>,
  ): Promise<void> {
    // Already ingested (e.g. our own outbound send echoed back in history)
    const existing = await this.prisma.emailMessage.findUnique({ where: { gmailMessageId: messageId } });
    if (existing) return;

    const raw = await this.jsonFetch<GmailMessageResource>(`${GMAIL_API}/messages/${messageId}?format=full`, {
      headers,
    });

    const parsed = this.parseMessage(raw);
    if (!parsed) return;

    // Skip messages we sent ourselves (direction is inbound-only here; outbound rows
    // are created synchronously by sendReply / campaign sends).
    const fromAddr = extractEmail(parsed.from);
    if (fromAddr.toLowerCase() === ownMailbox.toLowerCase()) return;

    const customer = await this.prisma.customer.findFirst({
      where: { businessId, email: { equals: fromAddr, mode: 'insensitive' } },
      select: { id: true, assignedToId: true, customerName: true },
    });

    await this.prisma.emailMessage.create({
      data: {
        businessId,
        customerId: customer?.id ?? null,
        direction: 'inbound',
        gmailMessageId: parsed.gmailMessageId,
        gmailThreadId: parsed.gmailThreadId,
        from: parsed.from,
        to: parsed.to,
        subject: parsed.subject,
        bodyText: parsed.bodyText,
        bodyHtml: parsed.bodyHtml,
        receivedAt: parsed.receivedAt,
      },
    });

    if (customer) {
      await this.notifications.create({
        businessId,
        targetUserId: customer.assignedToId,
        type: 'email_reply',
        message: `New reply from ${customer.customerName}`,
        relatedId: customer.id,
      });
    }
    // Unmatched messages are surfaced via GET /email/threads/unmatched — no notification
    // target exists yet since there's no assigned salesperson.
  }

  // ── Sending a 1:1 reply (§ Part 5) — single recipient only, never bulk ──────

  async sendReply(
    businessId: string,
    params: {
      to: string;
      subject: string;
      bodyHtml: string;
      threadId?: string;
      inReplyToMessageId?: string;
      references?: string;
    },
  ): Promise<{ gmailMessageId: string; gmailThreadId: string }> {
    const conn = await this.prisma.gmailConnection.findUnique({ where: { businessId } });
    if (!conn || conn.status !== GmailConnectionStatus.connected) {
      throw new BadRequestException('Gmail is not connected for this business.');
    }
    const accessToken = await this.getValidAccessToken(businessId);

    const headerLines = [
      `From: ${conn.emailAddress}`,
      `To: ${params.to}`,
      `Subject: ${encodeMimeSubject(params.subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
    ];
    if (params.inReplyToMessageId) headerLines.push(`In-Reply-To: ${params.inReplyToMessageId}`);
    if (params.references) headerLines.push(`References: ${params.references}`);

    const rawMessage = `${headerLines.join('\r\n')}\r\n\r\n${params.bodyHtml}`;
    const encoded = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const sendBody: Record<string, unknown> = { raw: encoded };
    if (params.threadId) sendBody.threadId = params.threadId;

    const res = await this.jsonFetch<{ id: string; threadId: string }>(`${GMAIL_API}/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(sendBody),
    });

    return { gmailMessageId: res.id, gmailThreadId: res.threadId };
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private parseMessage(raw: GmailMessageResource): ParsedInboundMessage | null {
    const headers = raw.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    const { text, html } = extractBody(raw.payload);

    return {
      gmailMessageId: raw.id,
      gmailThreadId: raw.threadId,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      bodyText: text,
      bodyHtml: html,
      receivedAt: new Date(Number(raw.internalDate) || Date.now()),
    };
  }

  private async jsonFetch<T>(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: URLSearchParams | string },
  ): Promise<T> {
    const options: RequestInit = {
      method: init?.method ?? 'GET',
      headers:
        init?.headers ?? (init?.body instanceof URLSearchParams ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      body: init?.body?.toString(),
    };
    const res = await fetch(url, options);
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const googleMsg =
        (json.error_description as string | undefined) ??
        ((json.error as Record<string, unknown> | undefined)?.message as string | undefined) ??
        (json.error as string | undefined);
      throw new Error(googleMsg ?? `HTTP ${res.status}`);
    }
    return json as T;
  }
}

// ── Module-level parsing helpers ──────────────────────────────────────────────

interface GmailMessageResource {
  id: string;
  threadId: string;
  internalDate: string;
  payload?: GmailPart;
}

interface GmailPart {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailPart[];
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractBody(part: GmailPart | undefined): { text: string; html: string } {
  let text = '';
  let html = '';
  if (!part) return { text, html };

  const walk = (p: GmailPart) => {
    if (p.mimeType === 'text/plain' && p.body?.data) text = text || decodeBase64Url(p.body.data);
    if (p.mimeType === 'text/html' && p.body?.data) html = html || decodeBase64Url(p.body.data);
    for (const child of p.parts ?? []) walk(child);
  };
  walk(part);

  if (!text && !html && part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (part.mimeType === 'text/html') html = decoded;
    else text = decoded;
  }
  return { text, html };
}

function extractEmail(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/);
  return (match ? match[1] : headerValue).trim();
}

function encodeMimeSubject(subject: string): string {
  // Encode as UTF-8 base64 (RFC 2047) so non-ASCII subjects survive transit.
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}
