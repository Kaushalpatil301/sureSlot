# Stripe Payment Integration Guide

## Overview

This document explains the Stripe payment integration for the Appointment Scheduling Engine. The integration follows strict enterprise design principles:

- **Stripe NEVER directly modifies slots or bookings**
- **All booking logic flows through `booking.service.js`** (single source of truth)
- **Webhooks are idempotent** (safe to retry)
- **Transactionally correct** (no overbooking, no data inconsistency)

---

## Architecture

### Core Principles

1. **Separation of Concerns**

   - `payment.service.js` handles Stripe API calls and payment logic
   - `booking.service.js` owns slot capacity and booking creation
   - `Stripe webhooks` ONLY confirm/fail BookingIntent, never touch slots directly

2. **Single Source of Truth**

   - ALL booking creation goes through `booking.service.createBooking()`
   - This function has atomic slot increment logic with capacity checks
   - Payment service delegates to booking service for final confirmation

3. **Idempotency**

   - Webhooks can be called multiple times for same event
   - `stripeEventId` stored in Payment model prevents duplicate processing
   - All operations check existing state before applying changes

4. **Graceful Failure**
   - If booking fails after payment succeeds, payment is marked SUCCESS with notes
   - Admin can manually refund or retry booking creation
   - No silent failures - all errors are logged and tracked

---

## Payment Flow

### Step-by-Step Process

```
1. User Selects Slot
   ↓
2. Create BookingIntent (POST /api/v1/payments/intents)
   - Reserves slot temporarily (expires in 15 minutes)
   - Status: PENDING
   ↓
3. Create Stripe Checkout Session (POST /api/v1/payments/stripe/create-checkout-session)
   - Links to existing BookingIntent
   - Status: PAYMENT_PENDING
   - Returns checkoutUrl
   ↓
4. Redirect User to Stripe Checkout
   - User enters payment details on Stripe-hosted page
   - Stripe handles 3D Secure, fraud detection, etc.
   ↓
5. User Completes Payment
   - Stripe processes payment
   ↓
6. Stripe Webhook: checkout.session.completed
   - Creates Payment record with status PROCESSING
   - Updates BookingIntent with stripePaymentIntentId
   ↓
7. Stripe Webhook: payment_intent.succeeded
   - Calls booking.service.createBooking() → CRITICAL STEP
   - Atomic slot increment (respects capacity)
   - Creates Booking record
   - Updates Payment status to SUCCEEDED
   - Updates BookingIntent status to CONFIRMED
   ↓
8. User Redirected to Success Page
   - Frontend shows booking confirmation
```

### Alternative: Payment Failed

```
7. Stripe Webhook: payment_intent.payment_failed
   - Updates Payment status to FAILED
   - Marks BookingIntent as EXPIRED
   - Slot hold released (cleanup job handles this)
   - User can create new intent to retry
```

---

## Environment Variables

### Required Configuration

Add these to your `.env` file:

```bash
# Stripe Secret Key (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_...

# Stripe Webhook Secret (get from Stripe CLI or dashboard)
STRIPE_WEBHOOK_SECRET=whsec_...

# Booking Intent Expiry (optional, default: 15 minutes)
BOOKING_INTENT_EXPIRY_MINUTES=15
```

### Test vs Production Keys

```bash
# Test Mode (for development)
STRIPE_SECRET_KEY=sk_test_51A...
STRIPE_WEBHOOK_SECRET=whsec_...

# Production Mode (for live payments)
STRIPE_SECRET_KEY=sk_live_51A...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**NEVER** commit secret keys to version control!

---

## Local Development Setup

### 1. Install Stripe CLI

```bash
# macOS (Homebrew)
brew install stripe/stripe-cli/stripe

# Linux
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.0/stripe_1.19.0_linux_x86_64.tar.gz
tar -xvf stripe_1.19.0_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/

# Windows (Scoop)
scoop install stripe
```

Verify installation:

```bash
stripe --version
```

### 2. Login to Stripe CLI

```bash
stripe login
```

This opens your browser to authenticate.

### 3. Forward Webhooks to Local Server

```bash
stripe listen --forward-to localhost:8000/api/v1/payments/stripe/webhook
```

**Output:**

```
Ready! Your webhook signing secret is whsec_... (^C to quit)
```

Copy the `whsec_...` secret and add to `.env`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 4. Start Your Server

```bash
npm run dev
```

### 5. Test Payment Flow

Open another terminal and trigger test events:

```bash
# Trigger successful payment
stripe trigger payment_intent.succeeded

