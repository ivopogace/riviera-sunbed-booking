/**
 * Why a card step failed, in our own words rather than a provider's: each adapter maps its errors
 * onto this list, so the guest reads translated copy whatever provider collects (ADR-0029). A
 * fraud-flagged decline maps to `declined`, never to its real reason.
 */
export type PaymentFailure =
  | 'declined'
  | 'insufficient-funds'
  | 'expired-card'
  | 'incorrect-cvc'
  | 'authentication-required'
  | 'authentication-failed'
  | 'invalid-details'
  | 'unknown';

export function paymentFailureMessage(failure: PaymentFailure): string {
  switch (failure) {
    case 'declined':
      return $localize`Your card was declined. Please try another card.`;
    case 'insufficient-funds':
      return $localize`There are not enough funds on your card. Please try another card.`;
    case 'expired-card':
      return $localize`Your card has expired. Please try another card.`;
    case 'incorrect-cvc':
      return $localize`The card’s security code is incorrect. Please check it and try again.`;
    case 'authentication-required':
      return $localize`Your bank needs you to confirm this payment. Please try again and complete the check.`;
    case 'authentication-failed':
      return $localize`We could not confirm this payment with your bank. Please try again or use another card.`;
    case 'invalid-details':
      return $localize`Please check your card details and try again.`;
    case 'unknown':
      return $localize`Your payment could not be completed. Please try again.`;
  }
}
