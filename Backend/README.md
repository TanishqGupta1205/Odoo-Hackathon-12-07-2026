# TransitOps Backend — Neon PostgreSQL + Prisma

Updated backend structure for the TransitOps Smart Transport Operations Platform.

## Request flow

`Route -> Middleware -> Validator -> Controller -> Service -> Prisma -> Neon PostgreSQL`

## Setup

```bash
npm install
copy .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

On macOS/Linux, use:

```bash
cp .env.example .env
```

Replace the database URLs and JWT secret inside `.env` before running migrations.

## Important

- The old Mongoose `models/` folder is not used.
- All database entities and relationships are defined in `prisma/schema.prisma`.
- `generated/prisma/` is created by `npx prisma generate`.
- Trip dispatch/completion/cancellation should use Prisma transactions.
