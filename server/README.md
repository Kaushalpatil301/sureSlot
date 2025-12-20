# SureSlot - Production-Grade Appointment Scheduling Engine

A complete, enterprise-level appointment scheduling backend built with Node.js, Express, and MongoDB.

## 🚀 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (Access + Refresh Tokens)
- **Security**: Helmet, CORS, mongo-sanitize
- **Transactions**: MongoDB ACID transactions
- **Background Jobs**: Cron-based cleanup

## 📦 Installation

```bash
cd server
npm install
```

## 🔧 Environment Setup

Create `.env` file in server directory:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/sureslot

# JWT
ACCESS_TOKEN_SECRET=your-access-token-secret
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_SECRET=your-refresh-token-secret
REFRESH_TOKEN_EXPIRY=7d

# CORS
CORS_ORIGIN=http://localhost:3000

# Email (optional)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-app-password

# Booking Intent
BOOKING_INTENT_EXPIRY_MINUTES=15
```

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
