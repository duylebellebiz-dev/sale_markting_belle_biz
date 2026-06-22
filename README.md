# Sales Support App

Lightweight CRM for small and medium businesses — follow-ups, invoices, renewals.

## Structure

```
backend/   NestJS API  (port 3000)
frontend/  React + Vite + Tailwind  (port 5173)
```

## Quick start

### Backend

```bash
cd backend
cp .env.example .env          # fill in MONGO_URI and JWT_SECRET
npm run start:dev             # watch mode
```

### Frontend

```bash
cd frontend
npm run dev                   # Vite dev server
```

Open http://localhost:5173 to see the placeholder page.  
The API will be available at http://localhost:3000.
