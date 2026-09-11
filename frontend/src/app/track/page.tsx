import { StoreChrome } from '@/components/layout/StoreChrome';
import { TrackOrderClient } from '@/components/account/TrackOrderClient';
import '../landing.css';
import '../catalog.css';

export default function TrackPage() {
  return (
    <StoreChrome>
      <main className="catalog-page">
        <TrackOrderClient />
      </main>
    </StoreChrome>
  );
}
