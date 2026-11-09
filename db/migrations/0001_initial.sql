CREATE SCHEMA IF NOT EXISTS donekite;

CREATE TABLE IF NOT EXISTS donekite.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS donekite.workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  state JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS donekite.memberships (
  user_id TEXT NOT NULL REFERENCES donekite.users(id),
  workspace_id TEXT NOT NULL REFERENCES donekite.workspaces(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  PRIMARY KEY (user_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS memberships_workspace ON donekite.memberships(workspace_id);

CREATE TABLE IF NOT EXISTS donekite.sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES donekite.users(id),
  workspace_id TEXT NOT NULL REFERENCES donekite.workspaces(id),
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON donekite.sessions(expires_at);

CREATE TABLE IF NOT EXISTS donekite.user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES donekite.users(id),
  workspace_id TEXT NOT NULL REFERENCES donekite.workspaces(id)
);

CREATE TABLE IF NOT EXISTS donekite.invitations (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES donekite.workspaces(id),
  expires_at BIGINT NOT NULL,
  used_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email
  ON donekite.invitations(workspace_id, email) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS donekite.auth_attempts (
  account TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  started_at BIGINT NOT NULL
);
