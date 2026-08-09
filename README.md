# Awula_k

A comprehensive luxury fashion platform with web and mobile applications.

## Structure

- `web/`: Next.js web application with full backend
- `mobile/`: Expo React Native mobile application
- Legacy static HTML prototype in `legacy-static/`

## Features Implemented

### Backend & Database ✅
- Prisma ORM with PostgreSQL-ready configuration
- User authentication (NextAuth)
- Models: Users, Products, Orders, Consultations, Measurements, Designers
- API routes for data management

### Advanced Features ✅
- **AI Intake Forms**: Comprehensive consultation intake collecting event details, style preferences, measurements
- **Video Calling**: Mock video consultation interface with call controls
- **File Uploads**: Measurement photo uploads in profile
- **Payment Processing**: Mock payment flow for orders
- **Real-time Notifications**: Toast notifications for updates

### Founder Dashboard ✅
- **Order Management**: View, assign designers, update status
- **Designer Network**: Track partner availability and capacity
- **Live Consults**: Monitor active consultations
- **Order Pipeline**: Visual tracking of order stages
- **Real-time Stats**: Active orders, designer count, fit confidence

## Customer Features
- Product browsing and featured items
- Custom order requests
- Consultation booking with intake
- Measurement management with photo uploads
- Order tracking with payment

## Founder Features
- Comprehensive dashboard with order management
- Designer network routing and capacity tracking
- Consultation monitoring and scheduling
- Production pipeline visualization
- Real-time business metrics

## Running

### Web
```bash
cd web
npm run db:setup
npm run dev
```
Access at `http://localhost:3000`

### Mobile
```bash
cd mobile
npm start
```

## Database
To manage data:
```bash
cd web
npm run db:studio
```

The web app now expects a PostgreSQL `DATABASE_URL`. For Railway, create a Postgres service, copy its connection string into the web service environment, then run `npm run db:setup` before seeding or starting the app.

For admin media uploads, also configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` for the web app.

For production on Railway, deploy from the repository root with the root `Dockerfile`. This forces Railway to build and run the real Next.js app from `web/` instead of auto-detecting and serving the legacy static HTML files at the repo root.

## API Endpoints
- `GET/POST /api/products` - Product management
- `GET/POST /api/orders` - Order CRUD
- `PUT /api/orders/[id]` - Update orders
- `GET /api/designers` - Designer network
- `GET/POST /api/consultations` - Consultation management

A luxury fashion app prototype based on the UI story is archived in `legacy-static/`.

## Legacy Screens

- legacy-static/index.html: Home screen
- legacy-static/product.html: Product page
- legacy-static/consultation.html: Consultation booking
- legacy-static/measurements.html: Measurement management
- legacy-static/dashboard.html: Founder dashboard

## Running

Open the files in `legacy-static/` in a browser or use a local server.