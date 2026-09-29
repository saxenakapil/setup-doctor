// Price table matching and cost estimation. See docs/scope.md section 11.4.
// Patterns are matched in file order (first match wins), so more specific
// patterns like "opus-5-5" must precede substrings of themselves like "opus-5".

import pricesData from '../data/prices.json' with { type: 'json' };

export interface PriceRow {
  pattern: string;
  inputPerM: number;
  outputPerM: number;
  cacheReadMultiplier: number;
  cacheWriteMultiplier: number;
}

export const PRICE_TABLE_AS_OF: string = pricesData.asOf;
export const PRICE_TABLE: PriceRow[] = pricesData.table;

export function findPriceRow(model: string): PriceRow | null {
  const lower = model.toLowerCase();
  for (const row of PRICE_TABLE) {
    if (lower.includes(row.pattern)) return row;
  }
  return null;
}

export interface ModelUsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelCost {
  model: string;
  tokens: number;
  costUsd: number | null; // null when the model is unknown to the price table
}

export interface CostEstimate {
  totalUsd: number | null; // null when every model is unknown
  hasUnknownModel: boolean;
  perModel: ModelCost[];
  asOf: string;
}

/** Sum over models of tokens times price. Unknown models show tokens with cost "n/a". */
export function estimateCost(usageByModel: Map<string, ModelUsageTotals>): CostEstimate {
  const perModel: ModelCost[] = [];
  let total = 0;
  let hasKnown = false;
  let hasUnknownModel = false;

  for (const [model, usage] of usageByModel) {
    const tokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
    const row = findPriceRow(model);
    if (!row) {
      hasUnknownModel = true;
      perModel.push({ model, tokens, costUsd: null });
      continue;
    }
    const costUsd =
      (usage.input * row.inputPerM) / 1_000_000 +
      (usage.output * row.outputPerM) / 1_000_000 +
      (usage.cacheRead * row.inputPerM * row.cacheReadMultiplier) / 1_000_000 +
      (usage.cacheWrite * row.inputPerM * row.cacheWriteMultiplier) / 1_000_000;
    total += costUsd;
    hasKnown = true;
    perModel.push({ model, tokens, costUsd });
  }

  perModel.sort((a, b) => b.tokens - a.tokens);
  return { totalUsd: hasKnown ? total : null, hasUnknownModel, perModel, asOf: PRICE_TABLE_AS_OF };
}
