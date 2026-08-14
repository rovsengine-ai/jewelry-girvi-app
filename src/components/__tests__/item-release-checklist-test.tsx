import { render } from '@testing-library/react-native';

import { ItemReleaseChecklist } from '@/components/item-release-checklist';
import { canSubmitRedemption } from '@/lib/redemption';
import type { LoanItem } from '@/types/database';

const ITEMS: LoanItem[] = [
  {
    id: 'item-chain',
    loan_id: 'loan-1',
    position: 1,
    ornament_type: 'Gold chain',
    description: null,
    metal: 'gold',
    gross_weight_mg: 10000,
    net_weight_mg: 10000,
    purity_karat: null,
    stone_deduction_mg: 0,
    quantity: 1,
    valuation_paise: null,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'item-bangle',
    loan_id: 'loan-1',
    position: 2,
    ornament_type: 'Gold bangle',
    description: 'backfilled',
    metal: 'gold',
    gross_weight_mg: 12500,
    net_weight_mg: 12000,
    purity_karat: null,
    stone_deduction_mg: 500,
    quantity: 1,
    valuation_paise: null,
    created_at: '2024-01-01T00:00:00Z',
  },
];

describe('<ItemReleaseChecklist />', () => {
  test('renders one checkbox per pledged item, all unchecked', async () => {
    const { getByText, getAllByRole } = await render(
      <ItemReleaseChecklist items={ITEMS} checkedIds={new Set()} onToggle={() => undefined} />,
    );
    getByText('Gold chain');
    getByText('Gold bangle');
    const boxes = getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes.every((box) => box.props.accessibilityState.checked === false)).toBe(true);
  });

  test('checkedIds lights the matching rows', async () => {
    const { getAllByRole } = await render(
      <ItemReleaseChecklist
        items={ITEMS}
        checkedIds={new Set(['item-chain'])}
        onToggle={() => undefined}
      />,
    );
    const boxes = getAllByRole('checkbox');
    expect(boxes[0].props.accessibilityState.checked).toBe(true);
    expect(boxes[1].props.accessibilityState.checked).toBe(false);
  });

  test('the submit gate stays closed until every rendered item is in checkedIds', () => {
    const ids = ITEMS.map((item) => item.id);
    expect(canSubmitRedemption({ releasedToName: 'Asha', itemIds: ids, checkedIds: [] }).ok).toBe(
      false,
    );
    expect(
      canSubmitRedemption({ releasedToName: 'Asha', itemIds: ids, checkedIds: ['item-chain'] }).ok,
    ).toBe(false);
    expect(canSubmitRedemption({ releasedToName: 'Asha', itemIds: ids, checkedIds: ids }).ok).toBe(
      true,
    );
  });
});
