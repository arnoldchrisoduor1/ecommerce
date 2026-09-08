import type { Metadata } from 'next';
import Script from 'next/script';
import { EXIT_INTENT_BOOT_SCRIPT } from '@/components/urgency/exit-intent-boot';
import './globals.css';

export const metadata: Metadata = {
  title: 'Studio — Women\'s basics',
  description: 'Women\'s basics — tees, tanks, bodysuits, knitwear',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Script id="exit-intent-boot" strategy="beforeInteractive">
          {EXIT_INTENT_BOOT_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
