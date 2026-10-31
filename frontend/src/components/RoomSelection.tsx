import type { Room } from '../api/types';
import { money } from '../lib/format';
import type { SelectedRoom } from '../lib/reservationRooms';

export function RoomSelection({ rooms, value, onChange }: { rooms: Room[]; value: SelectedRoom[]; onChange: (value: SelectedRoom[]) => void }) {
  function update(roomId: number, changes: Partial<SelectedRoom>) {
    onChange(value.map((line) => line.room.id === roomId ? { ...line, ...changes } : line));
  }

  return <div className="mt-3">
    <p className="small text-secondary">Seleccioná todas las habitaciones de la reserva e indicá las personas en cada una.</p>
    <div className="radio-list">
      {rooms.map((room) => {
        const selected = value.find((line) => line.room.id === room.id);
        return <div key={room.id} className={`radio-item flex-wrap ${selected ? 'selected' : ''}`}>
          <label className="d-flex align-items-center gap-2 flex-grow-1">
            <input type="checkbox" className="form-check-input" checked={!!selected}
              onChange={() => onChange(selected ? value.filter((line) => line.room.id !== room.id) : [...value, { room, persons: room.capacity, extraBeds: 0 }])} />
            <span><strong>{room.number}</strong> · {room.type?.name} · Cap. {room.capacity}</span>
          </label>
          <span className="text-secondary">{money(room.price)}/{room.pricingMode === 'PER_PERSON' ? 'persona/noche' : 'noche'}</span>
          {selected && <div className="d-flex gap-3 flex-wrap w-100 mt-2">
            <label className="field-inline">Personas
              <input aria-label={`Personas en habitación ${room.number}`} type="number" className="form-control" style={{ width: 90 }} min={1} max={room.capacity} value={selected.persons}
                onChange={(event) => { const persons = Math.max(1, Math.min(room.capacity, Number(event.target.value))); update(room.id, { persons, extraBeds: persons < room.capacity ? 0 : selected.extraBeds }); }} />
            </label>
            {room.maxExtraBeds > 0 && <label className="field-inline">Camas extras
              <input aria-label={`Camas extras en habitación ${room.number}`} type="number" className="form-control" style={{ width: 90 }} min={0} max={room.maxExtraBeds} disabled={selected.persons < room.capacity} value={selected.extraBeds}
                onChange={(event) => update(room.id, { extraBeds: Math.max(0, Math.min(room.maxExtraBeds, Number(event.target.value))) })} />
            </label>}
          </div>}
        </div>;
      })}
    </div>
    {value.length > 0 && <p className="mt-3 fw-semibold">{value.length} habitación(es) · {value.reduce((sum, line) => sum + line.persons, 0)} personas{value.some((line) => line.extraBeds > 0) && ` + ${value.reduce((sum, line) => sum + line.extraBeds, 0)} en camas extras`}</p>}
  </div>;
}
