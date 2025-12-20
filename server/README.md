# SureSlot - Production-Grade Appointment Scheduling Engine

A complete, enterprise-level appointment scheduling backend with **automatic demo setup** for instant testing.

## ⚡ Quick Start (Demo Ready!)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (already done!)
# .env file is pre-configured with demo settings

# 3. Start server
npm run dev

# 4. Demo data created automatically! 🎉
# - 4 users (admin, organiser, 2 users)
# - 2 appointment types (free + paid)
# - ~50 slots for next 3 days
# - 2 sample bookings
```

**Demo Accounts:**

```
Admin:     admin@demo.com / Demo@1234
Organiser: organiser@demo.com / Demo@1234
User1:     user1@demo.com / Demo@1234
User2:     user2@demo.com / Demo@1234
```

Server runs at `http://localhost:8000`

---

## 🚀 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Payments**: Stripe Checkout + Webhooks
- **Authentication**: JWT (Access + Refresh Tokens)
- **Security**: Helmet, CORS, mongo-sanitize, rate limiting
- **Transactions**: MongoDB ACID transactions
- **Background Jobs**: Cron-based cleanup
- **Demo**: Auto-bootstrap (development only)

---

## 📦 Features

### Core Functionality

- ✅ **Appointment Configuration** - Define slots with duration, capacity, price
- ✅ **Slot Generation** - Bulk slot creation with recurrence rules
- ✅ **Availability API** - Fast, read-only queries (public + authenticated)
- ✅ **Booking Engine** - Transaction-based with concurrency safety
- ✅ **Payment Integration** - Stripe Checkout + idempotent webhooks
- ✅ **Share Links** - Token-based public appointment sharing
- ✅ **Admin Reports** - Revenue, utilization, booking analytics

### Production Hardening

- ✅ **Race Condition Prevention** - Atomic updates, conditional writes
- ✅ **Idempotency** - Duplicate bookings prevented, webhooks safe to retry
- ✅ **Rate Limiting** - Multiple tiers (auth, booking, payment, webhooks)
- ✅ **Input Validation** - Comprehensive validation on all endpoints
- ✅ **Structured Logging** - Correlation IDs, audit trails
- ✅ **Graceful Shutdown** - Clean connection closure
- ✅ **Error Handling** - Standardized responses, no stack traces leaked

### Demo Mode

- ✅ **Auto-Bootstrap** - Creates sample data on first run
- ✅ **Idempotent** - Safe to restart server
- ✅ **Development Only** - Never runs in production
- ✅ **Realistic Data** - Working appointments, slots, bookings

---

## 🔧 Environment Setup

The `.env` file is pre-configured for demo. For production, update:

```env
# Server
NODE_ENV=production
PORT=8000

# Database (use your production MongoDB)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/sureslot

# JWT (generate strong secrets!)
JWT_SECRET=your-production-secret-256-bits
ACCESS_TOKEN_SECRET=your-access-secret
REFRESH_TOKEN_SECRET=your-refresh-secret

# Stripe (use live keys)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# CORS (set your frontend domain)
CORS_ORIGIN=https://yourapp.com
```

---

## 📚 Documentation

- **[STRIPE_INTEGRATION.md](./STRIPE_INTEGRATION.md)** - Payment flow, webhook handling
- **[PRODUCTION_HARDENING.md](./PRODUCTION_HARDENING.md)** - Security, performance, reliability
- **[CLEANUP_SUMMARY.md](./CLEANUP_SUMMARY.md)** - Codebase cleanup details

---

## 🔧 Installation

```bash
cd server
npm install
```

---

## 🎬 Demo Scenarios

### 1. View Available Slots (Public)

```bash
curl http://localhost:8000/api/v1/public/availability
```

### 2. Login as Admin

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Demo@1234"}'
```

### 3. View Appointment Types

```bash
curl http://localhost:8000/api/v1/appointments \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Create Booking (Free Consultation)

