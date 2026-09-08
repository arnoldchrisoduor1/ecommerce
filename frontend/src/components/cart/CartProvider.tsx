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
import {
  apiGet,
  apiSend,
  type Cart,
  type ProductDetail,
  type ProductListItem,
} from '@/lib/api';

export const CART_KEY = 'studio_cart_id';
export const SESSION_KEY = 'studio_session_id';

type CartContextValue = {
  cart: Cart | null;
  open: boolean;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (variantId: string, quantity?: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  refreshCart: () => Promise<void>;
  ensureCartWithItem: () => Promise<Cart>;
  sessionId: string;
  cartId: string | null;
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
  const [cartId, setCartId] = useState<string | null>(null);

  useEffect(() => {
    setSessionId(ensureSessionId());
    setCartId(localStorage.getItem(CART_KEY));
  }, []);

  const refreshCart = useCallback(async () => {
    const id = localStorage.getItem(CART_KEY);
    setCartId(id);
    if (!id) {
      setCart(null);
      return;
    }
    try {
      const next = await apiGet<Cart>(`/cart/${id}`);
      setCart(next);
    } catch {
      localStorage.removeItem(CART_KEY);
      setCartId(null);
      setCart(null);
    }
  }, []);

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  const ensureCartId = useCallback(async () => {
    const existing = localStorage.getItem(CART_KEY);
    if (existing) {
      setCartId(existing);
      return existing;
    }
    const sid = ensureSessionId();
    const created = await apiSend<Cart>('/cart/', 'POST', { session_id: sid });
    localStorage.setItem(CART_KEY, created.id);
    setCartId(created.id);
    setCart(created);
    return created.id;
  }, []);

  const addToCart = useCallback(
    async (variantId: string, quantity = 1) => {
      const id = await ensureCartId();
      const next = await apiSend<Cart>(`/cart/${id}/items`, 'POST', {
        variant_id: variantId,
        quantity,
      });
      setCart(next);
      setOpen(true);
    },
    [ensureCartId],
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      const id = localStorage.getItem(CART_KEY);
      if (!id) return;
      const next = await apiSend<Cart>(`/cart/${id}/items/${itemId}`, 'PATCH', {
        quantity,
      });
      setCart(next);
    },
    [],
  );

  /** For /cart and /checkout e2e when no persisted bag exists yet. */
  const ensureCartWithItem = useCallback(async () => {
    await refreshCart();
    const existingId = localStorage.getItem(CART_KEY);
    if (existingId) {
      try {
        const existing = await apiGet<Cart>(`/cart/${existingId}`);
        if (existing.items.length > 0) {
          setCart(existing);
          return existing;
        }
      } catch {
        localStorage.removeItem(CART_KEY);
      }
    }

    const list = await apiGet<{ products: ProductListItem[] }>(
      '/catalog/products?sort=latest&page_size=24',
    );
    const slugCandidates = [
      'pocket-tee',
      ...list.products.filter((p) => !p.is_bundle).map((p) => p.slug),
    ];
    let variant: ProductDetail['variants'][number] | undefined;
    for (const slug of slugCandidates) {
      const detail = await apiGet<ProductDetail>(`/catalog/products/${slug}`);
      variant =
        detail.variants.find((v) => v.stock_qty > 0) ?? detail.variants[0];
      if (variant) break;
    }
    if (!variant) throw new Error('No variants to seed cart');

    const id = await ensureCartId();
    const next = await apiSend<Cart>(`/cart/${id}/items`, 'POST', {
      variant_id: variant.id,
      quantity: 1,
    });
    setCart(next);
    return next;
  }, [ensureCartId, refreshCart]);

  const value = useMemo(
    () => ({
      cart,
      open,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
      addToCart,
      updateQuantity,
      refreshCart,
      ensureCartWithItem,
      sessionId,
      cartId,
    }),
    [
      cart,
      open,
      addToCart,
      updateQuantity,
      refreshCart,
      ensureCartWithItem,
      sessionId,
      cartId,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export function freeDeliveryThreshold(): number {
  if (typeof window === 'undefined') return 3000;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--free-delivery-threshold')
    .trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 3000;
}
