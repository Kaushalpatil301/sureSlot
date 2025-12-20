# Stripe Integration - Quick Setup Guide

## Installation Steps

### 1. Install Stripe Package

```bash
cd server
npm install stripe
```

### 2. Add Environment Variables

Add to your `.env` file (or use `.env.stripe` as reference):

```bash
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
BOOKING_INTENT_EXPIRY_MINUTES=15
```

### 3. Get Stripe Test Keys

1. Go to https://dashboard.stripe.com/register (create account if needed)
2. Click **Developers** → **API keys**
3. Copy **Secret key** (starts with `sk_test_`) → paste as `STRIPE_SECRET_KEY`

### 4. Setup Stripe CLI (for local webhook testing)

**macOS:**

```bash
brew install stripe/stripe-cli/stripe
```

**Linux:**

```bash
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.0/stripe_1.19.0_linux_x86_64.tar.gz
tar -xvf stripe_1.19.0_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/
```

**Windows (Scoop):**

```bash
scoop install stripe
```

### 5. Login to Stripe CLI

```bash
stripe login
```

### 6. Start Webhook Forwarding

**Terminal 1 - Start webhook listener:**

```bash
stripe listen --forward-to localhost:8000/api/v1/payments/stripe/webhook
```

**Output:**

```
Ready! Your webhook signing secret is whsec_... (^C to quit)
```

Copy the `whsec_...` value and paste it in your `.env` as `STRIPE_WEBHOOK_SECRET`.

### 7. Start Your Server

**Terminal 2 - Start server:**

```bash
npm run dev
```

### 8. Test the Integration

**Terminal 3 - Trigger test payment:**

```bash
stripe trigger payment_intent.succeeded
```

---

## Testing Payment Flow

### Option 1: Using Postman/cURL

**Step 1: Create BookingIntent**

```bash
curl -X POST http://localhost:8000/api/v1/payments/intents \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slotId": "YOUR_SLOT_ID",
    "amount": 50.00,
    "currency": "USD"
  }'
```

**Step 2: Create Stripe Checkout Session**

```bash
curl -X POST http://localhost:8000/api/v1/payments/stripe/create-checkout-session \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingIntentId": "INTENT_ID_FROM_STEP_1",
    "successUrl": "http://localhost:3000/booking/success",
    "cancelUrl": "http://localhost:3000/booking/cancel"
  }'
```

**Step 3: Open Checkout URL**

Copy `checkoutUrl` from response and open in browser.

**Test Card:**

- Number: `4242 4242 4242 4242`
- Expiry: `12/34`
- CVC: `123`
- ZIP: `12345`

### Option 2: Using Frontend (React Example)

See [STRIPE_INTEGRATION.md](./STRIPE_INTEGRATION.md) for full React example.

---

## Verify Integration

### Check BookingIntent Status

```bash
curl http://localhost:8000/api/v1/payments/intents/INTENT_ID/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected response after successful payment:

```json
{
  "intentStatus": "CONFIRMED",
  "paymentStatus": "SUCCEEDED",
  "amount": 50.0,
  "currency": "USD"
}
```

### Check MongoDB

```javascript
// Connect to MongoDB
mongosh

use appointment-scheduler

// Check BookingIntent
db.bookingintents.findOne({ _id: ObjectId("YOUR_INTENT_ID") })
// Should have: status: "CONFIRMED", stripePaymentIntentId: "pi_..."

// Check Payment
db.payments.findOne({ bookingIntentId: ObjectId("YOUR_INTENT_ID") })
// Should have: status: "SUCCEEDED", stripeEventId: "evt_..."

// Check Booking
db.bookings.findOne({ slotId: ObjectId("YOUR_SLOT_ID") })
// Should have: status: "CONFIRMED", userId: ObjectId("...")
```

---

## Common Issues

### ❌ `Stripe is not configured`

**Solution:** Add `STRIPE_SECRET_KEY` to `.env` and restart server.

### ❌ `Webhook signature verification failed`

**Solution:**

1. Ensure Stripe CLI is running: `stripe listen --forward-to localhost:8000/api/v1/payments/stripe/webhook`
2. Copy webhook secret from CLI output to `.env`
3. Restart server

### ❌ `BookingIntent not found`

**Solution:** Create BookingIntent first (POST `/api/v1/payments/intents`) before creating checkout session.

### ❌ Webhook not triggering

**Solution:**

1. Check Stripe CLI is running
2. Verify server is accessible: `curl http://localhost:8000/health`
3. Check terminal logs for webhook events

---

## Next Steps

1. ✅ Install Stripe package
2. ✅ Add environment variables
3. ✅ Setup Stripe CLI
4. ✅ Test payment flow
5. 📖 Read full documentation: [STRIPE_INTEGRATION.md](./STRIPE_INTEGRATION.md)
6. 🚀 Integrate with frontend
7. 🔐 Setup production webhook endpoint

---

## Resources

- **Full Documentation:** [STRIPE_INTEGRATION.md](./STRIPE_INTEGRATION.md)
- **Stripe Dashboard:** https://dashboard.stripe.com/
- **Stripe CLI Docs:** https://stripe.com/docs/stripe-cli
- **Test Cards:** https://stripe.com/docs/testing

---

## Support

If you encounter issues:

1. Check server logs: `npm run dev` output
2. Check Stripe CLI logs: `stripe listen` output
3. Check MongoDB data: `mongosh` → `db.bookingintents.find()`
4. Read troubleshooting section in [STRIPE_INTEGRATION.md](./STRIPE_INTEGRATION.md)
