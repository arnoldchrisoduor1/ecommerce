import { StoreChrome } from '@/components/layout/StoreChrome';
import { OrdersClient } from '@/components/account/OrdersClient';
import '../../landing.css';
import '../../catalog.css';

export default function AccountOrdersPage() {
  return (
    <StoreChrome>
      <main className="catalog-page">
        <OrdersClient />
      </main>
    </StoreChrome>
  );
}
