import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const clients = [
  { clientId: 'C-001', name: 'Senna Bride', notes: 'Imported from handwritten order list' },
  { clientId: 'C-002', name: 'Kanyan Bride', notes: 'Imported from handwritten order list' },
  { clientId: 'C-003', name: 'Alteration Client', notes: 'Imported from handwritten order list' },
  { clientId: 'C-004', name: 'Mrs Brown Mum', notes: 'Imported from handwritten order list' },
  { clientId: 'C-005', name: 'Daizara Pam', notes: 'Imported from handwritten order list' },
  { clientId: 'C-006', name: 'Bride (Julia)', notes: 'Imported from handwritten order list' },
  { clientId: 'C-007', name: 'Tga Baby', notes: 'Imported from handwritten order list' },
  { clientId: 'C-008', name: 'Mrs Brown', notes: 'Imported from handwritten order list' },
  { clientId: 'C-009', name: 'Miss Pam', notes: 'Imported from handwritten order list' },
];

const orders = [
  { orderId: 'AWK-001', clientId: 'C-001', item: 'Bridal order bundle', status: 'Fabric Sourced', dueDate: 'May (first week)', notes: "Reception look; possible 'wedding kente' look; wedding dress look. Verify spelling/details.", productionAllowed: 'HOLD' },
  { orderId: 'AWK-002', clientId: 'C-002', item: 'Wedding dress', status: 'Sewing', dueDate: 'April', notes: 'Transcribed from handwriting; verify client name spelling.', productionAllowed: 'HOLD' },
  { orderId: 'AWK-003', clientId: 'C-003', item: 'Alteration (x3) - Beaded lace tops', fabric: 'Beaded lace', status: 'Inquiry', dueDate: 'April (first week)', notes: 'Client name not shown clearly in notebook.', productionAllowed: 'HOLD' },
  { orderId: 'AWK-004', clientId: 'C-004', item: 'Alteration', status: 'Inquiry', dueDate: 'Sunday', notes: "Listed as 'Mrs Brown mum'.", productionAllowed: 'HOLD' },
  { orderId: 'AWK-005', clientId: 'C-005', item: 'Prom dress', status: 'Inquiry', dueDate: 'May 30', notes: 'Verify client name spelling.', productionAllowed: 'HOLD' },
  { orderId: 'AWK-006', clientId: 'C-006', item: 'Bridal order', status: 'Inquiry', dueDate: 'June', productionAllowed: 'HOLD' },
  { orderId: 'AWK-007', clientId: 'C-007', item: 'Corset top; Kente dress', fabric: 'Kente', status: 'Inquiry', notes: 'Two pieces listed: 1) Corset top 2) Kente dress. Verify client name spelling.', productionAllowed: 'HOLD' },
  { orderId: 'AWK-008', clientId: 'C-008', item: 'Jeans dress; Flower top', fabric: 'Denim / floral', status: 'Inquiry', notes: 'Two pieces listed: 1) Jeans Dress 2) Flower top.', productionAllowed: 'HOLD' },
  { orderId: 'AWK-009', clientId: 'C-009', item: '30 yrs wedding revamp', status: 'Inquiry', dueDate: 'April (21 days)', notes: "30 yrs wedding revamp'. Verify exact wording.", productionAllowed: 'HOLD' },
];

const production = [
  { orderId: 'AWK-001', priority: 'LOW', stage: 'Fabric Sourced', progress: 10, dueDate: 'May (first week)' },
  { orderId: 'AWK-002', priority: 'HIGH', stage: 'Sewing', progress: 50, dueDate: 'April' },
];

async function main() {
  console.log('Seeding admin data from Excel...');

  // Upsert clients
  for (const c of clients) {
    await prisma.client.upsert({
      where: { clientId: c.clientId },
      update: { name: c.name, notes: c.notes },
      create: c,
    });
  }
  console.log(`  ✓ ${clients.length} clients`);

  // Build client lookup
  const clientLookup: Record<string, string> = {};
  const allClients = await prisma.client.findMany();
  for (const c of allClients) {
    clientLookup[c.clientId] = c.id;
  }

  // Upsert orders
  for (const o of orders) {
    const dbClientId = clientLookup[o.clientId];
    if (!dbClientId) continue;
    await prisma.adminOrder.upsert({
      where: { orderId: o.orderId },
      update: {
        clientId: dbClientId,
        item: o.item,
        fabric: o.fabric || null,
        status: o.status,
        dueDate: o.dueDate || null,
        notes: o.notes || null,
        productionAllowed: o.productionAllowed,
      },
      create: {
        orderId: o.orderId,
        clientId: dbClientId,
        item: o.item,
        fabric: o.fabric || null,
        status: o.status,
        dueDate: o.dueDate || null,
        notes: o.notes || null,
        productionAllowed: o.productionAllowed,
      },
    });
  }
  console.log(`  ✓ ${orders.length} orders`);

  // Upsert production trackers
  const orderLookup: Record<string, string> = {};
  const allOrders = await prisma.adminOrder.findMany();
  for (const o of allOrders) {
    orderLookup[o.orderId] = o.id;
  }

  for (const p of production) {
    const dbOrderId = orderLookup[p.orderId];
    if (!dbOrderId) continue;
    await prisma.productionTracker.upsert({
      where: { orderId: dbOrderId },
      update: { priority: p.priority, stage: p.stage, progress: p.progress, dueDate: p.dueDate },
      create: { orderId: dbOrderId, priority: p.priority, stage: p.stage, progress: p.progress, dueDate: p.dueDate },
    });
  }
  console.log(`  ✓ ${production.length} production trackers`);

  // Create initial payment record placeholder
  const awk001Id = orderLookup['AWK-001'];
  if (awk001Id) {
    await prisma.paymentRecord.upsert({
      where: { paymentId: 'P-001' },
      update: {},
      create: { paymentId: 'P-001', orderId: awk001Id, client: 'Senna Bride' },
    });
    console.log('  ✓ 1 payment record placeholder');
  }

  console.log('Done!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
