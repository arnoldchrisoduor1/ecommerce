import { StoreChrome } from '@/components/layout/StoreChrome';
import { GiftCardsClient } from '@/components/account/GiftCardsClient';
import '../../landing.css';
import '../../catalog.css';

export default function GiftCardsPage() {
  return (
    <StoreChrome>
      <main className="catalog-page">
        <GiftCardsClient />
      </main>
    </StoreChrome>
  );
}
