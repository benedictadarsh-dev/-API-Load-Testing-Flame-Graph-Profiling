const express = require("express");
const app = express();
const PORT = process.env.PORT || 3001;

// --- Synthetic Domain Dataset Generation ---
const COUNTRIES = ["US", "DE", "GB", "FR", "JP", "CA", "AU", "SG", "NL", "CH"];
const CATEGORIES = ["hardware", "software", "cloud_hosting", "consulting", "logistics", "support"];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "SGD", "CHF"];

// Generate 1,500 Tax Rules
const TAX_RULES = [];
for (let i = 0; i < 1500; i++) {
  const country = COUNTRIES[i % COUNTRIES.length];
  const category = CATEGORIES[i % CATEGORIES.length];
  TAX_RULES.push({
    id: `rule-${i}`,
    country,
    category,
    regionTier: (i % 5) + 1,
    vatRate: 0.05 + ((i % 20) * 0.01),
    complianceFlags: `ISO-27001-CERT-${i}`
  });
}

// Generate Currency Rates Matrix
const BASE_RATES = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.29,
  JPY: 0.0067,
  CAD: 0.74,
  AUD: 0.66,
  SGD: 0.75,
  CHF: 1.13
};

// Generate 1,000 Transactions for each workload batch
function generateTransactions(count = 1000) {
  const transactions = [];
  for (let i = 0; i < count; i++) {
    transactions.push({
      id: `tx-${i}`,
      amount: 50 + (i % 950),
      currency: CURRENCIES[i % CURRENCIES.length],
      country: COUNTRIES[(i * 3) % COUNTRIES.length],
      category: CATEGORIES[(i * 7) % CATEGORIES.length],
      timestamp: Date.now() - (i * 3600000),
      referenceNote: `Order settlement reference token #tx-audit-ref-${i}-code`
    });
  }
  return transactions;
}

const BATCH_TRANSACTIONS = generateTransactions(800);

// ============================================================================
// 1. UNOPTIMIZED (SLOW) IMPLEMENTATION - CPU HOT PATH
// ============================================================================

// Bottleneck 1: Unindexed O(N) array search on every transaction
function findTaxRuleSlow(country, category) {
  // Linear scan over 1,500 objects on every single transaction invocation
  for (let i = 0; i < TAX_RULES.length; i++) {
    const rule = TAX_RULES[i];
    if (rule.country === country && rule.category === category) {
      return rule;
    }
  }
  return { vatRate: 0.15 };
}

// Bottleneck 2: Redundant object cloning, string parsing, and regex in inner loop
function convertCurrencySlow(amount, fromCur, toCur) {
  // Deep clones the rate object on every conversion
  const clonedRates = JSON.parse(JSON.stringify(BASE_RATES));
  
  // Redundant regex validation in hot loop
  const validRegex = /^[A-Z]{3}$/;
  if (!validRegex.test(fromCur) || !validRegex.test(toCur)) {
    return amount;
  }

  const fromRate = clonedRates[fromCur] || 1.0;
  const toRate = clonedRates[toCur] || 1.0;
  const inUSD = amount * fromRate;
  return inUSD / toRate;
}

// Bottleneck 3: Nested quadratic string risk scoring
function computeRiskScoreSlow(note) {
  let score = 0;
  // O(L^2) redundant substring comparison loop
  for (let i = 0; i < note.length; i++) {
    for (let j = i + 1; j < note.length; j++) {
      if (note.charCodeAt(i) === note.charCodeAt(j)) {
        score += (j - i) % 3;
      }
    }
  }
  return score % 100;
}

// The parent hot path function: calculateFinancialReportSlow
function calculateFinancialReportSlow(transactions) {
  let totalGrossUSD = 0;
  let totalNetUSD = 0;
  let totalTaxUSD = 0;
  let riskAccumulator = 0;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    // HOT PATH CALL 1
    const rule = findTaxRuleSlow(tx.country, tx.category);

    // HOT PATH CALL 2
    const amountUSD = convertCurrencySlow(tx.amount, tx.currency, "USD");

    // HOT PATH CALL 3
    const risk = computeRiskScoreSlow(tx.referenceNote);

    const taxUSD = amountUSD * rule.vatRate;
    totalGrossUSD += amountUSD;
    totalTaxUSD += taxUSD;
    totalNetUSD += (amountUSD - taxUSD);
    riskAccumulator += risk;
  }

  return {
    itemCount: transactions.length,
    totalGrossUSD: Math.round(totalGrossUSD * 100) / 100,
    totalNetUSD: Math.round(totalNetUSD * 100) / 100,
    totalTaxUSD: Math.round(totalTaxUSD * 100) / 100,
    averageRiskScore: Math.round(riskAccumulator / transactions.length)
  };
}

