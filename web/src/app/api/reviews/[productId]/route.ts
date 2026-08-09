import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// GET /api/reviews/[productId] — public approved reviews
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;

  const reviews = await prisma.productReview.findMany({
    where: { productId, status: 'approved' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      authorName: true,
      rating: true,
      title: true,
      body: true,
      verifiedPurchase: true,
      helpfulCount: true,
      createdAt: true,
    },
  });

  const total = reviews.length;
  const avg = total > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / total
    : 0;

  const distribution = [1, 2, 3, 4, 5].reduce((acc, n) => {
    acc[n] = reviews.filter((r) => r.rating === n).length;
    return acc;
  }, {} as Record<number, number>);

  return NextResponse.json({ reviews, total, avg: Math.round(avg * 10) / 10, distribution });
}

// POST /api/reviews/[productId] — submit a review
export async function POST(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const session = await getServerSession(authOptions);
  const body = await req.json();

  const { authorName, authorEmail, rating, title, reviewBody } = body;

  if (!authorName || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Name and a rating (1–5) are required.' }, { status: 400 });
  }

  const product = await prisma.adminProduct.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  // Check if this user has purchased the product (for verifiedPurchase badge)
  // Order.productId links to the legacy Product table, not AdminProduct.
  // Cross-reference via product name (legacy Product.name === AdminProduct.name).
  let verifiedPurchase = false;
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (user) {
      const order = await prisma.order.findFirst({
        where: {
          userId: user.id,
          status: { in: ['paid', 'completed', 'shipped', 'delivered'] },
          product: { name: { contains: product.name, mode: 'insensitive' } },
        },
      });
      verifiedPurchase = !!order;
    }
  }

  const review = await prisma.productReview.create({
    data: {
      productId,
      userId: session?.user ? (await prisma.user.findUnique({ where: { email: session.user.email! } }))?.id ?? null : null,
      authorName: authorName.trim().slice(0, 80),
      authorEmail: authorEmail?.trim().slice(0, 200) || null,
      rating: Math.round(rating),
      title: title?.trim().slice(0, 120) || null,
      body: reviewBody?.trim().slice(0, 2000) || null,
      status: 'pending',
      verifiedPurchase,
    },
  });

  return NextResponse.json({ review, message: 'Review submitted — it will appear after moderation.' }, { status: 201 });
}
