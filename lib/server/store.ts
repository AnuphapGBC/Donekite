import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseSaved, runFollowups, type State } from '../automation.ts';
import { createIndustrySettings, industries, type IndustryId } from '../industries.ts';
import { createPostgresDatabase, type Database, type SqlClient } from './database.ts';
import { AppError } from './errors.ts';
import { dummyPasswordHash, hashPassword, verifyPassword } from './passwords.ts';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');

type UserRow = { id: string; name: string; email: string; password_hash: string };
type SessionRow = { user_id: string; workspace_id: string };
type WorkspaceRow = { id: string; state: unknown; revision: number };
type InvitationRow = { token_hash: string; email: string; workspace_id: string; expires_at: number | string };
export type Identity = { user: { id: string; name: string; email: string }; workspace: { id: string; name: string; role: 'owner' | 'member' } };
export type Snapshot = { state: State; revision: number };
export type WorkspaceSession = Identity & Snapshot & { workspaces: Identity['workspace'][] };

async function first<T>(db: SqlClient, sql: string, values?: unknown[]): Promise<T | undefined> {
  return (await db.query<T>(sql, values)).rows[0];
}
function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === '23505';
}
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new AppError(400, 'Enter a valid email address.');
  return value.trim().toLowerCase();
}
function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw new AppError(400, label + ' is required and must be at most ' + maximum + ' characters.');
  return value.trim();
}
function passwordInput(value: unknown, registration = false): string {
  if (typeof value !== 'string' || value.length > 128 || value.length < (registration ? 12 : 1)) throw new AppError(400, registration ? 'Use a password between 12 and 128 characters.' : 'Enter your password.');
  return value;
}
function emptyState(now: number, industry: IndustryId = 'cleaning'): State {
  return { version: 1, now, leads: [], activity: [], rules: { draftQuote: true, followup: true, invoice: true }, settings: createIndustrySettings(industry) };
}

export class WorkspaceStore {
  private db: Database;
  private clock: () => number;
  constructor(database: Database, clock: () => number = Date.now) {
    this.db = database;
    this.clock = clock;
  }
  close() { return this.db.close(); }

  private async attempt(account: string) {
    const now = this.clock();
    // One UPSERT locks the account row; concurrent app instances share the same limit.
    const result = await first<{ attempts: number }>(this.db,
      'INSERT INTO donekite.auth_attempts AS current (account, attempts, started_at) VALUES ($1, 1, $2) ON CONFLICT(account) DO UPDATE SET attempts = CASE WHEN current.started_at <= $3 THEN 1 ELSE LEAST(current.attempts + 1, 11) END, started_at = CASE WHEN current.started_at <= $3 THEN EXCLUDED.started_at ELSE current.started_at END RETURNING attempts',
      [account, now, now - LOGIN_WINDOW_MS]);
    if (!result || result.attempts > 10) throw new AppError(429, 'Too many attempts. Try again in 15 minutes.');
  }

  private async issueSession(db: SqlClient, userId: string, workspaceId: string) {
    const secret = token();
    const expiresAt = this.clock() + SESSION_MS;
    await db.query('DELETE FROM donekite.sessions WHERE expires_at <= $1', [this.clock()]);
    await db.query('INSERT INTO donekite.sessions(token_hash, user_id, workspace_id, expires_at) VALUES ($1, $2, $3, $4)', [digest(secret), userId, workspaceId, expiresAt]);
    await db.query('INSERT INTO donekite.user_preferences(user_id, workspace_id) VALUES ($1, $2) ON CONFLICT(user_id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id', [userId, workspaceId]);
    return { token: secret, expiresAt };
  }

  async register(input: Record<string, unknown>) {
    const name = requiredText(input.name, 'Name', 100);
    const email = normalizeEmail(input.email);
    const password = passwordInput(input.password, true);
    const inviteToken = typeof input.inviteToken === 'string' ? input.inviteToken : undefined;
    const businessName = inviteToken ? undefined : requiredText(input.businessName, 'Business name', 100);
    const industry = input.industry ?? 'cleaning';
    if (typeof industry !== 'string' || !industries.some(preset => preset.id === industry)) throw new AppError(400, 'Choose an available industry.');
    await this.attempt('register:' + email);
    const passwordHash = await hashPassword(password);
    try {
      return await this.db.transaction(async db => {
        if (await first(db, 'SELECT id FROM donekite.users WHERE email = $1', [email])) throw new AppError(409, 'An account already exists for this email. Sign in instead.');
        const invitation = inviteToken ? await this.invitation(db, inviteToken, true) : undefined;
        if (invitation && invitation.email !== email) throw new AppError(400, 'Use the email address this invitation was sent to.');
        const userId = randomUUID();
        const workspaceId = invitation?.workspace_id ?? randomUUID();
        const now = this.clock();
        await db.query('INSERT INTO donekite.users(id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)', [userId, name, email, passwordHash, now]);
        if (!invitation) await db.query('INSERT INTO donekite.workspaces(id, name, state, created_at) VALUES ($1, $2, $3::jsonb, $4)', [workspaceId, businessName!, JSON.stringify(emptyState(now, industry as IndustryId)), now]);
        await db.query('INSERT INTO donekite.memberships(user_id, workspace_id, role) VALUES ($1, $2, $3)', [userId, workspaceId, invitation ? 'member' : 'owner']);
        if (invitation) await db.query('UPDATE donekite.invitations SET used_at = $1 WHERE token_hash = $2', [now, invitation.token_hash]);
        await db.query('DELETE FROM donekite.auth_attempts WHERE account = $1', ['register:' + email]);
        return this.issueSession(db, userId, workspaceId);
      });
    } catch (error) {
      // The unique constraint also covers two simultaneous registrations for one email.
      if (isUniqueViolation(error)) throw new AppError(409, 'An account already exists for this email. Sign in instead.');
      throw error;
    }
  }

