'use strict';

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { getPlaidClient }   = require('./plaid-client');
const { getTokens }        = require('./tokens');
const { getSnapshotPath }  = require('./paths');

// ── Category mapping ──────────────────────────────────────────────────────────
const CAT_MAP = {
  FOOD_AND_DRINK:         'Eating Out',
  FOOD_BEVERAGE_ALCOHOL:  'Bars/Alcohol',
  DRINKING_PLACES:        'Bars/Alcohol',
  GROCERY_STORES:         'Groceries',
  COFFEE_SHOP:            'Eating Out',
  TRAVEL:                 'Travel',
  AIRLINES:               'Travel',
  LODGING:                'Travel',
  GAS_STATIONS:           'Gas',
  TAXI_RIDE_SHARE:        'Uber/Transportation',
  UTILITIES:              'Electricity',
  GYMS_FITNESS:           'Health/Wellness',
  PHARMACIES:             'Health/Wellness',
  PERSONAL_CARE:          'Health/Wellness',
  SPORTING_GOODS:         'Skiing',
  GOLF:                   'Golf',
  GENERAL_MERCHANDISE:    'Shopping',
  CLOTHING:               'Clothes',
  ENTERTAINMENT:          'Entertainment',
  GAMBLING:               'Gambling',
  HOME_IMPROVEMENT:       'General Household Items',
  LOAN_PAYMENTS:          'Loan Payments',
  CREDIT_CARD_PAYMENT:    null,
  TRANSFER_IN:            null,
  TRANSFER_OUT:           null,
  PAYMENT:                null,
};

const mapCat = (raw) => {
  if (!raw) return 'General';
  const key = raw.toUpperCase().replace(/\s+/g, '_');
  return key in CAT_MAP ? CAT_MAP[key] : 'General';
};

// ── Plaid fetchers ────────────────────────────────────────────────────────────
async function fetchBalances(label, token) {
  const plaid = getPlaidClient();
  const { data } = await plaid.accountsBalanceGet({ access_token: token });
  return data.accounts.map(a => ({
    institution: label,
    name:        a.name,
    type:        a.type,
    subtype:     a.subtype,
    balance:     a.balances.current ?? a.balances.available ?? 0,
  }));
}

async function fetchTransactions(label, token, days = 45) {
  const plaid = getPlaidClient();
  const end   = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const { data } = await plaid.transactionsGet({
    access_token: token,
    start_date:   start,
    end_date:     end,
    options:      { count: 500, include_personal_finance_category: true },
  });
  return data.transactions
    .filter(t => !t.pending)
    .map(t => {
      const primary  = t.personal_finance_category?.primary  || '';
      const detailed = t.personal_finance_category?.detailed || '';

      // Income: money INTO account (negative Plaid amount) from external source.
      // TRANSFER_IN_ACCOUNT_TRANSFER and INVESTMENT moves are self-transfers — not income.
      let incomeCategory = null;
      if (t.amount < 0) {
        if (primary === 'INCOME') {
          incomeCategory = 'income';
        } else if (
          primary === 'TRANSFER_IN' &&
          !detailed.includes('ACCOUNT_TRANSFER') &&
          !detailed.includes('INVESTMENT_AND_RETIREMENT')
        ) {
          incomeCategory = 'deposit';
        }
      }

      return {
        id:             t.transaction_id,
        date:           t.date,
        name:           t.name,
        amount:         t.amount,
        category:       mapCat(primary),
        institution:    label,
        incomeCategory,
      };
    });
}

async function fetchHoldings(label, token) {
  const plaid = getPlaidClient();
  try {
    const { data } = await plaid.investmentsHoldingsGet({ access_token: token });
    return data.holdings.map(h => {
      const sec = data.securities.find(s => s.security_id === h.security_id) || {};
      return {
        institution: label,
        ticker:      sec.ticker_symbol || sec.name?.split(' ')[0] || 'Unknown',
        name:        sec.name || '',
        shares:      h.quantity,
        price:       h.institution_price,
        value:       h.institution_value,
      };
    });
  } catch (e) {
    console.error(`[sync] holdings error for ${label}:`, e.response?.data?.error_message || e.message);
    return [];
  }
}

// ── Per-institution fetch with error isolation ────────────────────────────────
async function syncInstitution(inst, token) {
  const result = { label: inst.label, accounts: [], transactions: [], holdings: [], error: null };
  try {
    [result.accounts, result.transactions] = await Promise.all([
      fetchBalances(inst.label, token),
      fetchTransactions(inst.label, token),
    ]);
    if (inst.holdings) {
      result.holdings = await fetchHoldings(inst.label, token);
    }
  } catch (e) {
    result.error = e.response?.data?.error_message || e.message;
    console.error(`[sync] ${inst.label} failed:`, result.error);
  }
  return result;
}