# Trigger failed payment
stripe trigger payment_intent.payment_failed
```

---

## API Endpoints

### 1. Create Booking Intent

**POST** `/api/v1/payments/intents`

Creates temporary slot reservation.

**Request:**

```json
{
  "slotId": "65f1234567890abcdef12345",
  "amount": 50.0,
  "currency": "USD",
  "metadata": {
    "notes": "First-time customer",
    "answers": {
      "Phone Number": "+1234567890",
      "Special Requests": "Wheelchair accessible"
    }
  }
}
```

**Response:**

```json
{
  "success": true,
  "statusCode": 201,
  "data": {
    "intent": {
      "_id": "65f9876543210fedcba98765",
      "userId": "65f1111111111111111111111",
      "slotId": "65f1234567890abcdef12345",
      "amount": 50.0,
      "currency": "USD",
      "status": "PENDING",
      "expiresAt": "2025-12-20T10:15:00.000Z"
    },
    "expiresIn": 900
  },
  "message": "Booking intent created successfully"
}
```

---

### 2. Create Stripe Checkout Session

**POST** `/api/v1/payments/stripe/create-checkout-session`

Creates Stripe Checkout Session for existing BookingIntent.

**Request:**

```json
{
  "bookingIntentId": "65f9876543210fedcba98765",
  "successUrl": "https://yourapp.com/booking/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://yourapp.com/booking/cancel"
}
```

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_...",
    "sessionId": "cs_test_a1b2c3d4e5f6...",
    "expiresAt": "2025-12-20T10:15:00.000Z"
  },
  "message": "Stripe Checkout session created successfully"
}
```

**Frontend Action:**

```javascript
// Redirect user to Stripe Checkout
window.location.href = response.data.checkoutUrl;
```

---

### 3. Stripe Webhook Handler

**POST** `/api/v1/payments/stripe/webhook`

Handles Stripe webhook events (called by Stripe, not your frontend).

**Headers:**

```
Content-Type: application/json
stripe-signature: t=1234567890,v1=...
```

**Body:** Raw Stripe event JSON

**Events Handled:**

- `checkout.session.completed` - Payment UI completed
- `payment_intent.succeeded` - Payment confirmed (booking created here)
- `payment_intent.payment_failed` - Payment failed

**Response:**

```json
{
  "success": true,
  "message": "Booking confirmed successfully",
  "eventId": "evt_1ABC..."
}
```

---

### 4. Get Payment Status

**GET** `/api/v1/payments/intents/:intentId/status`

Check payment status for BookingIntent.

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "intentStatus": "CONFIRMED",
    "paymentStatus": "SUCCEEDED",
    "amount": 50.0,
    "currency": "USD",
    "stripeSessionId": "cs_test_...",
    "stripePaymentIntentId": "pi_...",
    "paymentMethod": "CARD",
    "paymentGateway": "STRIPE",
    "expiresAt": "2025-12-20T10:15:00.000Z",
    "isExpired": false
  },
  "message": "Payment status retrieved successfully"
}
```

---

### 5. Get Stripe Session Status

**GET** `/api/v1/payments/stripe/session/:sessionId/status`

Poll Stripe Checkout Session status (useful if webhook delayed).

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "status": "complete",
    "paymentStatus": "paid",
    "amountTotal": 50.0,
    "currency": "usd",
    "paymentIntent": "pi_..."
  },
  "message": "Stripe session status retrieved successfully"
}
```

---

## Frontend Integration Example

### React Example

```javascript
import { useState } from "react";
import axios from "axios";

function BookingFlow({ slotId, amount }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleBooking = async () => {
    try {
      setLoading(true);

      // Step 1: Create BookingIntent
      const intentResponse = await axios.post(
        "/api/v1/payments/intents",
        {
          slotId,
          amount,
          currency: "USD",
          metadata: {
            answers: {
              "Phone Number": "+1234567890",
              "Special Requests": "None",
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      const intentId = intentResponse.data.data.intent._id;

      // Step 2: Create Stripe Checkout Session
      const checkoutResponse = await axios.post(
        "/api/v1/payments/stripe/create-checkout-session",
        {
          bookingIntentId: intentId,
          successUrl: `${window.location.origin}/booking/success`,
          cancelUrl: `${window.location.origin}/booking/cancel`,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      // Step 3: Redirect to Stripe Checkout
      window.location.href = checkoutResponse.data.data.checkoutUrl;
    } catch (err) {
      setError(err.response?.data?.message || "Booking failed");
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleBooking} disabled={loading}>
        {loading ? "Processing..." : "Book & Pay"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
```

### Success Page