  async login(input: Record<string, unknown>) {
    const email = normalizeEmail(input.email);
    const password = passwordInput(input.password);
    await this.attempt('login:' + email);
    const user = await first<UserRow>(this.db, 'SELECT id, name, email, password_hash FROM donekite.users WHERE email = $1', [email]);
    const matches = await verifyPassword(password, user?.password_hash ?? dummyPasswordHash);
    if (!user || !matches) throw new AppError(401, 'Email or password is incorrect.');
    return this.db.transaction(async db => {
      const membership = await first<{ workspace_id: string }>(db,
        "SELECT m.workspace_id FROM donekite.memberships m LEFT JOIN donekite.user_preferences p ON p.user_id = m.user_id WHERE m.user_id = $1 ORDER BY CASE WHEN p.workspace_id = m.workspace_id THEN 0 ELSE 1 END, CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.workspace_id LIMIT 1", [user.id]);
      if (!membership) throw new AppError(403, 'This account has no workspace.');
      await db.query('DELETE FROM donekite.auth_attempts WHERE account = $1', ['login:' + email]);
      return this.issueSession(db, user.id, membership.workspace_id);
    });
  }

  private async identityFrom(db: SqlClient, secret: string | undefined): Promise<Identity> {
    if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new AppError(401, 'Sign in to continue.');
    const session = await first<SessionRow>(db, 'SELECT user_id, workspace_id FROM donekite.sessions WHERE token_hash = $1 AND expires_at > $2', [digest(secret), this.clock()]);
    if (!session) throw new AppError(401, 'Your session has expired. Sign in again.');
    const user = await first<Identity['user']>(db, 'SELECT id, name, email FROM donekite.users WHERE id = $1', [session.user_id]);
    const workspace = await first<Identity['workspace']>(db, 'SELECT w.id, w.name, m.role FROM donekite.workspaces w JOIN donekite.memberships m ON m.workspace_id = w.id WHERE m.user_id = $1 AND w.id = $2', [session.user_id, session.workspace_id]);
    if (!user || !workspace) throw new AppError(401, 'Sign in to continue.');
    return { user, workspace };
  }
  identity(secret: string | undefined) { return this.identityFrom(this.db, secret); }

  async logout(secret: string | undefined) {
    if (secret) await this.db.query('DELETE FROM donekite.sessions WHERE token_hash = $1', [digest(secret)]);
  }

