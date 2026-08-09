This is the Awula web application: a Next.js storefront and backend with Prisma, NextAuth, Stripe, and AI-assisted consultation flows.

## Local Development

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Point `DATABASE_URL` at PostgreSQL.

- Railway Postgres: use the `DATABASE_URL` variable Railway gives you.
- Local Postgres example: `postgresql://postgres:password@localhost:5432/awula?schema=public`

3. If you want admin product and media uploads to work, set Cloudinary credentials.

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

4. Push the Prisma schema to the database:

```bash
npm run db:setup
```

5. Seed optional starter data:

```bash
npm run db:seed
```

6. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

## Database Commands

```bash
# Generate Prisma client
npm run db:generate

# Sync schema to the database without migrations
npm run db:push

# Copy existing SQLite data into PostgreSQL
npm run db:migrate:sqlite

# Open Prisma Studio
npm run db:studio
```

`db:push` is the intended bootstrap path for a fresh Railway Postgres database in this repo. The checked-in Prisma migrations were created against the earlier SQLite setup and should be treated as historical, not as the deployment path for a new PostgreSQL instance.

If you are moving from the old local SQLite database, keep `DATABASE_URL` pointed at PostgreSQL and set `SQLITE_DATABASE_URL` to the old file URL if needed. The migration command truncates the target PostgreSQL tables before importing the SQLite rows.

## Railway Deployment Notes

- Provision a PostgreSQL service in Railway.
- Set `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, Stripe keys, PayPal keys, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `ANTHROPIC_API_KEY`, and `TOGETHER_API_KEY` in Railway.
- Run `npm run db:setup` once against the Railway database before first production use.
- If you need existing local data, run `npm run db:migrate:sqlite` after `db:setup`.
- Deploy with an explicit Docker build. You can either deploy from the repository root with the root `Dockerfile`, or set the Railway service root directory to `web/` and use `web/Dockerfile`.
- Put Cloudflare DNS/proxy in front of Railway rather than running `cloudflared` inside Railway.

This repo also contains legacy static prototype files at the root. Without an explicit Docker deployment, Railway can auto-detect the wrong artifact and serve the static prototype with Caddy, which makes app routes like `/admin` and API routes like `/api/orders` return `404`.

## Deployment

This app can run on any Node host that supports Next.js and PostgreSQL. Railway is the lowest-friction option for this repository because it provides both the app runtime and managed Postgres without extra infrastructure work.
