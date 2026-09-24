export function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`badge rounded-pill px-2 py-1 ${cls}`}>{label}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    RESERVED: { label: 'Reservada', cls: 'text-bg-primary' },
    CHECKED_IN: { label: 'Check-in', cls: 'text-bg-success' },
    CHECKED_OUT: { label: 'Check-out', cls: 'text-bg-secondary' },
    CANCELLED: { label: 'Cancelada', cls: 'text-bg-danger' },
  };
  const entry = map[status] ?? { label: status, cls: 'text-bg-secondary' };
  return <Badge label={entry.label} cls={entry.cls} />;
}

export function ActiveBadge({ active, activeLabel = 'Activa', inactiveLabel = 'Inactiva' }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return <Badge label={active ? activeLabel : inactiveLabel} cls={active ? 'text-bg-success' : 'text-bg-danger'} />;
}

export function RefundBadge({ reservation }: { reservation: { status: string; refundEligible: boolean; refunded: boolean } }) {
  if (reservation.status !== 'CANCELLED' || !reservation.refundEligible) return null;
  return reservation.refunded
    ? <Badge label="Devuelto" cls="text-bg-success" />
    : <Badge label="Pendiente devolución" cls="text-bg-warning" />;
}