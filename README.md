# Shop Management Web Application

Full-stack shop management app with JWT authentication, role-based access, live stock updates, and transaction tracking.

> Default currency is Ethiopian Birr (ETB / Br).

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB (Mongoose)
- Authentication: JWT
- Real-time updates: Socket.IO

## Features Implemented

- Secure login with JWT
- Roles: Admin and Salesman
- Admin:
  - Dashboard summary (sales, stock count, stock units, revenue, low stock alerts)
  - Full product CRUD
  - Real-time stock monitoring
  - Create users (admin/salesman)
  - View all transactions
- Salesman:
  - Personal dashboard (daily/weekly/total sales)
  - View stock and sell products
  - Automatic stock deduction on sale
  - Transaction history
- Core Logic:
  - Prevents overselling
  - Sale logs include product, quantity, unit price, total, timestamp, salesman
  - Live stock updates pushed to connected clients
- UI:
  - Responsive dashboard with sidebar navigation
  - Tables, forms, validation, search, CSV export, dark/light mode

## Project Structure

```text
backend/
  src/
    config/
    middleware/
    models/
    routes/
    utils/
frontend/
  src/
    api/
    components/
    context/
    hooks/
    pages/
```

## Database Collections

- `users`: id, name, role, email, password
- `products`: id, name, price, quantity, category
- `sales`: id, product_id, quantity, total_price, salesman_id, timestamp

## Currency Configuration (ETB)

- Backend stores and serves pricing in ETB by default.
- Configure conversion in `backend/.env`:
  - `APP_CURRENCY=ETB`
  - `LEGACY_CURRENCY=USD` (source currency used during migration)
  - `MISSING_CURRENCY_DEFAULT=ETB` (default for records without `currency`)
  - `USD_TO_ETB_RATE=57` (change as needed)
  - `ENABLE_USD_TO_ETB_MIGRATION=true` for one-time legacy conversion
- UI formatting is configured in `frontend/.env`:
  - `VITE_CURRENCY_CODE=ETB`
  - `VITE_CURRENCY_LOCALE=en-ET`

## Setup

1. Install dependencies:

```bash
npm run install:all
```

2. Configure environment variables:

- Copy `backend/.env.example` to `backend/.env`
- Copy `frontend/.env.example` to `frontend/.env`

3. Start backend:

```bash
npm run dev:backend
```

4. Start frontend:

```bash
npm run dev:frontend
```

Frontend runs on `http://localhost:5173`, backend on `http://localhost:5000`.

## Default Seed Admin

If the configured seed admin does not exist, backend startup auto-creates it from:

- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_ADMIN_NAME`
