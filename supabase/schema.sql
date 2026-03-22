create table if not exists google_oauth_states (
  state text primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists google_calendar_tokens (
  user_id text primary key,
  tokens_json jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists planner_preferences (
  user_id text primary key,
  preferences_json jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  conversation_id text primary key,
  user_id text,
  conversation_json jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_google_oauth_states_user_id
  on google_oauth_states (user_id);

create index if not exists idx_conversations_user_id
  on conversations (user_id);
