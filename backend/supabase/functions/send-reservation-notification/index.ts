import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend";

import { renderReservationEmail } from "./templates/reservation-email.ts";
import { renderGuestReservationEmail } from "./templates/guest-reservation-email.ts";

const expectedSecret = Deno.env.get("NOTIFICATION_WEBHOOK_SECRET");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("LAIXIA_SUPABASE_SECRET_KEY")!
);

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

type RecipientType = "ADMIN" | "GUEST";

type NotificationEvent =
  | "RESERVATION_PENDING"
  | "RESERVATION_CONFIRMED"
  | "RESERVATION_CANCELLED";

interface NotificationRecord {
  id: string;
  companyId: number;
  reservationId: number;
  event: NotificationEvent;
}

interface WebhookPayload {
  type: string;
  table: string;
  record?: NotificationRecord;
}

interface DeliveryToCreate {
  notificationId: string;
  recipientEmail: string;
  recipientType: RecipientType;
  status: "PENDING";
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildGuestReservationUrl(
  code: string,
  slug: string
): string {
  const url = new URL(
    "https://reservas.posadaelnomada.com.ar/consultar-reserva"
  );

  url.searchParams.set("codigo", code);
  url.searchParams.set("slug", slug);

  return url.toString();
}

function getAdminSubject(event: NotificationEvent): string {
  switch (event) {
    case "RESERVATION_PENDING":
      return "Nueva reserva pendiente";

    case "RESERVATION_CONFIRMED":
      return "Nueva reserva confirmada";

    case "RESERVATION_CANCELLED":
      return "Reserva cancelada";

    default:
      return "Actualización de reserva";
  }
}

// --------------------------------------------------
// EDGE FUNCTION
// --------------------------------------------------

Deno.serve(async (req) => {
  // 1. Validar webhook secret
  const providedSecret = req.headers.get("x-webhook-secret");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  try {
    const payload: WebhookPayload = await req.json();

    // 2. Procesar únicamente INSERT en NotificationOutbox
    if (
      payload.type !== "INSERT" ||
      payload.table !== "NotificationOutbox"
    ) {
      return new Response("Ignored", {
        status: 200,
      });
    }

    const notification = payload.record;

    if (
      !notification?.id ||
      notification.companyId == null ||
      notification.reservationId == null
    ) {
      return new Response("Invalid notification", {
        status: 400,
      });
    }

    // --------------------------------------------------
    // 3. Obtener información de la reserva
    // --------------------------------------------------

    const {
      data: reservation,
      error: reservationError,
    } = await supabase
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
          lastName,
          email
        ),

        company:Company!inner(
          name,
          bookingSlug
        ),

        bookingLink:BookingLink(
          total,
          deposit
        )
      `)
      .eq("id", notification.reservationId)
      .eq("companyId", notification.companyId)
      .single();

    if (reservationError) {
      throw reservationError;
    }

    if (!reservation) {
      throw new Error("Reserva no encontrada");
    }

    // --------------------------------------------------
    // 4. Normalizar relaciones
    // --------------------------------------------------

    const guest = Array.isArray(reservation.guest)
      ? reservation.guest[0]
      : reservation.guest;

    const company = Array.isArray(reservation.company)
      ? reservation.company[0]
      : reservation.company;

    const bookingLink = Array.isArray(reservation.bookingLink)
      ? reservation.bookingLink[0]
      : reservation.bookingLink;

    if (!guest || !company) {
      throw new Error(
        "La reserva no tiene huésped o empresa asociados"
      );
    }

    const guestName =
      `${guest.firstName} ${guest.lastName}`.trim();

    // --------------------------------------------------
    // 5. Obtener destinatarios administrativos
    // --------------------------------------------------

    const {
      data: recipients,
      error: recipientsError,
    } = await supabase
      .from("CompanyNotificationRecipient")
      .select("email")
      .eq("companyId", notification.companyId)
      .eq("enabled", true);

    if (recipientsError) {
      throw recipientsError;
    }

    // --------------------------------------------------
    // 6. Construir lista de entregas
    // --------------------------------------------------

    const deliveriesToCreate: DeliveryToCreate[] = [];

    const adminEmails = new Set<string>();

    for (const recipient of recipients ?? []) {
      if (!recipient.email?.trim()) {
        continue;
      }

      adminEmails.add(normalizeEmail(recipient.email));
    }

    // Administradores
    for (const email of adminEmails) {
      deliveriesToCreate.push({
        notificationId: notification.id,
        recipientEmail: email,
        recipientType: "ADMIN",
        status: "PENDING",
      });
    }

    // Huésped: únicamente cuando se confirma la reserva
    const shouldNotifyGuest =
      notification.event === "RESERVATION_CONFIRMED" &&
      reservation.status === "RESERVED" &&
      Boolean(guest.email?.trim());

    if (shouldNotifyGuest) {
      deliveriesToCreate.push({
        notificationId: notification.id,
        recipientEmail: normalizeEmail(guest.email!),
        recipientType: "GUEST",
        status: "PENDING",
      });
    }

    // --------------------------------------------------
    // 7. Crear entregas sin duplicar existentes
    // --------------------------------------------------

    if (deliveriesToCreate.length > 0) {
      const { error: createDeliveriesError } =
        await supabase
          .from("NotificationDelivery")
          .upsert(
            deliveriesToCreate,
            {
              onConflict:
                "notificationId,recipientEmail,recipientType",
              ignoreDuplicates: true,
            }
          );

      if (createDeliveriesError) {
        throw createDeliveriesError;
      }
    }

    // --------------------------------------------------
    // 8. Preparar datos de los templates
    // --------------------------------------------------

    const total =
      bookingLink?.total != null
        ? Number(bookingLink.total)
        : reservation.totalAmount != null
          ? Number(reservation.totalAmount)
          : null;

    const deposit =
      bookingLink?.deposit != null
        ? Number(bookingLink.deposit)
        : reservation.depositRequired != null
          ? Number(reservation.depositRequired)
          : null;

    // Template administrativo
    const adminHtml = renderReservationEmail({
      code: reservation.code,
      companyName: company.name,
      guestName,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      persons: reservation.persons,
      total,
      deposit,
      status: reservation.status,
      reservationUrl:
        `https://app.posadaelnomada.com.ar/reservations?reservationId=${reservation.id}`,
    });

