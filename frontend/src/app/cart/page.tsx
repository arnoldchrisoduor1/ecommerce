import { StoreChrome } from '@/components/layout/StoreChrome';
import { CartPageClient } from '@/components/cart/CartPageClient';
import '../landing.css';
import '../catalog.css';

export default function CartPage() {
  return (
    <StoreChrome>
      <main className="catalog-page">
        <CartPageClient />
      </main>
    </StoreChrome>
  );
}
