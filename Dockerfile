FROM node:20-bookworm AS builder

WORKDIR /app/web

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

COPY web/prisma ./prisma
COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM node:20-bookworm AS runner

WORKDIR /app/web

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/web ./

EXPOSE 3000

CMD ["npm", "run", "start"]