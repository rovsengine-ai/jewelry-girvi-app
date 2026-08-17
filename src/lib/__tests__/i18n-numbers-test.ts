import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react-native';

import { MoneyText } from '@/components/money-text';
import { setI18nLocale } from '@/i18n';
import { asPaise, formatPaiseAsInr } from '@/lib/money';

const SAMPLE_PAISE = asPaise(1000000);

function utf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

describe('i18n numbers stay Latin en-IN', () => {
  afterEach(() => {
    setI18nLocale('en');
  });

  test('formatPaiseAsInr is byte-identical under en and hi', () => {
    setI18nLocale('en');
    const en = formatPaiseAsInr(SAMPLE_PAISE);
    setI18nLocale('hi');
    const hi = formatPaiseAsInr(SAMPLE_PAISE);
    expect(en).toBe('₹10,000');
    expect(utf8Bytes(en)).toEqual(utf8Bytes(hi));
  });

  test('MoneyText is byte-identical under en and hi', async () => {
    setI18nLocale('en');
    const enView = await render(createElement(MoneyText, { paise: SAMPLE_PAISE }));
    const enText = String(enView.getByText('₹10,000').props.children);
    cleanup();

    setI18nLocale('hi');
    const hiView = await render(createElement(MoneyText, { paise: SAMPLE_PAISE }));
    const hiText = String(hiView.getByText('₹10,000').props.children);
    expect(utf8Bytes(enText)).toEqual(utf8Bytes(hiText));
    cleanup();
  });
});
