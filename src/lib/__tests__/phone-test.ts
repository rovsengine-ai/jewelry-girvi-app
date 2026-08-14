import { toE164India } from '@/lib/phone';

describe('toE164India', () => {
  test('prefixes a bare 10-digit Indian mobile', () => {
    expect(toE164India('9876543210')).toBe('+919876543210');
  });

  test('keeps a 12-digit number already carrying the 91 country code', () => {
    expect(toE164India('919876543210')).toBe('+919876543210');
    expect(toE164India('+919876543210')).toBe('+919876543210');
  });

  test('strips the punctuation people actually type', () => {
    expect(toE164India('+91 98765 43210')).toBe('+919876543210');
    expect(toE164India('(987) 654-3210')).toBe('+919876543210');
    expect(toE164India('98765 43210')).toBe('+919876543210');
    expect(toE164India('+91-98765-43210')).toBe('+919876543210');
  });

  test('is idempotent, so re-saving a profile cannot corrupt the number', () => {
    const once = toE164India('98765 43210');
    expect(toE164India(once)).toBe(once);
    expect(toE164India(toE164India(once))).toBe(once);
  });

  test('produces a value the profiles_phone_format_chk constraint accepts', () => {
    // Postgres: phone_number ~ '^[+]?[0-9]{7,15}$'
    expect(toE164India('9876543210')).toMatch(/^[+]?[0-9]{7,15}$/);
  });

  test('rejects an empty or punctuation-only number', () => {
    expect(() => toE164India('')).toThrow('Phone number is required.');
    expect(() => toE164India('   ')).toThrow('Phone number is required.');
    expect(() => toE164India('+++')).toThrow('Phone number is required.');
  });

  describe('FLAGGED behaviours — asserted as-is, not fixed', () => {
    test('a leading zero, as written all over India, is silently mangled', () => {
      // '098765 43210' is how a great many customers write their own number.
      // digits becomes 11 characters, so neither the 12-digit '91' branch nor
      // the 10-digit branch matches and it falls through to the passthrough,
      // producing '+09876543210'. That is not a valid E.164 number, it will not
      // match the profile saved at OTP signup, and findCustomerIdByPhone will
      // therefore report "no registered customer" for a customer who exists.
      expect(toE164India('098765-43210')).toBe('+09876543210');
      expect(toE164India('09876543210')).toBe('+09876543210');
    });

    test('a 0091 prefix is mangled the same way', () => {
      expect(toE164India('0091 98765 43210')).toBe('+00919876543210');
    });

    test('the final ternary is dead code: both arms return the same string', () => {
      // src/lib/phone.ts line 20 reads
      //   return phone.startsWith('+') ? `+${digits}` : `+${digits}`;
      // so the leading-'+' test cannot change the result. A 9-digit number
      // comes back identically whether or not it was typed with a '+'.
      expect(toE164India('987654321')).toBe('+987654321');
      expect(toE164India('+987654321')).toBe('+987654321');
    });

    test('a wrong-length number is accepted and silently mangled', () => {
      // 9 digits is not a valid Indian mobile, but it is returned as '+987654321'
      // rather than rejected. The 91 country code is never added, so this reaches
      // the database as a plausible-looking foreign number.
      expect(toE164India('987654321')).toBe('+987654321');
      // 11 digits: same problem in the other direction.
      expect(toE164India('98765432101')).toBe('+98765432101');
    });

    test('a 12-digit number NOT starting with 91 keeps its own prefix', () => {
      // Only the '91' branch is length-checked, so a US number survives intact.
      expect(toE164India('120255501234'.slice(0, 12))).toBe('+120255501234');
    });

    test('a number long enough to violate the DB check constraint still passes here', () => {
      // 16 digits exceeds ^[+]?[0-9]{7,15}$, so this fails at INSERT time with a
      // raw Postgres constraint error instead of a friendly validation message.
      const sixteen = '1234567890123456';
      expect(toE164India(sixteen)).toBe(`+${sixteen}`);
      expect(`+${sixteen}`).not.toMatch(/^[+]?[0-9]{7,15}$/);
    });
  });
});
