const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const roles = ['Fleet Manager', 'Driver', 'Safety Officer', 'Financial Analyst'];

  console.log('🌱 Starting database seeding...');

  for (const roleName of roles) {
    const seededRole = await prisma.role.upsert({
      where: { role_name: roleName },
      update: {},
      create: { role_name: roleName },
    });
    console.log(`✅ Role checked/created: ${seededRole.role_name}`);
  }

  console.log('🌱 Seeding complete!');
}

main()
    .catch((e) => {
      console.error('❌ Seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });