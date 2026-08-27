import { render } from '@testing-library/react-native';

import { PalettePreview } from '@/components/palette-preview';
import { PaletteDirections } from '@/constants/theme';
import { flatStyle } from '@/test-utils/flat-style';

describe('<PalettePreview />', () => {
  test('warm paper, cool ledger, and shopfront contrast are distinct on the same sample', async () => {
    const warm = await render(<PalettePreview direction="warmPaper" />);
    const cool = await render(<PalettePreview direction="coolLedger" />);
    const glare = await render(<PalettePreview direction="shopfrontContrast" />);
    const shop = await render(<PalettePreview direction="girviShopfront" />);

    const warmBg = flatStyle(warm.getByTestId('palette-warmPaper')).backgroundColor;
    const coolBg = flatStyle(cool.getByTestId('palette-coolLedger')).backgroundColor;
    const glareBg = flatStyle(glare.getByTestId('palette-shopfrontContrast')).backgroundColor;
    const shopBg = flatStyle(shop.getByTestId('palette-girviShopfront')).backgroundColor;

    expect(warmBg).toBe(PaletteDirections.warmPaper.light.elevated);
    expect(coolBg).toBe(PaletteDirections.coolLedger.light.elevated);
    expect(glareBg).toBe(PaletteDirections.shopfrontContrast.light.elevated);
    expect(shopBg).toBe(PaletteDirections.girviShopfront.light.elevated);
    expect(new Set([warmBg, coolBg, glareBg]).size).toBe(3);

    warm.getByText('GIRVI-1042');
    cool.getByText('GIRVI-1042');
    glare.getByText('GIRVI-1042');
  });
});
