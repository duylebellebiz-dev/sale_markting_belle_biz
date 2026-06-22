const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
Promise.all([
  p.business.findMany({ select: { id: true, businessName: true, email: true } }),
  p.user.findMany({ select: { id: true, email: true, role: true, businessId: true } }),
]).then(([b, u]) => {
  console.log('BUSINESSES:', JSON.stringify(b, null, 2));
  console.log('USERS:', JSON.stringify(u, null, 2));
}).finally(() => p.$disconnect());
