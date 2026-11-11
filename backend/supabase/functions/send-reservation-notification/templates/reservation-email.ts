
import {
  escapeHtml,
  formatDate,
  formatMoney,
} from "../utils/formatters.ts";

export interface ReservationEmailData {
  code: string;
  companyName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  persons: number;
  total: number | null;
  deposit: number | null;
  status: string;
  reservationUrl: string | null;
}

export function renderReservationEmail(
  data: ReservationEmailData
): string {
  const statuses: Record<string, {
    label: string;
    color: string;
    background: string;
  }> = {
    PENDING: {
      label: "Pendiente de aprobación",
      color: "#9A6700",
      background: "#FFF4DE",
    },
    RESERVED: {
      label: "Reserva confirmada",
      color: "#18794E",
      background: "#E6F6ED",
    },
    CHECKED_IN: {
      label: "Huésped alojado",
      color: "#4338CA",
      background: "#EEF2FF",
    },
    CHECKED_OUT: {
      label: "Estadía finalizada",
      color: "#475467",
      background: "#F2F4F7",
    },
    CANCELLED: {
      label: "Reserva cancelada",
      color: "#B42318",
      background: "#FEECEB",
    },
  };

  const status = statuses[data.status] ?? {
    label: data.status,
    color: "#475467",
    background: "#F2F4F7",
  };

  const title =
    data.status === "PENDING"
      ? "Nueva reserva recibida"
      : data.status === "RESERVED"
        ? "Reserva confirmada"
        : "Actualización de reserva";

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:12px 0;color:#667085;font-size:14px;">
        ${escapeHtml(label)}
      </td>
      <td align="right" style="padding:12px 0;color:#101425;
        font-size:14px;font-weight:600;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `;

  let button = "";

  if (data.reservationUrl) {
    const url = new URL(data.reservationUrl);

    if (url.protocol !== "https:") {
      throw new Error("La URL de reserva debe utilizar HTTPS");
    }

    button = `
      <table role="presentation" width="100%"
        cellpadding="0" cellspacing="0"
        style="margin-top:28px;">
        <tr>
          <td align="center" bgcolor="#7665E8"
            style="border-radius:8px;">
            <a href="${escapeHtml(url.toString())}"
              style="display:block;padding:16px 20px;
              color:#FFFFFF;text-decoration:none;
              font-size:15px;font-weight:700;">
              Ver reserva en LAIXIA
            </a>
          </td>
        </tr>
      </table>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | LAIXIA</title>
</head>

<body style="margin:0;padding:0;background:#F3F4F8;
  font-family:Arial,Helvetica,sans-serif;">

  <table role="presentation" width="100%"
    cellpadding="0" cellspacing="0"
    style="background:#F3F4F8;">
    <tr>
      <td align="center" style="padding:32px 12px;">

        <table role="presentation" width="100%"
          cellpadding="0" cellspacing="0"
          style="max-width:560px;background:#FFFFFF;">

          <tr>
            <td align="center"
              style="background:#101425;padding:32px 24px;">
              <div style="font-size:30px;font-weight:800;
                letter-spacing:3px;color:#FFFFFF;">
                LAIXIA
              </div>
              <div style="font-size:11px;letter-spacing:2px;
                color:#A99BFF;margin-top:8px;">
                GESTIÓN DE ALOJAMIENTOS
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 28px;">

              <span style="display:inline-block;
                background:${status.background};
                color:${status.color};padding:8px 12px;
                border-radius:6px;font-size:12px;
                font-weight:700;">
                ${escapeHtml(status.label)}
              </span>

              <h1 style="font-size:23px;color:#101425;
                margin:22px 0 12px;">
                ${escapeHtml(title)}
              </h1>

              <p style="font-size:14px;color:#667085;
                line-height:1.7;">
                Se registró una reserva en
                <strong>${escapeHtml(data.companyName)}</strong>.
                Estos son los detalles de la estadía.
              </p>

              <h2 style="font-size:15px;color:#101425;
                margin:28px 0 12px;">
                Información de la reserva
              </h2>

              <table role="presentation" width="100%"
                cellpadding="0" cellspacing="0">
                ${row("Código", data.code)}
                ${row("Huésped", data.guestName)}
                ${row("Check-in", formatDate(data.checkIn))}
                ${row("Check-out", formatDate(data.checkOut))}
                ${row("Personas", String(data.persons))}
              </table>

              <div style="height:1px;background:#E9E9F0;
                margin:24px 0;"></div>

              <table role="presentation" width="100%"
                cellpadding="0" cellspacing="0"
                style="background:#F5F3FF;border-radius:8px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%">
                      <tr>
                        <td style="font-size:14px;color:#55546A;">
                          Monto total
                        </td>
                        <td align="right"
                          style="font-size:16px;font-weight:700;
                          color:#101425;">
                          ${escapeHtml(formatMoney(data.total))}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:14px;font-size:14px;
                          color:#55546A;">
                          Anticipo solicitado
                        </td>
                        <td align="right"
                          style="padding-top:14px;font-size:21px;
                          font-weight:800;color:#7665E8;">
                          ${escapeHtml(formatMoney(data.deposit))}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${button}

              <p style="text-align:center;color:#98A2B3;
                font-size:12px;margin-top:22px;">
                Notificación automática ·
                ${escapeHtml(data.code)}
              </p>
            </td>
          </tr>

          <tr>
            <td align="center"
              style="background:#F8F8FC;padding:22px;">
              <p style="font-size:12px;color:#8A8D9A;margin:0;">
                LAIXIA · Gestión inteligente de alojamientos
              </p>
              <p style="font-size:11px;color:#A1A1AA;
                margin-top:8px;">
                Este mensaje fue generado automáticamente.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
