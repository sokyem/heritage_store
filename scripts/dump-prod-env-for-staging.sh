#!/usr/bin/env bash
# Dumps the production env vars to stdout, with sandbox-swap candidates flagged.
#
# Use case: you've created a "staging" environment in Railway and need to
# seed its variables. Run this script, review the output, swap the marked
# values for sandbox/test versions, then paste into Railway → staging env
# → AWULA-K-vjyd → Variables → Raw Editor.
#
# Requires: `railway login` (one-time). Run from anywhere — uses the linked
# project from /workspaces/Awula_k/.railway.
#
# Safe by default: secrets are written to stdout only when you redirect
# explicitly. Never commit the output file.

set -euo pipefail

SERVICE="AWULA-K-vjyd"

# Variables that MUST be sandbox/test versions in staging (real money / live API).
# Anything starting with these prefixes will be marked with a # TODO note.
SWAP_PREFIXES=(
  "STRIPE_SECRET_KEY"
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "PAYPAL_CLIENT_ID"
  "PAYPAL_CLIENT_SECRET"
  "NEXT_PUBLIC_PAYPAL_CLIENT_ID"
  "USPS_PAYMENT_ACCOUNT"  # if EPS is approved, staging should use a separate account
  "UPS_ACCOUNT_NUMBER"
)

# Variables that staging should NOT inherit at all (point to prod resources).
# These will be commented out so you supply staging-specific values.
SKIP_PREFIXES=(
  "DATABASE_URL"           # Railway auto-injects the staging Postgres URL
  "DATABASE_PUBLIC_URL"
  "RAILWAY_PRIVATE_DOMAIN"
  "RAILWAY_PUBLIC_DOMAIN"
  "NEXTAUTH_URL"           # staging URL is different
  "NEXT_PUBLIC_SITE_URL"   # staging URL is different
)

should_swap() {
  local key="$1"
  for prefix in "${SWAP_PREFIXES[@]}"; do
    if [[ "$key" == "$prefix" ]] || [[ "$key" == "${prefix}_"* ]]; then return 0; fi
  done
  return 1
}

should_skip() {
  local key="$1"
  for prefix in "${SKIP_PREFIXES[@]}"; do
    if [[ "$key" == "$prefix" ]]; then return 0; fi
  done
  return 1
}

echo "# Generated $(date '+%Y-%m-%d %H:%M:%S')"
echo "# Source: Railway production env (service: $SERVICE)"
echo "# DO NOT COMMIT THIS FILE — it contains production secrets."
echo "#"
echo "# Before pasting into Railway staging:"
echo "#   - Replace values marked TODO with sandbox/test equivalents"
echo "#   - Leave commented (#) lines alone — Railway will provide them or you set per-env"
echo ""

railway variables --service "$SERVICE" --kv 2>/dev/null | grep -E "^[A-Z_][A-Z0-9_]*=" | sort | while IFS='=' read -r key value; do
  if should_skip "$key"; then
    echo "# $key=<set per-environment>"
  elif should_swap "$key"; then
    echo "# TODO: swap for sandbox/test value"
    echo "$key=$value"
  else
    echo "$key=$value"
  fi
done
