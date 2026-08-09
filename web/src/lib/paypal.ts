type PayPalOrderInput = {
  amount: number;
  currency: string;
  description?: string;
  returnUrl: string;
  cancelUrl: string;
  orderId: string;
};

type PayPalLink = {
  href: string;
  rel: string;
  method: string;
};

type PayPalOrderResponse = {
  id: string;
  status: string;
  links?: PayPalLink[];
  payer?: {
    payer_id?: string;
  };
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
      }>;
    };
  }>;
};

export function isPayPalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

function getPayPalBaseUrl() {
  return process.env.PAYPAL_ENVIRONMENT === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalAccessToken() {
  if (!isPayPalConfigured()) {
    throw new Error('PayPal credentials are not configured');
  }

  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString('base64');

  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal auth failed: ${details}`);
  }

  const data = await response.json();
  return data.access_token as string;
}

export async function createPayPalOrder(input: PayPalOrderInput) {
  const accessToken = await getPayPalAccessToken();
  const currencyCode = input.currency.toUpperCase();

  const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.orderId,
          custom_id: input.orderId,
          description: input.description || `Order ${input.orderId}`,
          amount: {
            currency_code: currencyCode,
            value: input.amount.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: 'AWULA K',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to create PayPal order: ${details}`);
  }

  const order = (await response.json()) as PayPalOrderResponse;
  const approvalUrl = order.links?.find((link) => link.rel === 'approve')?.href;

  if (!approvalUrl) {
    throw new Error('PayPal approval URL was not returned');
  }

  return {
    paypalOrderId: order.id,
    status: order.status,
    approvalUrl,
  };
}

export async function capturePayPalOrder(paypalOrderId: string) {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${getPayPalBaseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to capture PayPal order: ${details}`);
  }

  return (await response.json()) as PayPalOrderResponse;
}