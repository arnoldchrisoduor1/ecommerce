import { StoreChrome } from '@/components/layout/StoreChrome';
import { CheckoutClient } from '@/components/checkout/CheckoutClient';
import '../landing.css';
import '../catalog.css';

export default function CheckoutPage() {
  return (
    <StoreChrome>
      <main className="catalog-page">
        <CheckoutClient />
      </main>
    </StoreChrome>
  );
}