```bash
# 1. Get appointment type ID and slot ID from availability
# 2. Create booking intent
curl -X POST http://localhost:8000/api/v1/bookings/intents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slotId": "SLOT_ID",
    "appointmentTypeId": "APPT_TYPE_ID",
    "bookingAnswers": [
      {"question": "What would you like to discuss?", "answer": "Demo test"}
    ]
  }'

# 3. Confirm booking (no payment for free consultation)
curl -X POST http://localhost:8000/api/v1/bookings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"intentId": "INTENT_ID"}'
```

### 5. Test Stripe Payment (Paid Workshop)

```bash
# 1. Create booking intent for paid appointment
# 2. Create Stripe checkout session
curl -X POST http://localhost:8000/api/v1/payments/stripe/create-checkout-session \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"intentId": "INTENT_ID"}'

# 3. Complete payment at returned checkout URL
# 4. Webhook confirms booking automatically
```

### 6. Access via Share Link (No Auth)

```bash
# Technical Workshop is shared with token: demo-workshop-123
curl http://localhost:8000/api/v1/public/share/demo-workshop-123/availability
```

### 7. Admin Reports

```bash
curl http://localhost:8000/api/v1/admin/reports/bookings \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## ▶️ Run Locally

```bash
npm run dev
```

Server runs at `http://localhost:5000`

## 🏗️ Architecture

### Core Principles

1. **Thin Controllers** - HTTP layer only, no business logic
2. **Service Layer** - All business logic in reusable services
3. **Slots as Inventory** - Pre-generated, finite capacity prevents race conditions
4. **Availability is Read-Only** - Never creates or locks slots
5. **Bookings are Transactional** - MongoDB transactions ensure atomicity

### File Structure

```
server/
├── src/
│   ├── app.js                    # Express initialization
│   ├── server.js                 # Server startup
│   │
│   ├── config/
│   │   ├── db.js                 # MongoDB connection
│   │   └── env.js                # Environment variables
│   │
│   ├── models/
│   │   ├── user.model.js         # User + roles (ADMIN/ORGANISER/USER)
│   │   ├── appointmentType.model.js  # RULE ENGINE
│   │   ├── slot.model.js         # Inventory (capacity-based)
│   │   ├── booking.model.js      # Confirmed bookings
│   │   ├── bookingIntent.model.js    # Payment reservations
│   │   └── payment.model.js      # Payment records
│   │
│   ├── services/
│   │   ├── appointment.service.js    # Appointment CRUD + publish/share
│   │   ├── slot.service.js       # Slot generation + management
│   │   ├── availability.service.js   # Read-only availability queries
│   │   ├── booking.service.js    # Transactional bookings
│   │   ├── share.service.js      # Token-based sharing
│   │   ├── payment.service.js    # Payment flow
│   │   └── admin.service.js      # Reports via aggregation
│   │
│   ├── controllers/
│   │   ├── auth.controller.js    # Register, login, logout, etc.
│   │   ├── appointment.controller.js
│   │   ├── availability.controller.js
│   │   ├── booking.controller.js
│   │   ├── public.controller.js  # Token-based public access
│   │   ├── payment.controller.js
│   │   └── admin.controller.js
│   │
│   ├── routes/
│   │   ├── auth.route.js
│   │   ├── appointment.routes.js
│   │   ├── availability.routes.js
│   │   ├── booking.routes.js
│   │   ├── public.routes.js
│   │   ├── payment.routes.js
│   │   └── admin.routes.js
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.js    # JWT + role checks
│   │   ├── error.middleware.js   # Global error handler
│   │   └── ...
│   │
│   ├── utils/
│   │   ├── async-handler.js      # Async error wrapper
│   │   ├── api-error.js          # Custom error class
│   │   ├── api-response.js       # Standardized responses
│   │   ├── mail.js               # Email utility
│   │   ├── slot-generator.js     # Slot generation logic
│   │   └── time.js               # Time utilities
│   │
│   └── jobs/
│       └── release-expired-intents.job.js
│
└── package.json
```

## ✨ Features

### 1. Authentication & User Management

- **Registration**: Username + email + password
- **Email Verification**: Secure tokens with expiry
- **Login**: JWT access + refresh tokens
- **Logout**: Token invalidation
- **Forgot/Reset Password**: Secure flow
- **Change Password**: For logged-in users
- **Roles**: ADMIN, ORGANISER, USER

**Endpoints:**

