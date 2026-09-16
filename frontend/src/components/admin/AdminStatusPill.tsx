'use client';

/** Maps order/product/review statuses to semantic admin pill tones. */
export function adminStatusTone(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const s = status.trim().toLowerCase();
  if (
    [
      'paid',
      'fulfilled',
      'shipped',
      'delivered',
      'active',
      'approved',
      'published',
      'success',
      'subscribed',
    ].includes(s)
  ) {
    return 'success';
  }
  if (['pending', 'processing', 'draft', 'low', 'partial'].includes(s)) {
    return 'warning';
  }
  if (
    [
      'cancelled',
      'canceled',
      'failed',
      'rejected',
      'out',
      'archived',
      'refunded',
      'unsubscribed',
    ].includes(s)
  ) {
    return 'danger';
  }
  if (['info', 'open', 'new'].includes(s)) {
    return 'info';
  }
  return 'neutral';
}

export function AdminStatusPill({
  status,
  className = '',
}: {
  status: string;
  className?: string;
}) {
  const tone = adminStatusTone(status);
  return (
    <span className={`admin-status-pill admin-status-pill--${tone} ${className}`.trim()}>
      {status}
    </span>
  );
}
