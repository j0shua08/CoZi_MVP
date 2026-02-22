# CoZi MVP

## Requirements
- Node.js installed
- Supabase project (Postgres + Storage bucket)

## Setup

1. Clone the repo:
git clone https://github.com/j0shua08/CoZi_MVP.git
cd CoZi_MVP/cozi-mvp

2. Setup backend environment:
Create a file at: server/.env

Add:

DATABASE_URL=
ADMIN_PASSWORD=
JWT_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=listings

3. Install backend dependencies:
cd server
npm install

4. Push Prisma schema:
npx prisma db push

5. Start backend:
npm run dev

6. Start frontend:
cd ../client
npx serve

Open the URL shown in terminal.