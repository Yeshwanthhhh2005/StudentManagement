# WhatsApp Campaign Management Platform

A scalable WhatsApp campaign platform for an EdTech organisation (~300K student
records). Admins import students, build segmented campaigns, send WhatsApp
messages at scale through a rate-limited queue, and monitor delivery in real time.

## Architecture

```
                         ┌─────────────────────────────┐
   React (Vite) UI  ───▶ │  Express API  (src/server)  │
   Socket.IO live   ◀─── │  • auth / students / campaigns / templates / analytics
                         │  • scheduler (scheduled campaigns)
                         └──────────────┬──────────────┘
                                        │ enqueue jobs (BullMQ)
                                        ▼
                         ┌─────────────────────────────┐        Meta WhatsApp
   Worker process   ───▶ │  Redis  ◀── BullMQ queue     │ ─────▶  Cloud API
   (src/queues/worker)   │  rate-limited, retries       │
                         └──────────────┬──────────────┘
                                        │ delivery / read receipts
                                        ▼
                         POST /webhook/whatsapp  ──▶ tracking ──▶ MongoDB
```

### The 6 modules
| # | Module | Code |
|---|--------|------|
| 1 | Student Management | `models/Student.js`, `services/importService.js`, `routes/student.routes.js` |
| 2 | Campaign Management | `models/Campaign.js`, `models/MessageTemplate.js`, `routes/campaign.routes.js`, `services/scheduler.js` |
| 3 | Queue Infrastructure | `queues/messageQueue.js`, `queues/worker.js` (BullMQ + Redis, rate limiter, retries) |
| 4 | WhatsApp Integration | `services/whatsapp/` — `BaseProvider` + `MetaProvider` + `MockProvider` (pluggable) |
| 5 | Message Tracking | `models/CampaignMessage.js`, `routes/webhook.routes.js`, `services/trackingService.js` |
| 6 | Analytics Dashboard | `routes/analytics.routes.js` + React dashboard |

## Tech stack
React · Node.js/Express · MongoDB (Mongoose) · BullMQ + Redis · Socket.IO · Meta WhatsApp Cloud API

---

## Prerequisites
- Node.js 18+
- MongoDB (local or [Atlas](https://www.mongodb.com/atlas))
- Redis (local or [Redis Cloud](https://redis.com/try-free/))

## Setup

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env       # then edit .env (see below)
npm run seed               # creates admin + sample template + 500 demo students
#   node src/scripts/seed.js 50000   # to seed more students for load testing
```

Run the **API** and the **worker** in two terminals:
```bash
npm run dev                # API on http://localhost:5000
npm run worker             # message worker (start one or more)
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```
Login with the seeded credentials (`admin@example.com` / `Admin@12345`, or whatever
you set in `.env`).

---

## Configuring the Meta WhatsApp Cloud API (Module 4)

The platform defaults to `WHATSAPP_PROVIDER=meta`. To send real messages:

1. Create a Meta app at <https://developers.facebook.com> → add the **WhatsApp** product.
2. From **WhatsApp → API Setup**, copy:
   - **Phone number ID** → `META_PHONE_NUMBER_ID`
   - A **permanent access token** (System User token recommended) → `META_ACCESS_TOKEN`
   - **WhatsApp Business Account ID** → `META_WABA_ID`
3. In **App Settings → Basic**, copy the **App Secret** → `META_APP_SECRET`.
4. Create + get approval for message **templates** in WhatsApp Manager. Put the
   approved template name into a template's **Meta template name** field in the UI
   (campaigns to recipients outside a 24h session window must use approved templates).

### Webhook (delivery + read receipts — Module 5)
1. Expose your local API publicly (e.g. `ngrok http 5000`).
2. In the Meta app → **WhatsApp → Configuration → Webhook**:
   - Callback URL: `https://<your-host>/webhook/whatsapp`
   - Verify token: the value of `META_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
3. Meta will GET the URL to verify, then POST status updates which the platform
   correlates to messages and reflects live on the dashboard.

### No credentials yet? Use the mock provider
Set `WHATSAPP_PROVIDER=mock` in `.env`. Sends return fake `wamid`s and simulate
`delivered`/`read` callbacks after a short delay — useful for testing the queue,
tracking, and dashboard end-to-end without a Meta account.

---

## Scale & reliability notes
- **300K imports**: CSV import is a streaming parser with 2K-row bulk upserts
  (constant memory); students are upserted on `phone` so re-imports dedupe.
- **Enqueue**: campaign audience is streamed via a MongoDB cursor and inserted +
  enqueued in 2K batches — a 300K campaign never loads into memory at once.
- **Rate limiting**: the worker uses a shared Redis-backed BullMQ limiter
  (`SEND_RATE_PER_SECOND`) so multiple workers collectively stay under Meta's
  rate limits.
- **Retries**: jobs retry with exponential backoff (`JOB_MAX_ATTEMPTS`); only
  exhausted jobs are marked `failed`.
- **Out-of-order webhooks**: status transitions are rank-guarded so a late
  `delivered` can't overwrite a `read`.
- **Scale out**: run more `npm run worker` processes to increase throughput.

## Key environment variables
See [`backend/.env.example`](backend/.env.example) for the full list — MongoDB,
Redis, JWT, Meta credentials, and queue throughput tuning.