```
POST   /api/v1/auth/register
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh-token
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
POST   /api/v1/auth/change-password
GET    /api/v1/auth/me
```

### 2. Appointment Configuration (Rule Engine)

AppointmentType defines **RULES**, not availability:

- Duration, capacity, working hours
- Advance booking limits (min/max)
- Price + currency
- Manual confirmation flag
- Advance payment flag
- Booking questions (custom fields)
- Provider assignment (optional)
- Publish/unpublish workflow
- Share enable/disable with secure token

**Endpoints:**

```
GET    /api/v1/appointments              # My appointments
GET    /api/v1/appointments/:id          # Single appointment
POST   /api/v1/appointments              # Create draft
PATCH  /api/v1/appointments/:id          # Update
DELETE /api/v1/appointments/:id          # Soft delete

POST   /api/v1/appointments/:id/publish     # Publish (triggers slot generation)
POST   /api/v1/appointments/:id/unpublish   # Unpublish
POST   /api/v1/appointments/:id/share/enable   # Enable sharing (generates token)
POST   /api/v1/appointments/:id/share/disable # Revoke token

GET    /api/v1/appointments/public/list  # Public directory
```

### 3. Slot Engine (Pre-Generated Inventory)

- Slots are **pre-generated** on publish/share
- No on-demand generation during booking
- Capacity-based (supports group appointments)
- Atomic increment/decrement operations
- Idempotent generation (safe to run multiple times)

**Why Pre-Generation:**

- Prevents race conditions
- Moves expensive operations out of booking flow
- Single source of truth for availability
- Database handles concurrency via optimistic locking

### 4. Availability (Pure Read-Only)

- **Public access** (no authentication)
- Filters by date, appointment type, capacity, provider
- **Never writes** to database
- **Never locks** slots
- **Side-effect free**

**Endpoints:**

```
GET    /api/v1/availability?appointmentTypeId=...&date=YYYY-MM-DD
GET    /api/v1/availability/range?appointmentTypeId=...&startDate=...&endDate=...
```

### 5. Booking (Transactional)

- **MongoDB transactions** (all-or-nothing)
- Atomic slot booking with conditional increment
- Prevents overbooking under concurrency
- Booking lifecycle: PENDING → CONFIRMED → CANCELLED
- Cancellation releases capacity
- Never deletes bookings (audit trail)
- Supports booking questions/answers

**Endpoints:**

```
POST   /api/v1/bookings              # Create booking
GET    /api/v1/bookings              # My bookings
GET    /api/v1/bookings/:id          # Single booking
DELETE /api/v1/bookings/:id          # Cancel booking
```

**Atomicity Guarantee:**

```javascript
// findOneAndUpdate with condition prevents double-booking
const slot = await Slot.findOneAndUpdate(
  {
    _id: slotId,
    status: "AVAILABLE",
    $expr: { $lt: ["$bookedCount", "$capacity"] }, // Key invariant
  },
  { $inc: { bookedCount: 1 } },
  { session } // Transaction
);
```

### 6. Share Appointment (Public Booking)

- **Cryptographically secure tokens** (256-bit)
- Token-based access (not ID-based, prevents enumeration)
- Works even if appointment unpublished
- Revocable tokens
- Public booking uses **same booking service** (no duplication)

**Endpoints:**

```
GET    /api/v1/public/appointments/:token          # Get shared appointment
GET    /api/v1/public/availability/:token?date=... # Availability via token
POST   /api/v1/public/book/:token                  # Book via token
```

### 7. Payment Flow (Advance Payment)

- **Booking Intent**: Temporary reservation with expiry
- Payment processing → Confirm intent → Real booking
- Cancel/expire intent → Release slot
- Webhook endpoint for payment providers
- Background job cleans expired intents

**Endpoints:**

```
POST   /api/v1/payments/intents              # Create booking intent
GET    /api/v1/payments/intents              # My intents
GET    /api/v1/payments/intents/:id          # Single intent
POST   /api/v1/payments/intents/:id/confirm  # Confirm (creates booking)
DELETE /api/v1/payments/intents/:id          # Cancel intent
POST   /api/v1/payments/webhooks             # Payment gateway webhook
```