    const adminSubject = getAdminSubject(
      notification.event
    );

    // --------------------------------------------------
    // 9. Preparar template del huésped
    // --------------------------------------------------

    let guestHtml: string | null = null;

    const guestSubject =
      `¡Tu reserva en ${company.name} está confirmada!`;

    if (shouldNotifyGuest) {
      if (!company.bookingSlug) {
        throw new Error(
          `La empresa ${notification.companyId} no tiene bookingSlug configurado`
        );
      }

      const guestReservationUrl = buildGuestReservationUrl(
        reservation.code,
        company.bookingSlug
      );

      guestHtml = renderGuestReservationEmail({
        code: reservation.code,
        companyName: company.name,
        guestName,
        checkIn: reservation.checkIn,
        checkOut: reservation.checkOut,
        persons: reservation.persons,
        total,
        deposit,
        reservationUrl: guestReservationUrl,
      });
    }

    // --------------------------------------------------
    // 10. Consultar entregas pendientes
    // --------------------------------------------------

    const {
      data: deliveries,
      error: fetchDeliveriesError,
    } = await supabase
      .from("NotificationDelivery")
      .select(`
        id,
        recipientEmail,
        recipientType,
        status
      `)
      .eq("notificationId", notification.id)
      .eq("status", "PENDING");

    if (fetchDeliveriesError) {
      throw fetchDeliveriesError;
    }

    // --------------------------------------------------
    // 11. Enviar correos
    // --------------------------------------------------

    for (const delivery of deliveries ?? []) {
      const isGuest =
        delivery.recipientType === "GUEST";

      // No enviar correos al huésped en eventos no permitidos
      if (isGuest && !shouldNotifyGuest) {
        console.warn(
          "Entrega GUEST omitida por evento o estado:",
          delivery.id
        );

        continue;
      }

      const html = isGuest
        ? guestHtml
        : adminHtml;

      const subject = isGuest
        ? guestSubject
        : adminSubject;

      if (!html) {
        throw new Error(
          `No se pudo generar el template para ${delivery.id}`
        );
      }

      const {
        data,
        error: sendError,
      } = await resend.emails.send(
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
        console.error(
          "Error enviando email:",
          {
            deliveryId: delivery.id,
            recipientType: delivery.recipientType,
            error: sendError,
          }
        );

        throw sendError;
      }

      // --------------------------------------------------
      // 12. Marcar entrega como enviada
      // --------------------------------------------------

      const now = new Date().toISOString();

      const {
        error: updateDeliveryError,
      } = await supabase
        .from("NotificationDelivery")
        .update({
          status: "SENT",
          sentAt: now,
          providerId: data?.id ?? null,
          updatedAt: now,
        })
        .eq("id", delivery.id)
        .eq("notificationId", notification.id);

      if (updateDeliveryError) {
        throw updateDeliveryError;
      }

      console.log(
        "Email enviado:",
        {
          deliveryId: delivery.id,
          recipientType: delivery.recipientType,
          recipientEmail: delivery.recipientEmail,
        }
      );
    }

    // --------------------------------------------------
    // 13. Comprobar entregas pendientes
    // --------------------------------------------------

    const {
      data: remaining,
      error: remainingError,
    } = await supabase
      .from("NotificationDelivery")
      .select("id")
      .eq("notificationId", notification.id)
      .neq("status", "SENT")
      .limit(1);

    if (remainingError) {
      throw remainingError;
    }

    // --------------------------------------------------
    // 14. Marcar notificación como enviada
    // --------------------------------------------------

    if (remaining?.length === 0) {
      const now = new Date().toISOString();

      const {
        error: outboxError,
      } = await supabase
        .from("NotificationOutbox")
        .update({
          status: "SENT",
          sentAt: now,
          updatedAt: now,
        })
        .eq("id", notification.id)
        .eq("companyId", notification.companyId);

      if (outboxError) {
        throw outboxError;
      }

      console.log(
        "Notificación completada:",
        {
          notificationId: notification.id,
          event: notification.event,
        }
      );
    }

    return new Response("OK", {
      status: 200,
    });

  } catch (error) {
    console.error(
      "Error processing notification:",
      error
    );

    return new Response(
      "Error processing notification",
      {
        status: 500,
      }
    );
  }
});