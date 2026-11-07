import type { Discount } from '../api/types';

interface Props {
  value: Discount | null;
  subtotal: number;
  onChange: (value: Discount | null) => void;
}

export function DiscountInput({ value, subtotal, onChange }: Props) {
  return (
    <div className="row g-2 mb-3">
      <label className="col-sm-6">
        <span className="form-label">Descuento</span>
        <select className="form-select" value={value?.type ?? ''} onChange={(event) => onChange(event.target.value ? { type: event.target.value as Discount['type'], value: 0 } : null)}>
          <option value="">Sin descuento</option>
          <option value="PERCENTAGE">Porcentaje (%)</option>
          <option value="FIXED">Monto fijo ($)</option>
        </select>
      </label>
      {value && <label className="col-sm-6">
        <span className="form-label">{value.type === 'PERCENTAGE' ? 'Porcentaje (%)' : 'Monto ($)'}</span>
        <input type="number" className="form-control" min={0} max={value.type === 'PERCENTAGE' ? 100 : subtotal} step="0.01" value={value.value} onChange={(event) => onChange({ ...value, value: Number(event.target.value) })} required />
      </label>}
      <div className="form-text">Se aplica sobre alojamiento y servicios, antes del anticipo.</div>
    </div>
  );
}
