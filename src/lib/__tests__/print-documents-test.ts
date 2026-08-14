import {
  buildPledgeAgreementHtml,
  buildRedemptionReceiptHtml,
  escapeHtml,
  formatMgAsGrams,
} from '@/lib/print-documents';

describe('escapeHtml', () => {
  test('escapes markup so a name cannot inject HTML', () => {
    expect(escapeHtml('Asha <b>Patil</b> & co')).toBe('Asha &lt;b&gt;Patil&lt;/b&gt; &amp; co');
  });
});

describe('formatMgAsGrams', () => {
  test('formats integer milligrams without a float', () => {
    expect(formatMgAsGrams(12345)).toBe('12.345 g (12345 mg)');
    expect(formatMgAsGrams(1000)).toBe('1.000 g (1000 mg)');
  });
});

describe('buildPledgeAgreementHtml', () => {
  const html = buildPledgeAgreementHtml({
    serialNumber: 'T050-A',
    customerName: 'Asha <Patil>',
    phoneNumber: '+919876543210',
    address: 'Pune',
    disbursedOn: '2024-01-01',
    dueOn: '2024-06-29',
    principalPaise: 1000000,
    rateBps: 300,
    interestModel: 'retail',
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
  });

  test('prints frozen terms and the lawyer-review caveat, not invented statute', () => {
    expect(html).toContain('T050-A');
    expect(html).toContain('₹10,000');
    expect(html).toContain('Not assessed');
    expect(html).toContain('Have a lawyer review');
    expect(html).not.toMatch(/section 176|indian contract act|hypothecation deed/i);
    expect(html).toContain('Asha &lt;Patil&gt;');
  });
});

describe('buildRedemptionReceiptHtml', () => {
  test('uses the frozen closure snapshot, not a live recompute', () => {
    const html = buildRedemptionReceiptHtml({
      serialNumber: 'T050-A',
      customerName: 'Asha Patil',
      phoneNumber: '+919876543210',
      redeemedOn: '2024-01-31',
      releasedToName: 'Asha Patil',
      releaseNote: null,
      closureBalancePaise: 1030000,
      status: 'redeemed',
      items: [{ ornament_type: 'Gold chain', quantity: 1 }],
    });
    expect(html).toContain('₹10,300');
    expect(html).toContain('closure_balance_paise');
    expect(html).toContain('Have a lawyer review');
  });
});
