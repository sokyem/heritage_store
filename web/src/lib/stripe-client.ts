import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Returns a singleton Stripe.js instance loaded with the publishable key.
 * Returns null if NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set.
 */
export function getStripeClient(): Promise<Stripe | null> {
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return Promise.resolve(null);
  }

  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  }

  return stripePromise;
}

/**
 * Returns true if the Stripe publishable key is configured on the client.
 */
export function isStripeClientConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

/**
 * Formats a Stripe error message for display to the user.
 */
export function formatStripeError(error: { message?: string; code?: string } | null): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  // Map common Stripe error codes to friendly messages
  switch (error.code) {
    case 'card_declined':
      return 'Your card was declined. Please try a different payment method.';
    case 'insufficient_funds':
      return 'Your card has insufficient funds. Please try a different card.';
    case 'expired_card':
      return 'Your card has expired. Please use a different card.';
    case 'incorrect_cvc':
      return 'The security code (CVC) is incorrect. Please check and try again.';
    case 'incorrect_number':
      return 'The card number is incorrect. Please check and try again.';
    case 'processing_error':
      return 'An error occurred while processing your card. Please try again.';
    default:
      return error.message || 'Payment failed. Please try again.';
  }
}
