import { asBps, asPaise, formatBpsAsPercent, formatPaiseAsInr } from '@/lib/money';
import { loanStatusLabel } from '@/lib/redemption';
import type { InterestModel, LoanItem, LoanStatus } from '@/types/database';

const LETTERHEAD = 'Girvi Shop';

/** A4 at 72 PPI, from Expo Print defaults documented as US Letter otherwise. */
export const PRINT_A4 = { width: 595.28, height: 841.89 };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Integer mg → display grams without a float. */
export function formatMgAsGrams(mg: number): string {
  const abs = Math.abs(mg);
  const grams = Math.trunc(abs / 1000);
  const rem = abs % 1000;
  const sign = mg < 0 ? '-' : '';
  return `${sign}${grams}.${String(rem).padStart(3, '0')} g (${mg} mg)`;
}

function purityLabel(purityKarat: number | null): string {
  if (purityKarat == null) return 'Not assessed / आकलित नहीं';
  return `${purityKarat}K`;
}

function interestModelLabel(model: InterestModel): string {
  switch (model) {
    case 'retail':
      return 'Retail / खुदरा';
    case 'merchant':
      return 'Merchant / व्यापारी';
    default: {
      const _exhaustive: never = model;
      return _exhaustive;
    }
  }
}

const DISCLAIMER = `
<p class="disclaimer">
  This sheet lists terms stored on this girvi ticket. It is not legal advice and is not a
  stamped instrument. Have a lawyer review it before you rely on it as an agreement.
  <br />
  यह पत्रक इस गिरवी टिकट पर संग्रहीत शर्तें दर्शाता है। यह कानूनी सलाह नहीं है और मुद्रांकित दस्तावेज़ नहीं है।
  समझौते के रूप में उपयोग से पहले वकील से जाँच करवाएँ।
</p>
<p class="disclaimer">
  Shop practice recorded in the app: interest-only renewal may be offered after the simple
  period; forfeiture / auction is considered only after six months, with a renewal warning.
  No other sale, penalty, or compounding rule is added here.
</p>
`;

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
  const itemRows =
    input.items.length === 0
      ? '<tr><td colspan="5">No pledged-item rows on this ticket.</td></tr>'
      : input.items
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(item.ornament_type)}</td>
                <td>${item.quantity}</td>
                <td>${escapeHtml(formatMgAsGrams(item.gross_weight_mg))}</td>
                <td>${escapeHtml(formatMgAsGrams(item.net_weight_mg))}</td>
                <td>${escapeHtml(purityLabel(item.purity_karat))}</td>
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
    <h1>${escapeHtml(LETTERHEAD)}</h1>
    <p class="sub">Pledge record / गिरवी अभिलेख · ${escapeHtml(input.serialNumber)}</p>
    <p class="meta">Customer / ग्राहक: ${escapeHtml(input.customerName ?? '—')}</p>
    <p class="meta">Phone / फ़ोन: ${escapeHtml(input.phoneNumber ?? '—')}</p>
    <p class="meta">Address / पता: ${escapeHtml(input.address ?? '—')}</p>
    <p class="meta">Disbursed / वितरित: ${escapeHtml(input.disbursedOn)}</p>
    <p class="meta">Current due date / वर्तमान देय तिथि: ${escapeHtml(input.dueOn ?? '—')}</p>
    <p class="meta">Principal / मूलधन: ${escapeHtml(formatPaiseAsInr(asPaise(input.principalPaise)))}</p>
    <p class="meta">Rate / दर: ${escapeHtml(formatBpsAsPercent(asBps(input.rateBps)))}% per 30 days</p>
    <p class="meta">Model / मॉडल: ${escapeHtml(interestModelLabel(input.interestModel))}</p>
    <p class="meta">Simple period / साधारण अवधि: ${input.simplePeriodDays} days</p>
    <h2>Pledged items / गिरवी वस्तुएँ</h2>
    <table>
      <thead>
        <tr>
          <th>Ornament</th>
          <th>Qty</th>
          <th>Gross</th>
          <th>Net</th>
          <th>Purity</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    ${DISCLAIMER}
  </body>
</html>`;
}

export interface RedemptionPrintInput {
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
  const itemRows =
    input.items.length === 0
      ? '<tr><td colspan="2">No pledged-item rows on this ticket.</td></tr>'
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
    <h1>${escapeHtml(LETTERHEAD)}</h1>
    <p class="sub">Redemption receipt / मोचन रसीद · ${escapeHtml(input.serialNumber)}</p>
    <p class="meta">Status: ${escapeHtml(loanStatusLabel(input.status))}</p>
    <p class="meta">Customer / ग्राहक: ${escapeHtml(input.customerName ?? '—')}</p>
    <p class="meta">Phone / फ़ोन: ${escapeHtml(input.phoneNumber ?? '—')}</p>
    <p class="meta">Redeemed on / मोचन तिथि: ${escapeHtml(input.redeemedOn)}</p>
    <p class="meta">Released to / प्राप्तकर्ता: ${escapeHtml(input.releasedToName ?? '—')}</p>
    <p class="meta">Amount collected (snapshot) / वसूल राशि:
      ${escapeHtml(formatPaiseAsInr(asPaise(input.closureBalancePaise)))}</p>
    <p class="meta">Note / टिप्पणी: ${escapeHtml(input.releaseNote ?? '—')}</p>
    <h2>Items released / लौटाई वस्तुएँ</h2>
    <table>
      <thead>
        <tr><th>Ornament</th><th>Qty</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <p class="disclaimer">
      Collected amount is the frozen closure_balance_paise written at redemption. A later
      rate edit does not change this figure.
    </p>
    ${DISCLAIMER}
  </body>
</html>`;
}