  private async snapshot(db: SqlClient, workspaceId: string): Promise<Snapshot> {
    // Every read-modify-write of one workspace holds this row lock until commit.
    const workspace = await first<WorkspaceRow>(db, 'SELECT id, state, revision FROM donekite.workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
    if (!workspace) throw new AppError(404, 'Workspace not found.');
    const state = parseSaved(JSON.stringify(workspace.state));
    if (!state) throw new AppError(500, 'Workspace data could not be loaded. Restore a database backup or contact your administrator.');
    state.now = this.clock();
    const refreshed = runFollowups(state);
    if (refreshed.activity.length !== state.activity.length) {
      await db.query('UPDATE donekite.workspaces SET state = $1::jsonb, revision = revision + 1 WHERE id = $2', [JSON.stringify(refreshed), workspaceId]);
      workspace.revision++;
    }
    return { state: refreshed, revision: workspace.revision };
  }

  readWorkspace(secret: string | undefined): Promise<WorkspaceSession> {
    return this.db.transaction(async db => {
      const identity = await this.identityFrom(db, secret);
      const { rows: workspaces } = await db.query<Identity['workspace']>('SELECT w.id, w.name, m.role FROM donekite.workspaces w JOIN donekite.memberships m ON m.workspace_id = w.id WHERE m.user_id = $1 ORDER BY w.name', [identity.user.id]);
      return { ...identity, workspaces, ...await this.snapshot(db, identity.workspace.id) };
    });
  }

  async switchWorkspace(secret: string | undefined, workspaceId: unknown) {
    if (typeof workspaceId !== 'string') throw new AppError(400, 'Choose a workspace.');
    return this.db.transaction(async db => {
      const identity = await this.identityFrom(db, secret);
      if (!await first(db, 'SELECT 1 FROM donekite.memberships WHERE user_id = $1 AND workspace_id = $2', [identity.user.id, workspaceId])) throw new AppError(403, 'You do not belong to this workspace.');
      await db.query('DELETE FROM donekite.sessions WHERE token_hash = $1', [digest(secret!)]);
      return this.issueSession(db, identity.user.id, workspaceId);
    });
  }

  async saveWorkspace(secret: string | undefined, value: unknown, revision: unknown): Promise<Snapshot> {
    if (!Number.isSafeInteger(revision) || (revision as number) < 0) throw new AppError(400, 'A valid workspace revision is required.');
    const state = parseSaved(JSON.stringify(value));
    if (!state || state.leads.length > 10000 || state.activity.length > 50000) throw new AppError(400, 'Workspace data is invalid or exceeds the supported record limit.');
    const result = await this.db.transaction(async db => {
      const identity = await this.identityFrom(db, secret);
      const current = await this.snapshot(db, identity.workspace.id);
      // Return the conflict from the transaction, preserving any newly due reminder.
      if (current.revision !== revision) return { conflict: current };
      state.now = this.clock();
      const next = runFollowups(state);
      await db.query('UPDATE donekite.workspaces SET state = $1::jsonb, revision = revision + 1 WHERE id = $2 AND revision = $3', [JSON.stringify(next), identity.workspace.id, revision]);
      return { state: next, revision: current.revision + 1 };
    });
    if (result.conflict) throw new AppError(409, 'This workspace changed in another tab or by a teammate. Review the latest version and try again.', result.conflict);
    return { state: result.state!, revision: result.revision! };
  }

  private async invitation(db: SqlClient, secret: string, lock = false): Promise<InvitationRow> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new AppError(400, 'This invitation is invalid or has expired.');
    const invite = await first<InvitationRow>(db,
      'SELECT token_hash, email, workspace_id, expires_at FROM donekite.invitations WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2' + (lock ? ' FOR UPDATE' : ''), [digest(secret), this.clock()]);
    if (!invite) throw new AppError(400, 'This invitation is invalid or has expired.');
    return invite;
  }

  async invitationDetails(secret: string) {
    const invite = await this.invitation(this.db, secret);
    const workspace = await first<{ name: string }>(this.db, 'SELECT name FROM donekite.workspaces WHERE id = $1', [invite.workspace_id]);
    if (!workspace) throw new AppError(400, 'This invitation is invalid or has expired.');
    return { email: invite.email, workspaceName: workspace.name, expiresAt: Number(invite.expires_at) };
  }

  async createInvitation(secret: string | undefined, value: unknown) {
    const email = normalizeEmail(value);
    return this.db.transaction(async db => {
      const identity = await this.identityFrom(db, secret);
      if (identity.workspace.role !== 'owner') throw new AppError(403, 'Only the workspace owner can invite teammates.');
      if (await first(db, 'SELECT 1 FROM donekite.memberships m JOIN donekite.users u ON u.id = m.user_id WHERE m.workspace_id = $1 AND u.email = $2', [identity.workspace.id, email])) throw new AppError(409, 'This person already belongs to your workspace.');
      const inviteToken = token();
      const expiresAt = this.clock() + SESSION_MS;
      // The partial unique index makes simultaneous re-invites replace one pending token.
      await db.query('INSERT INTO donekite.invitations(token_hash, email, workspace_id, expires_at) VALUES ($1, $2, $3, $4) ON CONFLICT(workspace_id, email) WHERE used_at IS NULL DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at', [digest(inviteToken), email, identity.workspace.id, expiresAt]);
      return { token: inviteToken, email, expiresAt };
    });
  }

  async acceptInvitation(secret: string | undefined, inviteToken: string) {
    return this.db.transaction(async db => {
      const identity = await this.identityFrom(db, secret);
      const invite = await this.invitation(db, inviteToken, true);
      if (invite.email !== identity.user.email) throw new AppError(403, 'Sign in with the email address this invitation was sent to.');
      await db.query("INSERT INTO donekite.memberships(user_id, workspace_id, role) VALUES ($1, $2, 'member') ON CONFLICT(user_id, workspace_id) DO NOTHING", [identity.user.id, invite.workspace_id]);
      await db.query('UPDATE donekite.invitations SET used_at = $1 WHERE token_hash = $2', [this.clock(), invite.token_hash]);
      await db.query('DELETE FROM donekite.sessions WHERE token_hash = $1', [digest(secret!)]);
      return this.issueSession(db, identity.user.id, invite.workspace_id);
    });
  }
}

const globalStore = globalThis as typeof globalThis & { donekiteStore?: WorkspaceStore };
export function getStore(): WorkspaceStore {
  return globalStore.donekiteStore ??= new WorkspaceStore(createPostgresDatabase());
}
