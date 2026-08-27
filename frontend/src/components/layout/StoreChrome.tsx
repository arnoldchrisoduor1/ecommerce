import { apiGet, type Category } from '@/lib/api';
import { MainNav } from '@/components/layout/MainNav';
import { StylistChat } from '@/components/layout/StylistChat';
import { CartProvider } from '@/components/cart/CartProvider';
import { CartDrawer } from '@/components/cart/CartDrawer';

export async function StoreChrome({ children }: { children: React.ReactNode }) {
  let categories: Category[] = [];
  try {
    const res = await apiGet<{ categories: Category[] }>('/catalog/categories');
    categories = res.categories;
  } catch {
    categories = [];
  }

  return (
    <CartProvider>
      <MainNav categories={categories} />
      {children}
      <CartDrawer />
      <StylistChat />
    </CartProvider>
  );
}
