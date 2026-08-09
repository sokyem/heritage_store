/**
 * Single source of truth for the shipper (origin) address used by every
 * carrier integration. Reads the admin-saved settings row first, falls back
 * to the env-defined defaults. Cached briefly so creating many shipments in
 * a row doesn't hammer the DB.
 *
 * Call sites: lib/ups.ts, lib/usps.ts, lib/usps-pickup.ts
 */
import { getSetting, type ShipperAddressSettings } from '@/lib/settings';

let cached: { value: ShipperAddressSettings; expiresAt: number } | null = null;
const TTL_MS = 30_000;

export async function getShipperAddress(): Promise<ShipperAddressSettings> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  const value = await getSetting('shipper');
  cached = { value, expiresAt: Date.now() + TTL_MS };
  return value;
}

// Lets the admin settings save handler clear the cache so its next read
// returns the value the user just persisted.
export function invalidateShipperAddressCache(): void {
  cached = null;
}
