import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { sendTemplate } from '@/lib/email';

// GET /api/designer-applications — admin: list applications (optional ?status=)
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const status = new URL(req.url).searchParams.get('status');
  const applications = await prisma.designerApplication.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(applications);
}

// POST /api/designer-applications — public: submit a designer application
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    // Block duplicate submissions while one is still open.
    const open = await prisma.designerApplication.findFirst({
      where: { email, status: { in: ['pending', 'under_review'] } },
    });
    if (open) {
      return NextResponse.json(
        { error: 'You already have an application under review. We\'ll be in touch soon.' },
        { status: 409 },
      );
    }

    const application = await prisma.designerApplication.create({
      data: {
        name,
        email,
        phone: body.phone ? String(body.phone).trim() : null,
        location: body.location ? String(body.location).trim() : null,
        businessName: body.businessName ? String(body.businessName).trim() : null,
        specialty: body.specialty ? String(body.specialty).trim() : null,
        portfolioUrl: body.portfolioUrl ? String(body.portfolioUrl).trim() : null,
        yearsExperience:
          body.yearsExperience != null && body.yearsExperience !== ''
            ? Math.max(0, parseInt(String(body.yearsExperience), 10) || 0)
            : null,
        bio: body.bio ? String(body.bio).trim() : null,
        status: 'pending',
      },
    });

    // Notify admins in-app.
    const admins = await prisma.user.findMany({
      where: { role: { in: ['founder', 'staff', 'admin'] } },
      select: { id: true },
    });
    await Promise.all(
      admins.map((a) =>
        prisma.notification.create({
          data: {
            userId: a.id,
            type: 'designer_application',
            title: 'New Designer Application',
            message: `${name} applied to join the designer network. Review and verify in Designer Applications.`,
            relatedId: application.id,
          },
        }),
      ),
    );

    // Confirmation email to the applicant (mocked if SendGrid unconfigured).
    sendTemplate('designer_application_received', email, { name }).catch(() => {});

    return NextResponse.json({ ok: true, id: application.id });
  } catch (error) {
    console.error('Failed to submit designer application:', error);
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
  }
}
