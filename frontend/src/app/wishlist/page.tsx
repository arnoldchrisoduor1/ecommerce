import { StoreChrome } from '@/components/layout/StoreChrome';
import { WishlistClient } from '@/components/account/WishlistClient';
import '../landing.css';
import '../catalog.css';

export default function WishlistPage() {
  return (
    <StoreChrome>
      <main className="catalog-page">
        <WishlistClient />
      </main>
    </StoreChrome>
  );
}
