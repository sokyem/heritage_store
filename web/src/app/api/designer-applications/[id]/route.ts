import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { sendTemplate } from '@/lib/email';

const APP_URL = process.env.NEXTAUTH_URL || 'https://www.awulak.com';

const CHECKLIST_FIELDS = [
  'identityVerified',
  'portfolioReviewed',
  'referencesChecked',
  'backgroundCheckPassed',
] as const;

// GET /api/designer-applications/[id] — admin: single application
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const application = await prisma.designerApplication.findUnique({ where: { id } });
  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  return NextResponse.json(application);
}

// PATCH /api/designer-applications/[id] — admin: update checklist / notes,
// or move status to approved / rejected / under_review.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const application = await prisma.designerApplication.findUnique({ where: { id } });
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    if (application.status === 'approved') {
      return NextResponse.json({ error: 'This application is already approved' }, { status: 400 });
    }

    // Collect checklist + notes updates.
    const data: Record<string, unknown> = {};
    for (const field of CHECKLIST_FIELDS) {
      if (typeof body[field] === 'boolean') data[field] = body[field];
    }
    if (typeof body.reviewNotes === 'string') data.reviewNotes = body.reviewNotes;

    const action = body.action as string | undefined;

    // ── Approve ──────────────────────────────────────────────────
    if (action === 'approve') {
      // Every verification step must pass first.
      const incomplete = CHECKLIST_FIELDS.filter((f) => {
        const value = f in data ? data[f] : application[f];
        return !value;
      });
      if (incomplete.length > 0) {
        return NextResponse.json(
          { error: 'Complete every verification step before approving.', incomplete },
          { status: 400 },
        );
      }

      // Create the PartnerDesigner record — this is what later lets the
      // applicant sign up with the designer role (signup auto-links by email).
      const lastDesigner = await prisma.partnerDesigner.findFirst({
        orderBy: { designerId: 'desc' },
      });
      const nextNum = lastDesigner
        ? parseInt(lastDesigner.designerId.replace('DES-', ''), 10) + 1
        : 1;
      const designerId = `DES-${String(nextNum).padStart(3, '0')}`;

      const designer = await prisma.partnerDesigner.create({
        data: {
          designerId,
          name: application.name,
          email: application.email,
          phone: application.phone,
          location: application.location,
          businessName: application.businessName,
          specialty: application.specialty,
          bio: application.bio,
          portfolioUrl: application.portfolioUrl,
          status: 'active',
        },
      });

      const updated = await prisma.designerApplication.update({
        where: { id },
        data: {
          ...data,
          status: 'approved',
          reviewedBy: auth.email,
          reviewedAt: new Date(),
          partnerDesignerId: designer.id,
        },
      });

      sendTemplate('designer_application_approved', application.email, {
        name: application.name,
        email: application.email,
        signupUrl: `${APP_URL}/auth/signup`,
      }).catch(() => {});

      return NextResponse.json(updated);
    }

    // ── Reject ───────────────────────────────────────────────────
    if (action === 'reject') {
      const updated = await prisma.designerApplication.update({
        where: { id },
        data: { ...data, status: 'rejected', reviewedBy: auth.email, reviewedAt: new Date() },
      });
      return NextResponse.json(updated);
    }

    // ── Plain save (checklist / notes) — keep it in review ───────
    const updated = await prisma.designerApplication.update({
      where: { id },
      data: {
        ...data,
        status: application.status === 'pending' ? 'under_review' : application.status,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update designer application:', error);
    return NextResponse.json({ error: 'Failed to update application' }, { status: 500 });
  }
}
