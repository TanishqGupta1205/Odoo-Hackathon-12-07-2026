require("dotenv").config();

const { PrismaClient } = require("../generated/prisma");
const { PrismaNeon } = require("@prisma/adapter-neon");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing in .env");
}

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function connectDB() {
  await prisma.$connect();
  console.log("✅ Neon PostgreSQL connected");
}

module.exports = { prisma, connectDB };
