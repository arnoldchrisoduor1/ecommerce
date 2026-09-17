import { notFound } from 'next/navigation';
import { StoreChrome } from '@/components/layout/StoreChrome';
import { FeaturesPageClient } from '@/components/demo/FeaturesPage';
import '@/app/landing.css';

export const metadata = {
  title: 'Features — Studio platform',
  description: 'Customer and admin features included in this ecommerce platform demo.',
};

/**
 * Demo-only Features sales page. Production: notFound() + gated client import.
 */
export default function FeaturesPage() {
  if (process.env.NEXT_PUBLIC_APP_MODE !== 'demo') {
    notFound();
  }

  return (
    <StoreChrome>
      <FeaturesPageClient />
    </StoreChrome>
  );
}
