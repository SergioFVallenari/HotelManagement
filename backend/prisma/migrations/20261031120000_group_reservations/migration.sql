CREATE TABLE "ReservationRoom" (
  "id" SERIAL NOT NULL,
  "reservationId" INTEGER NOT NULL,
  "roomId" INTEGER NOT NULL,
  "persons" INTEGER NOT NULL,
  "extraBeds" INTEGER NOT NULL DEFAULT 0,
  "roomPrice" DECIMAL(10,2) NOT NULL,
  "roomPricingMode" "RoomPricingMode" NOT NULL,
  CONSTRAINT "ReservationRoom_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReservationRoom_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReservationRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReservationRoom_persons_check" CHECK ("persons" > 0 AND "extraBeds" >= 0)
);
CREATE UNIQUE INDEX "ReservationRoom_reservationId_roomId_key" ON "ReservationRoom"("reservationId", "roomId");
CREATE INDEX "ReservationRoom_roomId_idx" ON "ReservationRoom"("roomId");
ALTER TABLE "ReservationRoom" ENABLE ROW LEVEL SECURITY;
INSERT INTO "ReservationRoom" ("reservationId", "roomId", "persons", "extraBeds", "roomPrice", "roomPricingMode")
SELECT r."id", r."roomId", r."persons", r."extraBeds", COALESCE(r."roomPrice", h."price"), COALESCE(r."roomPricingMode", 'PER_NIGHT'::"RoomPricingMode")
FROM "Reservation" r JOIN "Room" h ON h."id" = r."roomId";
ALTER TABLE "BookingLink" ADD COLUMN "rooms" JSONB NOT NULL DEFAULT '[]';
