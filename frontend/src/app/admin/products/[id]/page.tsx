import { AdminProductFormClient } from '@/components/admin/AdminProductsClient';

export default async function AdminEditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminProductFormClient productId={id} />;
}
