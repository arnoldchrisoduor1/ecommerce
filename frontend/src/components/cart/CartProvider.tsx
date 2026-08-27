'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiGet, apiSend, type Cart } from '@/lib/api';

const CART_KEY = 'studio_cart_id';
const SESSION_KEY = 'studio_session_id';

type CartContextValue = {
  cart: Cart | null;
  open: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (variantId: string, quantity?: number) => Promise<void>;
  refreshCart: () => Promise<void>;
  sessionId: string;
};

const CartContext = createContext<CartContextValue | null>(null);

function ensureSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    setSessionId(ensureSessionId());
  }, []);

  const refreshCart = useCallback(async () => {
    const id = localStorage.getItem(CART_KEY);
    if (!id) {
      setCart(null);
      return;
    }
    try {
      const next = await apiGet<Cart>(`/cart/${id}`);
      setCart(next);
    } catch {
      localStorage.removeItem(CART_KEY);
      setCart(null);
    }
  }, []);

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  const ensureCartId = useCallback(async () => {
    const existing = localStorage.getItem(CART_KEY);
    if (existing) return existing;
    const sid = ensureSessionId();
    const created = await apiSend<Cart>('/cart/', 'POST', { session_id: sid });
    localStorage.setItem(CART_KEY, created.id);
    setCart(created);
    return created.id;
  }, []);

  const addToCart = useCallback(
    async (variantId: string, quantity = 1) => {
      const cartId = await ensureCartId();
      const next = await apiSend<Cart>(`/cart/${cartId}/items`, 'POST', {
        variant_id: variantId,
        quantity,
      });
      setCart(next);
      setOpen(true);
    },
    [ensureCartId],
  );

  const value = useMemo(
    () => ({
      cart,
      open,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
      addToCart,
      refreshCart,
      sessionId,
    }),
    [cart, open, addToCart, refreshCart, sessionId],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
