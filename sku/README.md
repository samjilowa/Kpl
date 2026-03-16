# Airtel Money Zambia — Merchant Payment Gateway

A clean, production-ready payment page for **Airtel Money Zambia** using the official Airtel Africa Open API. Deployable to [Railway](https://railway.app) in minutes.

---

## How It Works

1. **Merchant code is embedded** in the server via environment variables — never exposed to end users.
2. Customer enters their **Airtel Money phone number** and the **payment amount**.
3. Customer enters their **4-digit Airtel Money PIN** on the secure payment page.
4. The backend calls the Airtel Africa Merchant Collection API, which triggers a **USSD push** to the customer's phone.
5. The page **polls for status** every 5 seconds and shows the result.

---

## Airtel Africa API Endpoints Used

| Purpose             | Method | Endpoint                                |
|---------------------|--------|-----------------------------------------|
| Authentication      | POST   | `/auth/oauth2/token`                    |
| Initiate Payment    | POST   | `/merchant/v1/payments/`                |
| Check Status        | GET    | `/standard/v1/payments/{transactionId}` |

Base URLs:
- **Production**: `https://openapi.airtel.africa`
- **Sandbox/UAT**: `https://openapiuat.airtel.africa`

---

## Quick Start

### 1. Clone & Install
```bash
git clone <your-repo>
cd airtel-pay
npm install
```

### 2. Set Up Environment Variables
```bash
cp .env.example .env
# Edit .env with your credentials
```

| Variable              | Description                                            |
|-----------------------|--------------------------------------------------------|
| `AIRTEL_CLIENT_ID`    | From Airtel Africa Developer Portal                    |
| `AIRTEL_CLIENT_SECRET`| From Airtel Africa Developer Portal                    |
| `AIRTEL_BASE_URL`     | `https://openapi.airtel.africa` (prod) or UAT URL      |
| `MERCHANT_CODE`       | Your Airtel Money merchant code                        |
| `MERCHANT_NAME`       | Display name shown on payment page                     |

### 3. Run Locally
```bash
npm start
# → http://localhost:3000
```

---

## Deploy to Railway

### Option A – Railway CLI (fastest)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Then set environment variables in the Railway dashboard under **Variables**.

### Option B – GitHub Deploy
1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select your repo
4. Add the environment variables in **Variables** tab
5. Railway auto-detects Node.js and deploys

### Required Railway Environment Variables
Set these under your service → **Variables**:
```
AIRTEL_CLIENT_ID     = <your_client_id>
AIRTEL_CLIENT_SECRET = <your_client_secret>
AIRTEL_BASE_URL      = https://openapi.airtel.africa
MERCHANT_CODE        = <your_merchant_code>
MERCHANT_NAME        = <your_business_name>
```

---

## Getting Airtel Africa API Credentials

1. Register at [https://developers.airtel.africa](https://developers.airtel.africa)
2. Create a new application
3. Subscribe to: **Collection API** and **Auth API**
4. Retrieve your `Client ID` and `Client Secret`
5. Submit KYC documents to go live in production

---

## API Endpoints (Internal)

| Route                          | Description                        |
|--------------------------------|------------------------------------|
| `GET /health`                  | Health check (for Railway)         |
| `GET /api/merchant`            | Public merchant info               |
| `POST /api/pay`                | Initiate payment                   |
| `GET /api/status/:txId`        | Poll transaction status            |

### POST /api/pay – Request Body
```json
{
  "phone":     "0971234567",
    "amount":    150.00,
      "reference": "Order #1234"
      }
      ```

      ---

      ## Security
      - API credentials are **server-side only** — never sent to the browser
      - Rate limiting: 10 requests per minute per IP
      - Helmet.js for HTTP security headers
      - Input validation on all fields
      - HTTPS enforced by Railway

      ---

      ## Country & Currency
      | Field    | Value |
      |----------|-------|
      | Country  | `ZM`  |
      | Currency | `ZMW` |
      | Network  | Airtel Money Zambia |

