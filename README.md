# FACILITATE 2027 — Session Assessment Tool

Private web app for scoring session proposals for IAF Europe Region Conference 2027.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, APP_PASSWORD_HASH, ADMIN_PASSWORD_HASH, SESSION_SECRET
npm run hash -- 'your-password'  # generate a hash to put in .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000

## Env

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (pooled, with `?sslmode=require`) |
| `APP_PASSWORD_HASH` | bcrypt hash of the shared panel password |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the lead password |
| `SESSION_SECRET` | random 32+ bytes, HS256 for `jose` |

Generate hashes: `npm run hash -- 'conference'`

Generate secret: `openssl rand -base64 32`

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run db:migrate` — apply `db/migrations/*.sql` in order
- `npm run db:seed` — 6 evaluators + 1 wave + 12 synthetic applications
- `npm test` — vitest

## Deploy

Vercel — set the same env vars in Project Settings → Environment Variables. No secrets in repo.

## Spec

See `plan/` — 00-AGENT-BRIEF through 10-CVENT-QUESTIONS. Source docs in `surse/` (never modify).
