import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';


export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Becoming a designer is approval-gated — a normal signup can never pick
    // that role. A signup only becomes a designer if an admin has already
    // approved their application, which leaves an unlinked PartnerDesigner
    // record for this email. Everyone else is a customer.
    const approvedDesigner = await prisma.partnerDesigner.findFirst({
      where: { email, userId: null },
    });
    const role = approvedDesigner ? 'designer' : 'customer';

    const user = await prisma.user.create({
      data: {
        name: name || null,
        email,
        password: hashedPassword,
        role,
      },
    });

    // Link the approved designer profile to the new account.
    if (approvedDesigner) {
      await prisma.partnerDesigner.update({
        where: { id: approvedDesigner.id },
        data: { userId: user.id },
      });
    }

    return NextResponse.json(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
