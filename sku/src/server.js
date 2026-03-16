require("dotenv").config();
const express = require("express");
const axios = require("axios");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();

// ─── Security & Middleware ────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);
app.use(cors());
app.use(morgan("combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { success: false, message: "Too many payment requests. Please wait a moment." },
});

// ─── Airtel Money Config ──────────────────────────────────────────────────────
const AIRTEL_BASE_URL =
  process.env.AIRTEL_BASE_URL || "https://openapi.airtel.africa";
const AIRTEL_CLIENT_ID = process.env.AIRTEL_CLIENT_ID || "";
const AIRTEL_CLIENT_SECRET = process.env.AIRTEL_CLIENT_SECRET || "";
const MERCHANT_CODE = process.env.MERCHANT_CODE || "";
const MERCHANT_NAME = process.env.MERCHANT_NAME || "Merchant Store";
const COUNTRY = "ZM";
const CURRENCY = "ZMW";

// ─── In-Memory Token Cache ────────────────────────────────────────────────────
let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.expiresAt - 30000) {
    return tokenCache.token;
  }

  try {
    const response = await axios.post(
      `${AIRTEL_BASE_URL}/auth/oauth2/token`,
      {
        client_id: AIRTEL_CLIENT_ID,
        client_secret: AIRTEL_CLIENT_SECRET,
        grant_type: "client_credentials",
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
        },
        timeout: 15000,
      }
    );

    const { access_token, expires_in } = response.data;
    tokenCache = {
      token: access_token,
      expiresAt: now + (expires_in || 3600) * 1000,
    };

    console.log("[Airtel Auth] Token obtained successfully");
    return access_token;
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error("[Airtel Auth] Failed:", JSON.stringify(msg));
    throw new Error("Authentication with Airtel failed. Check your API credentials.");
  }
}

// ─── Sanitise Zambia phone number → 260XXXXXXXXX ─────────────────────────────
function normalisePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("260") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10)
    return "260" + digits.slice(1);
  if (digits.length === 9) return "260" + digits;
  return null;
}

// ─── Initiate Airtel Money Collection (USSD Push) ─────────────────────────────
async function initiatePayment({ phone, amount, reference }) {
  const token = await getAccessToken();
  const transactionId = uuidv4().replace(/-/g, "").slice(0, 20).toUpperCase();

  const payload = {
    reference: reference || `Pay to ${MERCHANT_NAME}`,
    subscriber: {
      country: COUNTRY,
      currency: CURRENCY,
      msisdn: phone,
    },
    transaction: {
      amount: parseFloat(amount).toFixed(2),
      country: COUNTRY,
      currency: CURRENCY,
      id: transactionId,
    },
  };

  const response = await axios.post(
    `${AIRTEL_BASE_URL}/merchant/v1/payments/`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        "X-Country": COUNTRY,
        "X-Currency": CURRENCY,
        Authorization: `Bearer ${token}`,
      },
      timeout: 30000,
    }
  );

  return { transactionId, data: response.data };
}

// ─── Transaction Status Check ─────────────────────────────────────────────────
async function checkTransactionStatus(transactionId) {
  const token = await getAccessToken();

  const response = await axios.get(
    `${AIRTEL_BASE_URL}/standard/v1/payments/${transactionId}`,
    {
      headers: {
        Accept: "*/*",
        "X-Country": COUNTRY,
        "X-Currency": CURRENCY,
        Authorization: `Bearer ${token}`,
      },
      timeout: 15000,
    }
  );

  return response.data;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Airtel Money Zambia Payment Gateway",
    merchant: MERCHANT_NAME,
    timestamp: new Date().toISOString(),
  });
});

// Merchant info (safe public data only)
app.get("/api/merchant", (_req, res) => {
  res.json({
    name: MERCHANT_NAME,
    merchantCode: MERCHANT_CODE,
    currency: CURRENCY,
    country: "Zambia",
  });
});

// Initiate payment
app.post("/api/pay", paymentLimiter, async (req, res) => {
  const { phone, amount, reference } = req.body;

  // Validation
  if (!phone || !amount) {
    return res.status(400).json({
      success: false,
      message: "Phone number and amount are required.",
    });
  }

  const normalisedPhone = normalisePhone(phone);
  if (!normalisedPhone) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid Zambian phone number. Use format: 097XXXXXXX or 260XXXXXXXXX",
    });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 50000) {
    return res.status(400).json({
      success: false,
      message: "Invalid amount. Must be between ZMW 0.01 and ZMW 50,000.",
    });
  }

  if (!AIRTEL_CLIENT_ID || !AIRTEL_CLIENT_SECRET) {
    return res.status(503).json({
      success: false,
      message: "Payment gateway not configured. Contact the merchant.",
    });
  }

  try {
    console.log(`[Payment] Initiating ZMW ${parsedAmount} from ${normalisedPhone}`);

    const { transactionId, data } = await initiatePayment({
      phone: normalisedPhone,
      amount: parsedAmount,
      reference,
    });

    const status = data?.data?.transaction?.status || data?.status || "PENDING";
    const txId = data?.data?.transaction?.id || transactionId;

    console.log(`[Payment] Initiated → txId=${txId} status=${status}`);

    res.json({
      success: true,
      message:
        "A USSD prompt has been sent to your phone. Please enter your Airtel Money PIN to confirm.",
      transactionId: txId,
      status,
    });
  } catch (err) {
    const errData = err.response?.data;
    const errMsg =
      errData?.message ||
      errData?.error?.message ||
      err.message ||
      "Payment initiation failed.";
    console.error("[Payment] Error:", JSON.stringify(errData || err.message));
    res.status(502).json({ success: false, message: errMsg });
  }
});

// Poll transaction status
app.get("/api/status/:transactionId", paymentLimiter, async (req, res) => {
  const { transactionId } = req.params;
  if (!transactionId || transactionId.length < 5) {
    return res.status(400).json({ success: false, message: "Invalid transaction ID." });
  }

  try {
    const data = await checkTransactionStatus(transactionId);
    const tx = data?.data?.transaction || {};
    const status = tx.status || data?.status || "PENDING";
    const message = tx.message || data?.message || "";

    res.json({
      success: true,
      transactionId,
      status,
      message,
      raw: data,
    });
  } catch (err) {
    const errData = err.response?.data;
    res.status(502).json({
      success: false,
      message: errData?.message || "Could not retrieve transaction status.",
    });
  }
});

// Serve frontend for all unmatched routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Airtel Money Zambia — Payment Gateway`);
  console.log(`  Merchant : ${MERCHANT_NAME}`);
  console.log(`  Code     : ${MERCHANT_CODE}`);
  console.log(`  Port     : ${PORT}`);
  console.log("═══════════════════════════════════════════════════");
});

module.exports = app;