// ============================================================================
// 2. OPTIMIZED (FAST) IMPLEMENTATION - HOT PATH REMOVED
// ============================================================================

// Optimization 1: Pre-indexed O(1) Hash Map for Tax Rules
const TAX_RULES_MAP = new Map();
for (const rule of TAX_RULES) {
  const key = `${rule.country}:${rule.category}`;
  if (!TAX_RULES_MAP.has(key)) {
    TAX_RULES_MAP.set(key, rule.vatRate);
  }
}

// Optimization 2: Pre-computed direct exchange conversion factors
const CURRENCY_TO_USD_FACTORS = Object.freeze({ ...BASE_RATES });

function convertCurrencyFast(amount, fromCur, toCur) {
  const fromRate = CURRENCY_TO_USD_FACTORS[fromCur] || 1.0;
  const toRate = CURRENCY_TO_USD_FACTORS[toCur] || 1.0;
  return (amount * fromRate) / toRate;
}

// Optimization 3: O(L) single-pass frequency count
function computeRiskScoreFast(note) {
  let hash = 0;
  for (let i = 0; i < note.length; i++) {
    hash = (hash * 31 + note.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

function calculateFinancialReportFast(transactions) {
  let totalGrossUSD = 0;
  let totalNetUSD = 0;
  let totalTaxUSD = 0;
  let riskAccumulator = 0;

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    // O(1) Map lookup
    const vatRate = TAX_RULES_MAP.get(`${tx.country}:${tx.category}`) || 0.15;

    // Direct arithmetic conversion without cloning or regex
    const amountUSD = convertCurrencyFast(tx.amount, tx.currency, "USD");

    // O(L) linear hash
    const risk = computeRiskScoreFast(tx.referenceNote);

    const taxUSD = amountUSD * vatRate;
    totalGrossUSD += amountUSD;
    totalTaxUSD += taxUSD;
    totalNetUSD += (amountUSD - taxUSD);
    riskAccumulator += risk;
  }

  return {
    itemCount: transactions.length,
    totalGrossUSD: Math.round(totalGrossUSD * 100) / 100,
    totalNetUSD: Math.round(totalNetUSD * 100) / 100,
    totalTaxUSD: Math.round(totalTaxUSD * 100) / 100,
    averageRiskScore: Math.round(riskAccumulator / transactions.length)
  };
}

// ============================================================================
// Express Route Endpoints
// ============================================================================

// Graceful shutdown endpoint to ensure clean profile flush
app.all("/admin/shutdown", (req, res) => {
  res.json({ status: "shutting_down" });
  setTimeout(() => {
    server.close(() => {
      console.log("[Server] Server closed, flushing V8 CPU profile...");
      process.exit(0);
    });
  }, 100);
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: Date.now() });
});

// Endpoint 1: Unoptimized slow route
app.get("/api/report/unoptimized", (req, res) => {
  const report = calculateFinancialReportSlow(BATCH_TRANSACTIONS);
  res.json({ mode: "unoptimized", report });
});

// Endpoint 2: Optimized fast route
app.get("/api/report/optimized", (req, res) => {
  const report = calculateFinancialReportFast(BATCH_TRANSACTIONS);
  res.json({ mode: "optimized", report });
});

// Endpoint 3: Dynamic route controlled via query param ?mode=slow|fast
app.get("/api/report", (req, res) => {
  const mode = req.query.mode === "fast" ? "fast" : "slow";
  if (mode === "fast") {
    const report = calculateFinancialReportFast(BATCH_TRANSACTIONS);
    return res.json({ mode: "fast", report });
  } else {
    const report = calculateFinancialReportSlow(BATCH_TRANSACTIONS);
    return res.json({ mode: "slow", report });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[Project-27] Profiling API Server listening on http://localhost:${PORT}`);
  console.log(`Endpoints available:`);
  console.log(`  - GET /api/report/unoptimized (Slow hot path)`);
  console.log(`  - GET /api/report/optimized   (Optimized hot path)`);
  console.log(`  - GET /health`);
});

// Handle graceful shutdown for CPU profile writing
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

module.exports = { app, server };
