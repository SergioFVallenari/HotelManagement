import type { Prisma } from "../../generated/prisma/client.js";

type NotificationTransaction = {
  notificationOutbox: {
    createMany: (args: {
      data: Prisma.NotificationOutboxCreateManyInput[];
      skipDuplicates?: boolean;
    }) => Promise<{ count: number }>;
  };
};

interface ReservationNotificationInput {
  companyId: number;
  reservationId: number;
  source: string;
  status: string;
}

export async function registerReservationNotification(
  tx: NotificationTransaction,
  input: ReservationNotificationInput
): Promise<void> {
  const { companyId, reservationId, source, status } = input;

  await tx.notificationOutbox.createMany({
    data: [
      {
        companyId,
        reservationId,
        event: status === "PENDING" ? "RESERVATION_PENDING" : "RESERVATION_CONFIRMED",
      },
    ],
    skipDuplicates: true,
  });
}
