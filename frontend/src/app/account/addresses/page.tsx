import { StoreChrome } from '@/components/layout/StoreChrome';
import { AddressesClient } from '@/components/account/AddressesClient';
import '../../landing.css';
import '../../catalog.css';

export default function AccountAddressesPage() {
  return (
    <StoreChrome>
      <main className="catalog-page">
        <AddressesClient />
      </main>
    </StoreChrome>
  );
}
