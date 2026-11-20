import { expect, it } from 'vitest';
import { formatCompactTokens } from '../lib/formatCompactTokens';

it.each([
  [null, '—'], [undefined, '—'], [0, '0'], [999, '999'], [1000, '1k'], [9412, '9.4k'], [9960, '10k'],
  [10_000, '10k'], [184_220, '184k'], [999_499, '999k'], [999_500, '1M'], [1_250_000, '1.3M'], [3_400_000, '3.4M'], [12_600_000, '13M'],
])('formats %s as %s', (input, expected) => {
  expect(formatCompactTokens(input as number | null | undefined)).toBe(expected);
});
