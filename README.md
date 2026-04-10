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

## Deploy

The simplest deployment for this repo is to host it as one Node web service, because the Express server can now serve the `client` folder in production.

### Recommended: Render

1. Push your latest code to GitHub.
2. In Render, create a new `Web Service` from your repo.
3. Set the Root Directory to:
`cozi-mvp`
4. Set the Build Command to:
`cd server && npm install`
5. Set the Start Command to:
`cd server && npm start`
6. Add these environment variables in Render:

`DATABASE_URL`
`ADMIN_PASSWORD`
`JWT_SECRET`
`SUPABASE_URL`
`SUPABASE_SERVICE_ROLE_KEY`
`SUPABASE_BUCKET`

7. Deploy.

After deploy, your site and API will both run from the same Render URL.
