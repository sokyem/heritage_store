FROM node:20-bookworm AS builder

WORKDIR /app

# Build-time arguments — required so NEXT_PUBLIC_* vars are baked into the client bundle.
# Without these, Next.js compiles the JS with empty strings and Stripe/PayPal/etc. fail in the browser.
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_PAYPAL_CLIENT_ID
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME

ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
ENV NEXT_PUBLIC_PAYPAL_CLIENT_ID=${NEXT_PUBLIC_PAYPAL_CLIENT_ID}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=${NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}

COPY prisma ./prisma
COPY package*.json ./
RUN npm ci

COPY . ./
RUN npm run build

FROM node:20-bookworm AS runner

WORKDIR /app

# ffmpeg lets the recording→transcript pipeline strip audio from the JaaS
# video recording before sending it to Gemini — ~8x cheaper than transcribing
# the full video. The transcription lib falls back to the video if ffmpeg is
# missing, so this is an optimization, not a hard dependency.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app ./

EXPOSE 3000

# The `start` script runs `prisma db push --skip-generate` before `next start`,
# so additive schema changes (new tables / nullable columns) sync to the prod
# database automatically on every deploy — no more manual schema steps.
#
# This deliberately uses `db push`, NOT `migrate deploy`: the prod database was
# built with `db push` and has no `_prisma_migrations` table, so `migrate deploy`
# would replay every historical migration and fail on already-existing tables.
# Don't switch to `migrate deploy` without first baselining prod via
# `prisma migrate resolve --applied` for every historical migration.
CMD ["npm", "run", "start"]