-- Cantidad de personas que toman cada servicio por persona (null = todas las de la reserva).
ALTER TABLE "ReservationService" ADD COLUMN "personsCovered" INTEGER;