# Stripe Integration - Quick Reference Card

## 🚀 Installation (One-Time Setup)

```bash
# 1. Install Stripe package
npm install stripe

# 2. Add to .env
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here

# 3. Start webhook listener (keep running)
stripe listen --forward-to localhost:8000/api/v1/payments/stripe/webhook

# 4. Start server
npm run dev
```

---

## 📡 API Endpoints

### Create Booking Intent

```http
POST /api/v1/payments/intents
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "slotId": "65f1234567890abcdef12345",
  "amount": 50.00,
  "currency": "USD"
}
```

### Create Stripe Checkout Session

```http
POST /api/v1/payments/stripe/create-checkout-session
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "bookingIntentId": "{INTENT_ID_FROM_ABOVE}",
  "successUrl": "http://localhost:3000/booking/success",
  "cancelUrl": "http://localhost:3000/booking/cancel"
}
```

### Check Payment Status

```http
GET /api/v1/payments/intents/{intentId}/status
Authorization: Bearer {JWT_TOKEN}
```

---

## 🧪 Test Cards

| Card Number         | Result                |
| ------------------- | --------------------- |
| 4242 4242 4242 4242 | ✅ Success            |
| 4000 0000 0000 0002 | ❌ Declined           |
| 4000 0000 0000 9995 | ❌ Insufficient Funds |

Expiry: Any future date (e.g., 12/34)  
CVC: Any 3 digits (e.g., 123)  
ZIP: Any 5 digits (e.g., 12345)

---

## 🔧 Quick Debugging

### Check BookingIntent

```javascript
mongosh
use appointment-scheduler
db.bookingintents.findOne({ _id: ObjectId("...") })
// Look for: status, stripeSessionId, stripePaymentIntentId
```

### Check Payment

```javascript
db.payments.findOne({ bookingIntentId: ObjectId("...") });
// Look for: status, stripeEventId, notes
```

### Check Booking

```javascript
db.bookings.findOne({ slotId: ObjectId("...") });
// Should exist if payment succeeded
```

---

## 🐛 Common Issues

| Error                                   | Fix                                             |
| --------------------------------------- | ----------------------------------------------- |
| `Stripe is not configured`              | Add `STRIPE_SECRET_KEY` to `.env` and restart   |
| `Webhook signature verification failed` | Copy webhook secret from `stripe listen` output |
| `BookingIntent not found`               | Create intent first (POST `/intents`)           |
| Webhook not triggering                  | Check `stripe listen` is running                |

---

## 📊 Payment Flow States

```
PENDING → PAYMENT_PENDING → CONFIRMED
            ↓
         EXPIRED (if payment fails/timeout)
```

---

## 🔑 Environment Variables

```bash
# Required
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional (default: 15 minutes)
BOOKING_INTENT_EXPIRY_MINUTES=15
```

---

## 📚 Full Documentation

- **Setup Guide:** [STRIPE_SETUP.md](./STRIPE_SETUP.md)
- **Full Docs:** [STRIPE_INTEGRATION.md](./STRIPE_INTEGRATION.md)
- **Summary:** [STRIPE_SUMMARY.md](./STRIPE_SUMMARY.md)

---

## 🎯 Production Checklist

- [ ] Replace test keys with live keys (`sk_live_...`)
- [ ] Configure webhook in Stripe Dashboard
- [ ] Enable HTTPS (required by Stripe)
- [ ] Set `NODE_ENV=production`
- [ ] Test with real small payment
- [ ] Monitor webhook events in Stripe Dashboard

---

## 📞 Quick Links

- **Stripe Dashboard:** https://dashboard.stripe.com/
- **Test Cards:** https://stripe.com/docs/testing
- **Stripe CLI:** https://stripe.com/docs/stripe-cli
- **Webhook Events:** https://dashboard.stripe.com/webhooks