```javascript
// pages/booking/success.jsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";

function BookingSuccess() {
  const [searchParams] = useSearchParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");

    if (sessionId) {
      // Poll for booking confirmation (webhook might be delayed)
      const pollStatus = async () => {
        try {
          const response = await axios.get(
            `/api/v1/payments/stripe/session/${sessionId}/status`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }
          );

          if (response.data.data.paymentStatus === "paid") {
            setBooking(response.data.data);
            setLoading(false);
          } else {
            // Keep polling
            setTimeout(pollStatus, 2000);
          }
        } catch (err) {
          console.error("Status check failed:", err);
          setTimeout(pollStatus, 2000);
        }
      };

      pollStatus();
    }
  }, [searchParams]);

  if (loading) {
    return <div>Confirming your booking...</div>;
  }

  return (
    <div>
      <h1>Booking Confirmed!</h1>
      <p>Payment ID: {booking.paymentIntent}</p>
      <p>Amount: ${booking.amountTotal}</p>
    </div>
  );
}
```

---

## Webhook Configuration

### Production Webhook Setup

1. **Login to Stripe Dashboard**  
   https://dashboard.stripe.com/

2. **Navigate to Webhooks**  
   Developers → Webhooks → Add endpoint

3. **Configure Endpoint**

   - **URL:** `https://yourdomain.com/api/v1/payments/stripe/webhook`
   - **Events to send:**
     - `checkout.session.completed`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`

4. **Copy Webhook Secret**  
   Click "Reveal" next to "Signing secret"  
   Add to `.env`: `STRIPE_WEBHOOK_SECRET=whsec_...`

5. **Test Webhook**  
   Stripe dashboard provides "Send test webhook" button

---

## Error Handling

### Common Errors and Solutions

#### 1. `Webhook signature verification failed`

**Cause:** Incorrect `STRIPE_WEBHOOK_SECRET` or body not raw.

**Solution:**

- Verify `STRIPE_WEBHOOK_SECRET` in `.env` matches Stripe dashboard
- Ensure `express.raw()` middleware is registered BEFORE `express.json()`
- Check `app.js` for correct middleware order

#### 2. `BookingIntent has expired`

**Cause:** User took too long to complete payment.

**Solution:**

- Intent expires after 15 minutes (configurable)
- User must create new intent and retry
- Frontend should show expiry countdown timer

#### 3. `Payment succeeded but booking failed`

**Cause:** Slot became full between payment and booking confirmation.

**Solution:**

- Payment record has status `SUCCEEDED` with notes
- BookingIntent stays in `PAYMENT_PENDING` status
- Admin must manually refund payment via Stripe dashboard
- Rare edge case - indicates high slot contention

#### 4. `Stripe is not configured`

**Cause:** Missing `STRIPE_SECRET_KEY` environment variable.

**Solution:**

- Add `STRIPE_SECRET_KEY=sk_test_...` to `.env`
- Restart server
- Verify key is valid in Stripe dashboard

---

## Testing

### Test Card Numbers

Stripe provides test cards for various scenarios:

```
Success: 4242 4242 4242 4242
Declined: 4000 0000 0000 0002
Insufficient Funds: 4000 0000 0000 9995
3D Secure Required: 4000 0027 6000 3184
```

**Expiry:** Any future date (e.g., 12/34)  
**CVC:** Any 3 digits (e.g., 123)  
**ZIP:** Any 5 digits (e.g., 12345)

### Testing Webhooks Locally

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:8000/api/v1/payments/stripe/webhook

# Terminal 3: Trigger events
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
```

### Testing Full Flow

```bash
# 1. Create intent
curl -X POST http://localhost:8000/api/v1/payments/intents \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slotId": "65f1234567890abcdef12345",
    "amount": 50.00
  }'

# 2. Create checkout session
curl -X POST http://localhost:8000/api/v1/payments/stripe/create-checkout-session \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingIntentId": "INTENT_ID_FROM_STEP_1",
    "successUrl": "http://localhost:3000/success",
    "cancelUrl": "http://localhost:3000/cancel"
  }'

# 3. Open checkoutUrl in browser and complete payment

# 4. Webhooks automatically confirm booking
```

---

## Security Checklist

- [ ] `STRIPE_SECRET_KEY` stored in environment variable (not hardcoded)
- [ ] `STRIPE_WEBHOOK_SECRET` configured correctly
- [ ] Webhook signature verification enabled
- [ ] `express.raw()` middleware for webhook route
- [ ] HTTPS enabled in production (required by Stripe)
- [ ] Success/cancel URLs validated (prevent open redirect)
- [ ] Rate limiting on payment endpoints
- [ ] Idempotency checks prevent duplicate webhooks
- [ ] Payment amounts validated server-side (never trust client)

---

## Monitoring and Debugging

### Stripe Dashboard

- **View all payments:** https://dashboard.stripe.com/payments
- **View webhooks:** https://dashboard.stripe.com/webhooks
- **Test mode vs Live mode:** Toggle in top-left corner

### Application Logs