### 8. Background Jobs

- **Expired Intent Cleanup**: Runs every 5 minutes
- Scans PENDING intents where `expiresAt <= now`
- Marks as EXPIRED
- Slot capacity automatically available again

### 9. Admin Dashboard & Reports

**Real-time aggregation** (no stored report tables):

- **Total Bookings**: Count, status breakdown, 30-day trend
- **Peak Hours**: Busiest appointment times
- **Slot Utilization**: Efficiency metrics
- **User Statistics**: Counts by role, verification status
- **Revenue Analytics**: By status, gateway, trend
- **Booking Intent Funnel**: Conversion rates
- **Provider Utilization**: Busiest providers

**Endpoints:**

```
GET    /api/v1/admin/reports/bookings
GET    /api/v1/admin/reports/peak-hours
GET    /api/v1/admin/reports/slot-utilization
GET    /api/v1/admin/reports/users
GET    /api/v1/admin/reports/revenue
GET    /api/v1/admin/reports/booking-intents
GET    /api/v1/admin/reports/providers
GET    /api/v1/admin/dashboard              # All reports in one call
```

**Why Reports Are Derived, Not Stored:**

1. **Single Source of Truth**: Data lives in operational tables
2. **Flexibility**: Ad-hoc queries without schema changes
3. **Storage Efficiency**: No redundant data
4. **Simplicity**: No synchronization or background jobs

## 🔒 Security

- **Helmet**: HTTP security headers
- **CORS**: Cross-origin resource sharing
- **mongo-sanitize**: NoSQL injection prevention
- **JWT**: Stateless authentication
- **Bcrypt**: Password hashing
- **SHA-256**: Token hashing for sensitive tokens
- **Crypto**: Secure random tokens for sharing

## 🎯 Design Decisions

### Why Pre-Generate Slots?

**Problem**: On-demand slot creation leads to race conditions:

- User A queries available times
- User B queries same times
- Both try to book same slot
- Double-booking occurs

**Solution**: Pre-generated inventory:

- Slots exist before booking attempts
- Atomic `findOneAndUpdate` with condition
- Database serializes conflicting transactions
- Only ONE succeeds when capacity-1 slots remain

### Why Separate Availability from Booking?

**Availability = READ**:

- Fast, cacheable queries
- No side effects
- No locks
- Public access safe

**Booking = WRITE**:

- Transactional
- Authenticated
- Changes state
- Requires validation

### Why Soft Delete?

Never hard-delete:

- Preserves audit trail
- Maintains referential integrity
- Enables analytics (cancellation rates, etc.)
- Allows restoration if needed

### Why MongoDB Transactions?

**ACID Guarantees:**

- **Atomicity**: All operations succeed or all fail
- **Consistency**: Invariant maintained (bookedCount = confirmed bookings)
- **Isolation**: Concurrent bookings don't interfere
- **Durability**: Committed changes survive crashes

## 📊 Database Indexes

```javascript
// Slot Model
appointmentTypeId + startTime + status (compound)
appointmentTypeId + startTime (unique)
providerId (sparse)

// Booking Model
userId + slotId (unique compound)
userId + status + createdAt
slotId

// AppointmentType Model
userId + isDeleted
isPublished + isDeleted
shareToken (unique sparse)
providerId (sparse)
```

## 🧪 Testing

```bash
# Run tests
npm test

# With coverage
npm run test:coverage
```

## 📈 Scalability Considerations

1. **Slot Generation**: Async, can be moved to queue (Redis/Bull)
2. **Reports**: Aggregations can use read replicas
3. **Background Jobs**: Horizontally scalable with distributed locks
4. **Caching**: Add Redis for availability queries
5. **CDN**: Static assets and API responses

## 🚦 API Response Format

**Success:**

```json
{
  "success": true,
  "statusCode": 200,
  "data": { ... },
  "message": "Operation successful"
}
```

**Error:**

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Error description",
  "errors": []
}
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run in development (with nodemon)
npm run dev

# Run in production
npm start

# Check for errors
npm run lint
```

## 📝 License

MIT

## 👨‍💻 Author

SDE-2 Level Implementation following enterprise backend design principles.
