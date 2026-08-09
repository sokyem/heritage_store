import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/health
//
// Liveness + readiness check for the platform (Railway → Settings →
// Healthcheck Path = /api/health). Returns 200 only when the process is
// running AND we can reach Postgres. Without this, the platform has no way
// to keep the previous container alive when a new deploy crashes on boot
// or can't talk to the DB — it'll swap traffic onto a broken container.
//
// Keep this endpoint fast (<1s) and avoid heavy queries; it's polled often.
export async function GET() {
  const startedAt = Date.now();
  try {
    // Trivial round-trip — confirms the connection pool is alive.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, db: 'ok', latencyMs: Date.now() - startedAt },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(
      { ok: false, db: 'error', error: message, latencyMs: Date.now() - startedAt },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