```javascript
// Check server logs for:
console.log(`Event ${event.id} already processed, skipping`); // Duplicate webhook
console.error(`BookingIntent not found for payment intent ${paymentIntent.id}`); // Missing intent
console.error("Booking creation failed after payment:", bookingError); // Critical error
```

### Database Queries

```javascript
// Check BookingIntent status
db.bookingintents.find({ _id: ObjectId("...") });

// Check Payment records
db.payments.find({ stripePaymentIntentId: "pi_..." });

// Check for duplicate Stripe events
db.payments.aggregate([
  { $group: { _id: "$stripeEventId", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
]);
```

---

## Troubleshooting

### Webhook Not Firing Locally

**Problem:** Stripe CLI not forwarding events.

**Solution:**

```bash
# Check Stripe CLI is running
stripe listen --forward-to localhost:8000/api/v1/payments/stripe/webhook

# Verify server is accessible
curl http://localhost:8000/health

# Check webhook secret matches
echo $STRIPE_WEBHOOK_SECRET
```

### Payment Succeeded But No Booking

**Problem:** Booking creation failed after payment.

**Check:**

1. Payment record in database (should have `notes` field with error)
2. BookingIntent status (should be `PAYMENT_PENDING`, not `CONFIRMED`)
3. Slot availability (might have become full)
4. Server logs for error message

**Resolution:**

- Admin issues refund via Stripe dashboard
- Or manually retry booking creation if slot available

### Duplicate Bookings

**Problem:** Same payment created multiple bookings.

**Should NOT happen** due to:

- Idempotency check on `stripeEventId`
- Atomic slot increment in `booking.service.js`

**If occurs:**

- Check `stripeEventId` uniqueness in Payment model
- Verify webhook handler checks for existing payment
- Review server logs for race condition

---

## Advanced: Idempotency Deep Dive

### How Idempotency Works

```javascript
// payment.service.js - handleStripeWebhook()

// Step 1: Check if event already processed
const existingPayment = await Payment.findOne({
  stripeEventId: event.id,
});

if (existingPayment) {
  console.log(`Event ${event.id} already processed, skipping`);
  return { message: "Event already processed", duplicate: true };
}

// Step 2: Check if BookingIntent already confirmed
if (intent.status === "CONFIRMED") {
  console.log(`BookingIntent ${intent._id} already confirmed, skipping`);
  return { message: "Booking already confirmed", bookingIntentId: intent._id };
}

// Step 3: Store stripeEventId in Payment record
await Payment.create({
  // ... other fields
  stripeEventId: event.id, // Unique constraint prevents duplicates
});
```

### Why Multiple Checks?

1. **Event-level check** (`stripeEventId`): Prevents processing same event twice
2. **Intent-level check** (`intent.status`): Handles race conditions between webhooks
3. **Atomic booking creation**: `booking.service.js` uses conditional slot increment

---

## Migration Guide (If Existing System)

If you already have a payment system, follow these steps:

### 1. Update Models

Run these migrations:

```javascript
// Add Stripe fields to BookingIntent
db.bookingintents.updateMany(
  {},
  {
    $set: {
      stripeSessionId: null,
      stripePaymentIntentId: null,
    },
  }
);

// Add Stripe fields to Payment
db.payments.updateMany(
  {},
  {
    $set: {
      stripeSessionId: null,
      stripePaymentIntentId: null,
      stripeEventId: null,
      notes: "",
    },
  }
);
```

### 2. Add Environment Variables

Update `.env`:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Update app.js

Add raw body middleware for webhook route (see app.js section above).

### 4. Test in Development

- Create test BookingIntent
- Generate Stripe Checkout Session
- Complete test payment
- Verify webhook confirmation

### 5. Deploy to Production

- Add production Stripe keys to environment
- Configure webhook endpoint in Stripe dashboard
- Monitor logs for any issues

---

## Support

### Resources

- **Stripe Documentation:** https://stripe.com/docs
- **Stripe CLI:** https://stripe.com/docs/stripe-cli
- **Test Cards:** https://stripe.com/docs/testing
- **Webhook Events:** https://stripe.com/docs/api/events

### Contact

For issues with this integration, check:

1. Server logs (`console.error` messages)
2. Stripe dashboard (webhooks section)
3. Database records (BookingIntent, Payment)
4. This documentation

---

## Summary

✅ **Stripe integration complete**  
✅ **Idempotent webhooks**  
✅ **Transactionally correct**  
✅ **No slot capacity bypass**  
✅ **Single source of truth maintained**  
✅ **Graceful error handling**  
✅ **Production-ready**

**Key Takeaway:** Stripe confirms payments, `booking.service.js` creates bookings. This separation ensures inventory rules are never bypassed, even in edge cases.
