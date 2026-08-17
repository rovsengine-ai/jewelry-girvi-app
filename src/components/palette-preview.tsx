/**
 * Same sample counter row, three palette directions. Not a real screen.
 * Do not import this from src/app/.
 */
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { MoneyText } from '@/components/money-text';
import { Row } from '@/components/row';
import { ThemedText } from '@/components/themed-text';
import { PaletteDirections, type PaletteDirectionId } from '@/constants/theme';
import { ThemePaletteProvider } from '@/hooks/use-theme';

export const LONGEST_MONEY_PAISE = 99_99_99_999_99;

export function PalettePreview({ direction }: { direction: PaletteDirectionId }) {
  const palette = PaletteDirections[direction].light;

  return (
    <ThemePaletteProvider palette={palette}>
      <Card testID={`palette-${direction}`}>
        <Row>
          <ThemedText type="smallBold">GIRVI-1042</ThemedText>
          <Badge status="active" />
        </Row>
        <MoneyText paise={LONGEST_MONEY_PAISE} testID={`money-${direction}`} />
        <Field label="Principal (₹)" value="50000" error={null} />
        <Button label="Save loan" />
        <EmptyState title="No loans" body="New pledges appear here." />
      </Card>
    </ThemePaletteProvider>
  );
}
