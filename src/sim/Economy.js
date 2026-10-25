/**
 * Money: the ledger, running rates and the finance history the UI graphs.
 *
 * Income and spending are bucketed by category so the player can see where the
 * money actually goes — which is most of the game's feedback loop.
 */

export const LEDGER_KEYS = [
  'entry', 'rides', 'shops',
  'construction', 'staff', 'upkeep', 'marketing', 'repairs',
];

const INCOME_KEYS = new Set(['entry', 'rides', 'shops']);
/**
 * Construction is capital spend, not an operating cost: a single big purchase
 * would otherwise swamp the "per minute" readout for a full sampling window
 * and make the HUD useless. It is reported separately in the finance panel.
 */
const OPERATING_EXPENSE_KEYS = new Set(['staff', 'upkeep', 'marketing', 'repairs']);

export class Economy {
  constructor(startCash = 12000) {
    this.cash = startCash;
    this.startCash = startCash;

    /** Lifetime totals per category. */
    this.total = Object.fromEntries(LEDGER_KEYS.map((k) => [k, 0]));
    /** Totals for the current in-game day. */
    this.today = Object.fromEntries(LEDGER_KEYS.map((k) => [k, 0]));
    /** Rolling per-minute rate, smoothed. */
    this.rate = Object.fromEntries(LEDGER_KEYS.map((k) => [k, 0]));
    this._window = Object.fromEntries(LEDGER_KEYS.map((k) => [k, 0]));
    this._windowTime = 0;

    /** @type {{day:number, income:number, expense:number, cash:number}[]} */
    this.history = [];
    this.dayIncome = 0;
    this.dayExpense = 0;
    this.bankrupt = false;
    this.lowCashWarned = false;
  }

  earn(amount, category = 'rides') {
    if (!(amount > 0)) return;
    this.cash += amount;
    this.total[category] += amount;
    this.today[category] += amount;
    this._window[category] += amount;
    this.dayIncome += amount;
  }

  spend(amount, category = 'construction') {
    if (!(amount > 0)) return false;
    this.cash -= amount;
    this.total[category] += amount;
    this.today[category] += amount;
    this._window[category] += amount;
    this.dayExpense += amount;
    return true;
  }

  canAfford(amount) { return this.cash >= amount; }

  /**
   * Money back from a demolition. This reverses spending in its category
   * rather than counting as income, so the ledger keeps showing what the park
   * actually cost to build.
   */
  refund(amount, category = 'construction') {
    if (!(amount > 0)) return;
    this.cash += amount;
    this.total[category] = Math.max(0, this.total[category] - amount);
    this.today[category] = Math.max(0, this.today[category] - amount);
    this._window[category] -= amount;
    this.dayExpense = Math.max(0, this.dayExpense - amount);
  }

  /** Continuous drains (wages, upkeep) applied per second of game time. */
  drain(amountPerSecond, category, dt) {
    const amt = amountPerSecond * dt;
    if (amt <= 0) return;
    this.cash -= amt;
    this.total[category] += amt;
    this.today[category] += amt;
    this._window[category] += amt;
    this.dayExpense += amt;
  }

  update(dt) {
    this._windowTime += dt;
    if (this._windowTime >= 5) {
      const perMinute = 60 / this._windowTime;
      for (const k of LEDGER_KEYS) {
        const r = this._window[k] * perMinute;
        // Smooth so the HUD doesn't flicker between dispatches.
        this.rate[k] = this.rate[k] * 0.45 + r * 0.55;
        this._window[k] = 0;
      }
      this._windowTime = 0;
    }
    if (this.cash < 0 && !this.bankrupt && this.cash < -4000) this.bankrupt = true;
  }

  get incomeRate() {
    let s = 0;
    for (const k of LEDGER_KEYS) if (INCOME_KEYS.has(k)) s += this.rate[k];
    return s;
  }

  /** Recurring costs only — wages, upkeep, marketing and repairs. */
  get expenseRate() {
    let s = 0;
    for (const k of LEDGER_KEYS) if (OPERATING_EXPENSE_KEYS.has(k)) s += Math.max(0, this.rate[k]);
    return s;
  }

  /** Construction spend, reported apart from the operating result. */
  get capitalRate() { return Math.max(0, this.rate.construction); }

  /** Operating profit: what the park earns per minute once it is built. */
  get profitRate() { return this.incomeRate - this.expenseRate; }

  /** Close the books on an in-game day. */
  closeDay(day) {
    this.history.push({
      day,
      income: this.dayIncome,
      expense: this.dayExpense,
      profit: this.dayIncome - this.dayExpense,
      cash: this.cash,
    });
    if (this.history.length > 60) this.history.shift();
    const summary = {
      income: this.dayIncome,
      expense: this.dayExpense,
      profit: this.dayIncome - this.dayExpense,
      breakdown: { ...this.today },
    };
    this.dayIncome = 0;
    this.dayExpense = 0;
    for (const k of LEDGER_KEYS) this.today[k] = 0;
    return summary;
  }
}

export function formatMoney(n) {
  const neg = n < 0;
  const v = Math.abs(Math.round(n));
  let s;
  if (v >= 1_000_000) s = (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + 'M';
  else if (v >= 10_000) s = (v / 1000).toFixed(v >= 100_000 ? 0 : 1) + 'k';
  else s = v.toLocaleString('en-US');
  return (neg ? '-' : '') + s;
}

export function formatMoneyFull(n) {
  const neg = n < 0;
  return (neg ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('en-US');
}