// ── Computations ──────────────────────────────────────────────────────────────
function computeNetWorth(accounts) {
  let total = 0;
  for (const a of accounts) {
    const t = (a.type    || '').toLowerCase();
    const s = (a.subtype || '').toLowerCase();
    if (['investment', 'brokerage'].includes(t) ||
        ['401k', 'roth', 'hsa', 'roth ira', 'brokeragelink'].includes(s)) {
      total += a.balance;
    } else if (t === 'credit' || s === 'credit card') {
      total -= a.balance;
    } else if (t === 'depository') {
      total += a.balance;
    } else if (s === 'student' || s === 'loan') {
      total -= a.balance;
    }
  }
  return total;
}

function computeVelocity(history) {
  const dated = history.filter(h => h.date);
  if (dated.length < 2) return null;
  const first = dated[0];
  const last  = dated[dated.length - 1];
  const days  = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (days < 1) return null;
  return ((last.value - first.value) / days) * 7; // $/week
}

function computeIncome(allTransactions) {
  const incomeTx = allTransactions.filter(t => t.incomeCategory !== null);
  const thisYear = new Date().getFullYear().toString();
  const ago30    = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const byMonth = {};
  for (const t of incomeTx) {
    const month = t.date.substring(0, 7);
    if (!byMonth[month]) byMonth[month] = { month, gross: 0, verified: 0, unverified: 0 };
    const amt = Math.abs(t.amount);
    byMonth[month].gross += amt;
    if (t.incomeCategory === 'income') byMonth[month].verified   += amt;
    else                               byMonth[month].unverified += amt;
  }

  const monthly = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  const ytd     = monthly.filter(m => m.month.startsWith(thisYear))
                         .reduce((s, m) => s + m.gross, 0);
  const last30d = incomeTx.filter(t => t.date >= ago30)
                          .reduce((s, t) => s + Math.abs(t.amount), 0);

  return { monthly, ytd, last30d };
}

function computeAllocationsFromHoldings(holdings, portfolio) {
  const { targets, tickerMap } = portfolio;
  const byClass = {};
  const total   = holdings.reduce((s, h) => s + h.value, 0);

  for (const h of holdings) {
    const cls = tickerMap[h.ticker] || 'Other';
    byClass[cls] = (byClass[cls] || 0) + h.value;
  }

  return targets.map(t => {
    const actualValue = byClass[t.name] || 0;
    const actual      = total > 0 ? (actualValue / total) * 100 : 0;
    const rounded     = Math.round(actual * 10) / 10;
    const planValue   = (t.target / 100) * total;
    return {
      name:            t.name,
      target:          t.target,
      actual:          rounded,
      threshold:       t.threshold,
      withinThreshold: Math.abs(rounded - t.target) <= t.threshold,
      value:           Math.round(actualValue),
      planValue:       Math.round(planValue),
      rebalance:       Math.round(actualValue - planValue),
    };
  });
}

// Account-type fallback when no holdings data is available
function computeAllocationsFromAccounts(accounts, targets) {
  let investments = 0, cash = 0;
  for (const a of accounts) {
    const t = (a.type    || '').toLowerCase();
    const s = (a.subtype || '').toLowerCase();
    if (['investment', 'brokerage'].includes(t) ||
        ['401k', 'roth', 'hsa', 'roth ira', 'brokeragelink'].includes(s)) {
      investments += a.balance;
    } else if (t === 'depository') {
      cash += a.balance;
    }
  }
  const total = investments + cash;
  return targets.map(entry => {
    const name   = entry.name.toLowerCase();
    let actual   = 0;
    if (name.includes('invest') || name.includes('us stock') || name.includes('stock')) {
      actual = total > 0 ? (investments / total) * 100 : 0;
    } else if (name.includes('cash') || name.includes('saving')) {
      actual = total > 0 ? (cash / total) * 100 : 0;
    }
    actual = Math.round(actual * 10) / 10;
    return {
      name: entry.name, target: entry.target, actual, threshold: entry.threshold,
      withinThreshold: Math.abs(actual - entry.target) <= entry.threshold,
    };
  });
}

function weeklySpend(transactions) {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const recent = transactions.filter(t => t.date >= cutoff && t.amount > 0 && t.category !== null);
  const totalSpend = recent.reduce((s, t) => s + t.amount, 0);
  const byCat = {};
  recent.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const topCategories = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amount]) => ({ name, amount }));
  return { totalSpend, topCategories };
}

// 30-day spending total (used for savings rate — distinct from the 45d transaction window)
function computeSpend30d(transactions) {
  const ago30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  return transactions.filter(t => t.date >= ago30).reduce((s, t) => s + t.amount, 0);
}

// Monthly spending by category for budget comparison
function monthlySpend(transactions) {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const month = transactions.filter(t => t.date >= start && t.amount > 0 && t.category !== null);
  const byCat = {};
  month.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  return byCat;
}

