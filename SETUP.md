# Setup & Credentials — One Page

Everything you need to run the platform for real. All values go in `backend/.env`
(copy from `backend/.env.example`).

## Accounts to create (3)
1. **MongoDB Atlas** — https://www.mongodb.com/atlas (free cluster)
2. **Redis Cloud** — https://redis.com/try-free (free DB)
3. **Meta Developer app** — https://developers.facebook.com (add the WhatsApp product)

## Credentials checklist

| Variable | Required | What / where to get it |
|----------|:---:|------------------------|
| `MONGODB_URI` | ✅ | Atlas → Connect → Drivers → copy `mongodb+srv://…` (has DB user+password) |
| `REDIS_HOST` | ✅ | Redis Cloud → Connect |
| `REDIS_PORT` | ✅ | Redis Cloud → Connect |
| `REDIS_PASSWORD` | ✅ | Redis Cloud → Connect |
| `REDIS_TLS` | ✅ | set `true` for Redis Cloud |
| `JWT_SECRET` | ✅ | You generate it (see command below) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ | You choose; first admin login (created by `npm run seed`) |
| `META_ACCESS_TOKEN` | ✅* | Meta → WhatsApp → API Setup (use a **permanent** System User token) |
| `META_PHONE_NUMBER_ID` | ✅* | Meta → WhatsApp → API Setup |
| `META_WABA_ID` | ✅* | Meta → WhatsApp → API Setup |
| `META_APP_SECRET` | ✅* | Meta → App Settings → Basic |
| `META_WEBHOOK_VERIFY_TOKEN` | ✅* | **You invent it** — any random string |
| `META_API_VERSION` | — | leave default `v21.0` |
| `WHATSAPP_PROVIDER` | ✅ | `meta` for real sends, `mock` for demo (no Meta needed) |
| `DEFAULT_COUNTRY_CODE` | — | default `91` (India) for bare 10-digit numbers |

`*` = required only when `WHATSAPP_PROVIDER=meta`. Use `mock` to demo everything
end-to-end with just MongoDB + Redis.

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Meta WhatsApp — one-time prerequisites (for real sends)
- A **verified Meta Business account** (Business Verification).
- A **WhatsApp Business phone number** added to the app.
- **Pre-approved message templates** in WhatsApp Manager → put each approved
  template's name into the template's "Meta template name" field in the app
  (needed to message users outside a 24-hour window).
- Before verification you can only message a few **test numbers** registered in the dashboard.

### Webhook (delivery/read receipts)
1. Expose the API publicly: `ngrok http 5000`
2. Meta → WhatsApp → Configuration → Webhook:
   - Callback URL: `https://<your-host>/webhook/whatsapp`
   - Verify token: same value as `META_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to the **messages** field.

## Run it
```bash
# backend
cd backend
npm install
cp .env.example .env        # fill in the values above
npm run seed                # admin + sample template + demo students
npm run dev                 # API  → http://localhost:5000  (terminal 1)
npm run worker              # message worker                (terminal 2)

# frontend
cd frontend
npm install
npm run dev                 # http://localhost:5173
```
Login with your `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## No-Meta demo (fastest)
Set `WHATSAPP_PROVIDER=mock` in `.env`. Only **MongoDB + Redis** are needed (local
Docker works: `docker run -d -p 27017:27017 mongo:7` and
`docker run -d -p 6379:6379 redis:7-alpine`). Sends are simulated with fake
delivered/read receipts so the queue, tracking, and dashboards all work.
