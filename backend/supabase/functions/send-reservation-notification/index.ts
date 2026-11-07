
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend";
import { renderReservationEmail } from "./templates/reservation-email.ts";

const expectedSecret = Deno.env.get("NOTIFICATION_WEBHOOK_SECRET");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("LAIXIA_SUPABASE_SECRET_KEY")!
);

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

Deno.serve(async (req) => {
  const providedSecret = req.headers.get("x-webhook-secret");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();

    // Validar que sea un INSERT en NotificationOutbox
    if (
      payload.type !== "INSERT" ||
      payload.table !== "NotificationOutbox"
    ) {
      return new Response("Ignored", { status: 200 });
    }

    const notification = payload.record;

    if (
      !notification?.id ||
      notification.companyId == null ||
      notification.reservationId == null
    ) {
      return new Response("Invalid notification", { status: 400 });
    }
    const { data: reservation, error: reservationError } = await supabase
      .from("Reservation")
      .select(`
              id,
              code,
              companyId,
              checkIn,
              checkOut,
              persons,
              status,
              totalAmount,
              depositRequired,
              guest:Guest!inner(
                firstName,
                lastName),
              company:Company!inner(
                name),
              bookingLink:BookingLink(
                total,
                deposit)
              `)
      .eq("id", notification.reservationId)
      .eq("companyId", notification.companyId)
      .single();

    if (reservationError) throw reservationError;
    if (!reservation) throw new Error("Reserva no encontrada");
    // 1. Buscar los destinatarios habilitados de la empresa
    const { data: recipients, error: recipientsError } = await supabase
      .from("CompanyNotificationRecipient")
      .select("email")
      .eq("companyId", notification.companyId)
      .eq("enabled", true);

    if (recipientsError) throw recipientsError;

    if (!recipients?.length) {
      throw new Error("No hay destinatarios configurados");
    }

    // 2. Crear una entrega por destinatario sin sobrescribir las existentes
    const { error: createDeliveriesError } = await supabase
      .from("NotificationDelivery")
      .upsert(
        recipients.map((recipient) => ({
          notificationId: notification.id,
          recipientEmail: recipient.email,
          status: "PENDING",
        })),
        {
          onConflict: "notificationId,recipientEmail",
          ignoreDuplicates: true,
        }
      );

    if (createDeliveriesError) throw createDeliveriesError;

    // 3. Preparar el contenido del correo
    const subject =
      notification.event === "RESERVATION_PENDING"
        ? "Nueva reserva pendiente"
        : notification.event === "RESERVATION_CONFIRMED"
          ? "Nueva reserva confirmada"
          : "Actualización de reserva";

    const guest = Array.isArray(reservation.guest)
      ? reservation.guest[0]
      : reservation.guest;

    const company = Array.isArray(reservation.company)
      ? reservation.company[0]
      : reservation.company;

    const bookingLink = Array.isArray(reservation.bookingLink)
      ? reservation.bookingLink[0]
      : reservation.bookingLink;

    const html = renderReservationEmail({
      code: reservation.code,
      companyName: company.name,
      guestName: `${guest.firstName} ${guest.lastName}`,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      persons: reservation.persons,
      total: bookingLink?.total != null
        ? Number(bookingLink.total)
        : Number(reservation.totalAmount),
      deposit: bookingLink?.deposit != null
        ? Number(bookingLink.deposit)
        : Number(reservation.depositRequired),
      status: reservation.status,
      reservationUrl: `https://app.posadaelnomada.com.ar/reservations?reservationId=${reservation.id}`,
    });

    // 4. Consultar las entregas pendientes
    const { data: deliveries, error: fetchDeliveriesError } = await supabase
      .from("NotificationDelivery")
      .select("id, recipientEmail, status")
      .eq("notificationId", notification.id)
      .eq("status", "PENDING");

    if (fetchDeliveriesError) throw fetchDeliveriesError;

    // 5. Enviar los correos pendientes
    for (const delivery of deliveries ?? []) {
      const { data, error: sendError } = await resend.emails.send(
        {
          from: Deno.env.get("EMAIL_FROM")!,
          to: delivery.recipientEmail,
          subject,
          html,
        },
        {
          idempotencyKey: `delivery/${delivery.id}`,
        }
      );

      if (sendError) {
        console.error("Error enviando email:", {
          deliveryId: delivery.id,
          error: sendError,
        });

        throw sendError;
      }

      // 6. Marcar la entrega como enviada
      const now = new Date().toISOString();

      const { error: updateDeliveryError } = await supabase
        .from("NotificationDelivery")
        .update({
          status: "SENT",
          sentAt: now,
          providerId: data?.id ?? null,
          updatedAt: now,
        })
        .eq("id", delivery.id)
        .eq("notificationId", notification.id);

      if (updateDeliveryError) throw updateDeliveryError;
    }

    // 7. Comprobar si quedan entregas sin enviar
    const { data: remaining, error: remainingError } = await supabase
      .from("NotificationDelivery")
      .select("id")
      .eq("notificationId", notification.id)
      .neq("status", "SENT")
      .limit(1);

    if (remainingError) throw remainingError;

    // 8. Marcar la notificación general como enviada
    // solamente cuando todas sus entregas estén en SENT
    if (remaining?.length === 0) {
      const now = new Date().toISOString();

      const { error: outboxError } = await supabase
        .from("NotificationOutbox")
        .update({
          status: "SENT",
          sentAt: now,
          updatedAt: now,
        })
        .eq("id", notification.id)
        .eq("companyId", notification.companyId);

      if (outboxError) throw outboxError;
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing notification:", error);

    return new Response("Error processing notification", {
      status: 500,
    });
  }
});