// ── Main sync ─────────────────────────────────────────────────────────────────
async function runSync() {
  const tokens       = getTokens();
  const snapshotPath = getSnapshotPath();

  // Institutions with Plaid tokens — fetched in parallel, isolated per institution
  const INSTITUTIONS = [
    { key: 'amex',         label: 'amex',         holdings: false },
    { key: 'chase',        label: 'chase',        holdings: false },
    { key: 'fidelity',     label: 'fidelity',     holdings: true  },
    { key: 'goldmanSachs', label: 'goldmanSachs', holdings: false },
  ].filter(i => tokens[i.key]);

  console.log(`[sync] institutions: ${INSTITUTIONS.map(i => i.label).join(', ') || 'none'}`);

  const instResults = await Promise.all(
    INSTITUTIONS.map(i => syncInstitution(i, tokens[i.key]))
  );

  const syncErrors   = instResults.filter(r => r.error).map(r => ({ institution: r.label, error: r.error }));
  const successful   = instResults.filter(r => !r.error);

  const plaidAccounts     = successful.flatMap(r => r.accounts);
  const plaidTransactions = successful.flatMap(r => r.transactions);
  const plaidHoldings     = successful.flatMap(r => r.holdings);

  // Manual Fidelity data — merged with source: 'manual'
  let manualAccounts = [], manualHoldings = [];
  try {
    const manualPath = path.join(__dirname, '..', 'config', 'fidelity-manual.json');
    const manual     = JSON.parse(fs.readFileSync(manualPath, 'utf8'));
    const accts      = (manual.accounts || []).filter(a => a.balance > 0);
    const holds      = (manual.holdings || []).filter(h => h.value > 0);
    manualAccounts = accts.map(a => ({ ...a, institution: 'fidelity', source: 'manual' }));
    manualHoldings = holds.map(h => ({ ...h, institution: 'fidelity', source: 'manual' }));
    if (manualAccounts.length > 0) console.log(`[sync] manual fidelity: ${manualAccounts.length} accounts, ${manualHoldings.length} holdings`);
  } catch (_) {}

  const accounts = [...plaidAccounts, ...manualAccounts];
  const holdings = [...plaidHoldings, ...manualHoldings];
  const allTx    = plaidTransactions;

  // Spending: positive amounts (money out), non-null categories
  const transactions = allTx
    .filter(t => t.amount > 0 && t.category !== null)
    .sort((a, b) => b.date.localeCompare(a.date));

  const currentNW = computeNetWorth(accounts);
  const income    = computeIncome(allTx);

  // Net worth history — carry forward, append today, cap at 260 (5 yrs weekly)
  let history = [];
  try {
    const existing = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    history = existing.netWorth?.history || [];
  } catch (_) {}

  const isSandbox = process.env.PLAID_ENV !== 'production';
  const now   = new Date();
  const date  = now.toISOString().split('T')[0];
  const label = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (!isSandbox) {
    history = [...history.filter(h => h.date !== date), { date, label, value: currentNW }]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-260);
  } else {
    history = history.filter(h => h.date !== date);
  }

  // Cards config
  const cardsPath = path.join(__dirname, '..', 'config', 'cards.json');
  let cards = [];
  try { cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8')); } catch (_) {}

  // Portfolio config → allocations (prefer holdings-based, fall back to account-type)
  let allocations = [];
  try {
    const portfolio = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'config', 'portfolio.json'), 'utf8')
    );
    allocations = holdings.length > 0
      ? computeAllocationsFromHoldings(holdings, portfolio)
      : computeAllocationsFromAccounts(accounts, portfolio.targets);
  } catch (_) {}

  // Budget config
  const budgetPath = path.join(__dirname, '..', 'config', 'budget.json');
  let budget = {};
  try { budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8')); } catch (_) {}

  // Data coverage metadata
  const dataSources = [
    ...successful.map(r => ({ institution: r.label, source: 'plaid' })),
    ...(manualAccounts.length > 0 ? [{ institution: 'fidelity', source: 'manual' }] : []),
  ];

  const snapshot = {
    syncedAt:    now.toISOString(),
    plaidEnv:    process.env.PLAID_ENV || 'sandbox',
    dataSources,
    syncErrors,
    netWorth:    { current: currentNW, history, velocity: computeVelocity(history) },
    accounts,
    transactions,
    holdings,
    weekly:       weeklySpend(transactions),
    monthlySpend: monthlySpend(transactions),
    spend30d:     computeSpend30d(transactions),
    income,
    budget,
    cards,
    allocations,
  };

  // Atomic write
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  const tmp = snapshotPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
  fs.renameSync(tmp, snapshotPath);

  console.log(`[sync] syncedAt:     ${snapshot.syncedAt}`);
  console.log(`[sync] netWorth:     $${Math.round(currentNW).toLocaleString()}`);
  console.log(`[sync] accounts:     ${accounts.length} (${plaidAccounts.length} plaid, ${manualAccounts.length} manual)`);
  console.log(`[sync] transactions: ${transactions.length}`);
  console.log(`[sync] holdings:     ${holdings.length} (${plaidHoldings.length} plaid, ${manualHoldings.length} manual)`);
  console.log(`[sync] income 30d:   $${Math.round(income.last30d).toLocaleString()}`);
  if (syncErrors.length > 0) console.error(`[sync] errors:`, syncErrors.map(e => e.institution).join(', '));

  return snapshot;
}

module.exports = { runSync };
