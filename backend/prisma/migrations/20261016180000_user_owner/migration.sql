-- idOwner: id del OWNER (usuario con rol OWNER) al que pertenece la fila.
-- Queda nullable a proposito: se empieza a poblar en una migracion posterior
-- (trigger sync_auth_user + backfill) y las filas del seed no tienen OWNER.
ALTER TABLE "User" ADD COLUMN "idOwner" INTEGER;
