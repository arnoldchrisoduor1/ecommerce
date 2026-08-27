import type { Metadata } from 'next';
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
      <body>{children}</body>
    </html>
  );
}
