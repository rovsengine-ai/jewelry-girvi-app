import { translate, type AppLanguage } from '@/i18n';
import { goldPurityLabel } from '@/lib/gold-purity';
import { asBps, asPaise, formatBpsAsPercent, formatPaiseAsInr } from '@/lib/money';
import { loanStatusLabel } from '@/lib/redemption';
import type { InterestModel, LoanItem, LoanStatus } from '@/types/database';

/** A4 at 72 PPI, from Expo Print defaults documented as US Letter otherwise. */
export const PRINT_A4 = { width: 595.28, height: 841.89 };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Integer mg → display grams without a float. Latin digits in both languages. */
export function formatMgAsGrams(mg: number): string {
  const abs = Math.abs(mg);
  const grams = Math.trunc(abs / 1000);
  const rem = abs % 1000;
  const sign = mg < 0 ? '-' : '';
  return `${sign}${grams}.${String(rem).padStart(3, '0')} g (${mg} mg)`;
}

function tx(language: AppLanguage, key: string, options?: Record<string, string | number>): string {
  return translate(key, options, language);
}

function interestModelLabel(model: InterestModel, language: AppLanguage): string {
  switch (model) {
    case 'retail':
      return tx(language, 'print.interestRetail');
    case 'merchant':
      return tx(language, 'print.interestMerchant');
    default: {
      const _exhaustive: never = model;
      return _exhaustive;
    }
  }
}

function disclaimerHtml(language: AppLanguage): string {
  return `
<p class="disclaimer">
  ${escapeHtml(tx(language, 'print.disclaimerLegal'))}
</p>
<p class="disclaimer">
  ${escapeHtml(tx(language, 'print.disclaimerPractice'))}
</p>
`;
}

const DOC_CSS = `
  @page { margin: 18mm; }
  body {
    font-family: "Noto Sans Devanagari", "Devanagari Sangam MN", "Noto Sans", Helvetica, Arial, sans-serif;
    color: #111;
    font-size: 12px;
    line-height: 1.45;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 16px 0 8px; }
  .sub { color: #444; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f3f3; }
  .disclaimer { font-size: 11px; color: #333; margin-top: 16px; }
  .meta { margin: 0 0 4px; }
`;

export interface PledgePrintInput {
  language: AppLanguage;
  serialNumber: string;
  customerName: string | null;
  phoneNumber: string | null;
  address: string | null;
  disbursedOn: string;
  dueOn: string | null;
  principalPaise: number;
  rateBps: number;
  interestModel: InterestModel;
  simplePeriodDays: number;
  items: Pick<
    LoanItem,
    'ornament_type' | 'gross_weight_mg' | 'net_weight_mg' | 'purity_karat' | 'quantity'
  >[];
}

export function buildPledgeAgreementHtml(input: PledgePrintInput): string {
  const lang = input.language;
  const dash = tx(lang, 'common.emDash');
  const itemRows =
    input.items.length === 0
      ? `<tr><td colspan="5">${escapeHtml(tx(lang, 'print.noItems'))}</td></tr>`
      : input.items
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.ornament_type)}</td>
                <td>${item.quantity}</td>
                <td>${escapeHtml(formatMgAsGrams(item.gross_weight_mg))}</td>
                <td>${escapeHtml(formatMgAsGrams(item.net_weight_mg))}</td>
                <td>${escapeHtml(goldPurityLabel(item.purity_karat, lang))}</td>
              </tr>`,
          )
          .join('');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>${DOC_CSS}</style>
  </head>
  <body>
    <h1>${escapeHtml(tx(lang, 'print.letterhead'))}</h1>
    <p class="sub">${escapeHtml(tx(lang, 'print.pledgeSubtitle', { serial: input.serialNumber }))}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.customer'))} ${escapeHtml(input.customerName ?? dash)}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.phone'))} ${escapeHtml(input.phoneNumber ?? dash)}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.address'))} ${escapeHtml(input.address ?? dash)}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.disbursed'))} ${escapeHtml(input.disbursedOn)}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.dueDate'))} ${escapeHtml(input.dueOn ?? dash)}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.principal'))} ${escapeHtml(formatPaiseAsInr(asPaise(input.principalPaise)))}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.rate'))} ${escapeHtml(formatBpsAsPercent(asBps(input.rateBps)))}${escapeHtml(tx(lang, 'print.rateSuffix'))}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.model'))} ${escapeHtml(interestModelLabel(input.interestModel, lang))}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.simplePeriod'))} ${input.simplePeriodDays} ${escapeHtml(tx(lang, 'print.simplePeriodSuffix'))}</p>
    <h2>${escapeHtml(tx(lang, 'print.pledgedItems'))}</h2>
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(tx(lang, 'print.ornament'))}</th>
          <th>${escapeHtml(tx(lang, 'print.qty'))}</th>
          <th>${escapeHtml(tx(lang, 'print.gross'))}</th>
          <th>${escapeHtml(tx(lang, 'print.net'))}</th>
          <th>${escapeHtml(tx(lang, 'print.purity'))}</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    ${disclaimerHtml(lang)}
  </body>
</html>`;
}

export interface RedemptionPrintInput {
  language: AppLanguage;
  serialNumber: string;
  customerName: string | null;
  phoneNumber: string | null;
  redeemedOn: string;
  releasedToName: string | null;
  releaseNote: string | null;
  closureBalancePaise: number;
  status: LoanStatus;
  items: Pick<LoanItem, 'ornament_type' | 'quantity'>[];
}

export function buildRedemptionReceiptHtml(input: RedemptionPrintInput): string {
  const lang = input.language;
  const dash = tx(lang, 'common.emDash');
  const itemRows =
    input.items.length === 0
      ? `<tr><td colspan="2">${escapeHtml(tx(lang, 'print.noItems'))}</td></tr>`
      : input.items
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.ornament_type)}</td>
                <td>${item.quantity}</td>
              </tr>`,
          )
          .join('');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>${DOC_CSS}</style>
  </head>
  <body>
    <h1>${escapeHtml(tx(lang, 'print.letterhead'))}</h1>
    <p class="sub">${escapeHtml(tx(lang, 'print.redemptionSubtitle', { serial: input.serialNumber }))}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.status'))} ${escapeHtml(loanStatusLabel(input.status, lang))}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.customer'))} ${escapeHtml(input.customerName ?? dash)}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.phone'))} ${escapeHtml(input.phoneNumber ?? dash)}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.redeemedOn'))} ${escapeHtml(input.redeemedOn)}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.releasedTo'))} ${escapeHtml(input.releasedToName ?? dash)}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.amountCollected'))}
      ${escapeHtml(formatPaiseAsInr(asPaise(input.closureBalancePaise)))}</p>
    <p class="meta">${escapeHtml(tx(lang, 'print.note'))} ${escapeHtml(input.releaseNote ?? dash)}</p>
    <h2>${escapeHtml(tx(lang, 'print.releasedItems'))}</h2>
    <table>
      <thead>
        <tr><th>${escapeHtml(tx(lang, 'print.ornament'))}</th><th>${escapeHtml(tx(lang, 'print.qty'))}</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <p class="disclaimer">
      ${escapeHtml(tx(lang, 'print.disclaimerClosure'))}
    </p>
    ${disclaimerHtml(lang)}
  </body>
</html>`;
}
