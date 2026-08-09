import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


// GET /api/designers - Get all designers
export async function GET() {
  try {
    const designers = await prisma.designer.findMany();
    return NextResponse.json(designers);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch designers' }, { status: 500 });
  }
}