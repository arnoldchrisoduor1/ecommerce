import { AdminDiscountFormClient } from '@/components/admin/AdminDiscountsClient';

export default async function AdminEditDiscountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminDiscountFormClient discountId={id} />;
}
