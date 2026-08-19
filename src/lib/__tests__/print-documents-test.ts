import {
  PRINT_A4,
  buildPledgeAgreementHtml,
  buildRedemptionReceiptHtml,
  escapeHtml,
  formatMgAsGrams,
} from '@/lib/print-documents';
import type { AppLanguage } from '@/i18n';

const PLEDGE_BASE = {
  serialNumber: 'T050-A',
  customerName: 'Asha <Patil>',
  phoneNumber: '+919876543210',
  address: 'Pune',
  disbursedOn: '2024-01-01',
  dueOn: '2024-06-29',
  principalPaise: 1000000,
  rateBps: 300,
  interestModel: 'retail' as const,
  simplePeriodDays: 180,
  items: [
    {
      ornament_type: 'Gold chain',
      gross_weight_mg: 10000,
      net_weight_mg: 9800,
      purity_karat: null,
      quantity: 1,
    },
  ],
};

const REDEMPTION_BASE = {
  serialNumber: 'T050-A',
  customerName: 'Asha Patil',
  phoneNumber: '+919876543210',
  redeemedOn: '2024-01-31',
  releasedToName: 'Asha Patil',
  releaseNote: null,
  closureBalancePaise: 1030000,
  status: 'redeemed' as const,
  items: [{ ornament_type: 'Gold chain', quantity: 1 }],
};

function pledgeHtml(language: AppLanguage): string {
  return buildPledgeAgreementHtml({ ...PLEDGE_BASE, language });
}

function redemptionHtml(language: AppLanguage): string {
  return buildRedemptionReceiptHtml({ ...REDEMPTION_BASE, language });
}

describe('escapeHtml', () => {
  test('escapes markup so a name cannot inject HTML', () => {
    expect(escapeHtml('Asha <b>Patil</b> & co')).toBe('Asha &lt;b&gt;Patil&lt;/b&gt; &amp; co');
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });
});

describe('formatMgAsGrams', () => {
  test('formats integer milligrams without a float', () => {
    expect(formatMgAsGrams(12345)).toBe('12.345 g (12345 mg)');
    expect(formatMgAsGrams(1000)).toBe('1.000 g (1000 mg)');
    expect(formatMgAsGrams(0)).toBe('0.000 g (0 mg)');
    expect(formatMgAsGrams(-500)).toBe('-0.500 g (-500 mg)');
  });
});

describe('buildPledgeAgreementHtml', () => {
  test('english prints frozen terms and the lawyer-review caveat, not invented statute', () => {
    const html = pledgeHtml('en');
    expect(html).toContain('T050-A');
    expect(html).toContain('₹10,000');
    expect(html).toContain('Not assessed');
    expect(html).toContain('Have a lawyer review');
    expect(html).toContain('Noto Sans Devanagari');
    expect(html).not.toMatch(/section 176|indian contract act|hypothecation deed/i);
    expect(html).toContain('Asha &lt;Patil&gt;');
  });

  test('hindi uses गिरवी, Latin money, and the lawyer-review caveat in Hindi', () => {
    const html = pledgeHtml('hi');
    expect(html).toContain('गिरवी');
    expect(html).toContain('₹10,000');
    expect(html).toContain('आकलित नहीं');
    expect(html).toContain('वकील');
    expect(html).toContain('Noto Sans Devanagari');
    expect(html).not.toContain('Have a lawyer review');
    expect(html).not.toMatch(/section 176|indian contract act|hypothecation deed/i);
  });
});

describe('buildRedemptionReceiptHtml', () => {
  test('english uses the frozen closure snapshot, not a live recompute', () => {
    const html = redemptionHtml('en');
    expect(html).toContain('₹10,300');
    expect(html).toContain('closure_balance_paise');
    expect(html).toContain('Have a lawyer review');
  });

  test('hindi redemption uses छुड़ाना, Latin money, and Hindi lawyer-review copy', () => {
    const html = redemptionHtml('hi');
    expect(html).toContain('छुड़ाना');
    expect(html).toContain('गिरवी');
    expect(html).toContain('₹10,300');
    expect(html).toContain('closure_balance_paise');
    expect(html).toContain('वकील');
    expect(html).not.toContain('Have a lawyer review');
  });

  test('empty items, null customer fields, and merchant terms print placeholders', () => {
    const html = buildPledgeAgreementHtml({
      ...PLEDGE_BASE,
      language: 'en',
      customerName: null,
      phoneNumber: null,
      dueOn: null,
      interestModel: 'merchant',
      items: [],
    });
    expect(html).toContain('No pledged-item rows on this ticket.');
    expect(html).toContain('Merchant');
    expect(html).toContain('—');
  });

  test('Hindi merchant pledge names व्यापारी and assessed 22K', () => {
    const html = buildPledgeAgreementHtml({
      ...PLEDGE_BASE,
      language: 'hi',
      interestModel: 'merchant',
      items: [
        {
          ornament_type: 'Chain',
          gross_weight_mg: 10000,
          net_weight_mg: 9800,
          purity_karat: 22,
          quantity: 1,
        },
      ],
    });
    expect(html).toContain('व्यापारी');
    expect(html).toContain('22K (916)');
  });

  test('empty redemption items still include the frozen snapshot', () => {
    const html = buildRedemptionReceiptHtml({
      ...REDEMPTION_BASE,
      language: 'en',
      items: [],
      releasedToName: null,
    });
    expect(html).toContain('No pledged-item rows on this ticket.');
    expect(html).toContain('₹10,300');
  });
});

describe('PRINT_A4', () => {
  test('is Expo Print A4 at 72 PPI', () => {
    expect(PRINT_A4).toEqual({ width: 595.28, height: 841.89 });
  });
});
