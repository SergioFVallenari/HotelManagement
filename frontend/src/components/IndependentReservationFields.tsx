import type { Service } from '../api/types';
import type { SelectedRoom } from '../lib/reservationRooms';
import { emptyIndependentDetails, independentRoomQuote, type IndependentReservationDetails } from '../lib/reservationBatch';
import { money, PAYMENT_METHODS } from '../lib/format';

interface Props {
  rooms: SelectedRoom[];
  nights: number;
  details: Record<number, IndependentReservationDetails>;
  onChange: (roomId: number, value: IndependentReservationDetails) => void;
  extraBedService?: Service;
}

export function IndependentReservationFields({ rooms, nights, details, onChange, extraBedService }: Props) {
  return <div className="form-section">
    <h3 className="section-title">2 · Huésped y cobro por habitación</h3>
    <p className="small text-secondary">Se crea una reserva independiente por habitación. Dejá nombre y apellido vacíos para usar un huésped genérico con ficha propia. Podés completar sus datos después.</p>
    {rooms.map((line) => {
      const item = details[line.room.id] ?? emptyIndependentDetails();
      const update = (changes: Partial<IndependentReservationDetails>) => onChange(line.room.id, { ...item, ...changes });
      const { total } = independentRoomQuote(line, nights, extraBedService);
      return <section key={line.room.id} className="border rounded-3 p-3 mb-3" aria-label={`Reserva de habitación ${line.room.number}`}>
        <div className="d-flex justify-content-between gap-2 mb-3">
          <strong>Habitación {line.room.number}</strong>
          <strong>{money(total)}</strong>
        </div>
        <div className="row g-3">
          <div className="col-sm-6">
            <label className="form-label" htmlFor={`batch-first-${line.room.id}`}>Nombre (opcional)</label>
            <input id={`batch-first-${line.room.id}`} className="form-control" maxLength={100} value={item.firstName} onChange={(e) => update({ firstName: e.target.value })} placeholder="Huésped genérico" />
          </div>
          <div className="col-sm-6">
            <label className="form-label" htmlFor={`batch-last-${line.room.id}`}>Apellido (opcional)</label>
            <input id={`batch-last-${line.room.id}`} className="form-control" maxLength={100} value={item.lastName} onChange={(e) => update({ lastName: e.target.value })} />
          </div>
          <div className="col-sm-6">
            <label className="form-label" htmlFor={`batch-payment-${line.room.id}`}>Cobro</label>
            <select id={`batch-payment-${line.room.id}`} className="form-select" value={item.paymentMode} onChange={(e) => update({ paymentMode: e.target.value as IndependentReservationDetails['paymentMode'] })}>
              <option value="none">Sin cobro inicial</option>
              <option value="full">Pagó el total</option>
              <option value="custom">Otro importe</option>
            </select>
          </div>
          {item.paymentMode !== 'none' && <div className="col-sm-6">
            <label className="form-label" htmlFor={`batch-method-${line.room.id}`}>Método de pago</label>
            <select id={`batch-method-${line.room.id}`} className="form-select" value={item.method} onChange={(e) => update({ method: e.target.value as IndependentReservationDetails['method'] })}>
              {(['CASH', 'CARD', 'TRANSFER'] as const).map((method) => <option key={method} value={method}>{PAYMENT_METHODS[method]}</option>)}
            </select>
          </div>}
          {item.paymentMode === 'custom' && <div className="col-sm-6">
            <label className="form-label" htmlFor={`batch-amount-${line.room.id}`}>Importe cobrado</label>
            <input id={`batch-amount-${line.room.id}`} type="number" className="form-control" min="0.01" max={total} step="0.01" value={item.amount} onChange={(e) => update({ amount: e.target.value })} required />
          </div>}
          <div className="col-12">
            <label className="form-label" htmlFor={`batch-notes-${line.room.id}`}>Notas (opcional)</label>
            <input id={`batch-notes-${line.room.id}`} className="form-control" maxLength={500} value={item.notes} onChange={(e) => update({ notes: e.target.value })} />
          </div>
        </div>
      </section>;
    })}
    {rooms.length > 0 && <p className="small text-secondary mb-0">Las camas extras se incluyen si tienen un servicio configurado. Para agregar otros servicios o descuentos, usá la carga de una reserva.</p>}
  </div>;
}
