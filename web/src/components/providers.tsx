'use client';

import { SessionProvider } from 'next-auth/react';
import { ToastContainer } from './Toast';
import { CartProvider } from './CartContext';
import { CartDrawer } from './CartDrawer';
import { WishlistProvider } from './WishlistContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <WishlistProvider>
        <CartProvider>
          {children}
          <CartDrawer />
          <ToastContainer />
        </CartProvider>
      </WishlistProvider>
    </SessionProvider>
  );
}