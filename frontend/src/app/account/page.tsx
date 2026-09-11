import { StoreChrome } from '@/components/layout/StoreChrome';
import { AccountOverview } from '@/components/account/AccountOverview';
import '../landing.css';
import '../catalog.css';

export default function AccountPage() {
  return (
    <StoreChrome>
      <main className="catalog-page">
        <AccountOverview />
      </main>
    </StoreChrome>
  );
}
