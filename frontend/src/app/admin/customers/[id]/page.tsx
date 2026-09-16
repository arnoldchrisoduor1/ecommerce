import { AdminCustomerDetailClient } from '@/components/admin/AdminCustomerDetailClient';

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminCustomerDetailClient id={id} />;
}
