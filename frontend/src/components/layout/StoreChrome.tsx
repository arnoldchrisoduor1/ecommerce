import { apiGet, type Category } from '@/lib/api';
import { MainNav } from '@/components/layout/MainNav';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { StylistChat } from '@/components/layout/StylistChat';
import { BackToTop } from '@/components/layout/BackToTop';
import { CartProvider } from '@/components/cart/CartProvider';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { ExitIntent } from '@/components/urgency/ExitIntent';
import { PurchaseTicker } from '@/components/urgency/PurchaseTicker';
import { PageViewTracker } from '@/components/analytics/PageViewTracker';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { DemoMascot } from '@/components/demo/DemoMascot';

export async function StoreChrome({ children }: { children: React.ReactNode }) {
  let categories: Category[] = [];
  try {
    const res = await apiGet<{ categories: Category[] }>('/catalog/categories');
    categories = res.categories;
  } catch {
    categories = [];
  }

  return (
    <AuthProvider>
      <CartProvider>
        <PageViewTracker />
        <MainNav categories={categories} />
        {children}
        <SiteFooter categories={categories} />
        <CartDrawer />
        <ExitIntent />
        <PurchaseTicker />
        <BackToTop />
        <StylistChat />
        {process.env.NEXT_PUBLIC_APP_MODE === 'demo' ? <DemoMascot /> : null}
      </CartProvider>
    </AuthProvider>
  );
}
