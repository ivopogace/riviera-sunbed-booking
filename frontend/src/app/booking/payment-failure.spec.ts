import { PaymentFailure, paymentFailureMessage } from './payment-failure';

describe('paymentFailureMessage', () => {
  it.each<[PaymentFailure, RegExp]>([
    ['declined', /card was declined/],
    ['insufficient-funds', /not enough funds/],
    ['expired-card', /card has expired/],
    ['incorrect-cvc', /security code/],
    ['authentication-required', /bank needs you to confirm/],
    ['authentication-failed', /could not confirm this payment with your bank/],
    ['invalid-details', /check your card details/],
    ['unknown', /could not be completed/],
  ])('gives %s its own copy', (failure, copy) => {
    expect(paymentFailureMessage(failure)).toMatch(copy);
  });
});
