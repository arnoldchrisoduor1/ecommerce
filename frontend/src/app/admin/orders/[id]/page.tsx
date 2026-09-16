import { AdminOrderDetailClient } from '@/components/admin/AdminOrderDetailClient';

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminOrderDetailClient id={id} />;
}
