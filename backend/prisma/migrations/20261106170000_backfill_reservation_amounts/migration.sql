WITH totals AS (
  SELECT r."id", c."bookingDepositPercent", b."deposit" AS link_deposit,
    COALESCE(r."totalAmount", b."total",
      COALESCE(
        (SELECT SUM(ROUND(rr."roomPrice" * (r."checkOut" - r."checkIn") *
          CASE WHEN rr."roomPricingMode" = 'PER_PERSON' THEN rr."persons" ELSE 1 END, 2))
         FROM "ReservationRoom" rr WHERE rr."reservationId" = r."id"),
        ROUND(COALESCE(r."roomPrice", room."price") * (r."checkOut" - r."checkIn") *
          CASE WHEN r."roomPricingMode" = 'PER_PERSON' THEN r."persons" ELSE 1 END, 2)
      ) + COALESCE((SELECT ROUND(SUM(s."quantity" * s."unitPrice"), 2)
                    FROM "ReservationService" s WHERE s."reservationId" = r."id"), 0)
    ) AS total
  FROM "Reservation" r
  JOIN "Company" c ON c."id" = r."companyId"
  JOIN "Room" room ON room."id" = r."roomId"
  LEFT JOIN "BookingLink" b ON b."reservationId" = r."id"
  WHERE r."totalAmount" IS NULL OR r."depositRequired" IS NULL
), deposits AS (
  SELECT *, ROUND(total * "bookingDepositPercent" / 100, 2) AS raw_deposit
  FROM totals
)
UPDATE "Reservation" r
SET "totalAmount" = d.total,
    "depositRequired" = COALESCE(r."depositRequired", d.link_deposit,
      CASE
        WHEN d.raw_deposit <= 0 THEN 0
        WHEN ROUND(d.raw_deposit / 10000) * 10000 <= 0 THEN d.raw_deposit
        ELSE LEAST(ROUND(d.raw_deposit / 10000) * 10000, d.total)
      END)
FROM deposits d
WHERE r."id" = d."id";
