import {
  escapeHtml,
  formatDate,
  formatMoney,
} from "../utils/formatters.ts";

export interface GuestReservationEmailData {
  code: string;
  companyName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  persons: number;
  total: number | null;
  deposit: number | null;
  reservationUrl: string;
}

export function renderGuestReservationEmail(
  data: GuestReservationEmailData
): string {
  const url = new URL(data.reservationUrl);

  if (url.protocol !== "https:") {
    throw new Error("La URL de reserva debe utilizar HTTPS");
  }

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:12px 0;color:#667085;font-size:14px;">
        ${escapeHtml(label)}
      </td>
      <td align="right"
        style="padding:12px 0;color:#101425;
        font-size:14px;font-weight:600;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
    content="width=device-width, initial-scale=1">
  <title>Reserva confirmada | ${escapeHtml(data.companyName)}</title>
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

          <!-- HEADER -->
          <tr>
            <td align="center"
              style="background:#101425;padding:36px 24px;">

              <div style="font-size:24px;font-weight:800;
                color:#FFFFFF;">
                ${escapeHtml(data.companyName)}
              </div>

              <div style="font-size:12px;
                letter-spacing:2px;color:#A99BFF;
                margin-top:10px;">
                CONFIRMACIÓN DE RESERVA
              </div>

            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td style="padding:32px 28px;">

              <div style="text-align:center;">

                <span style="display:inline-block;
                  background:#E6F6ED;color:#18794E;
                  padding:9px 14px;border-radius:6px;
                  font-size:12px;font-weight:700;">
                  ✓ Reserva confirmada
                </span>

                <h1 style="font-size:25px;color:#101425;
                  margin:24px 0 12px;">
                  ¡Tu reserva está confirmada!
                </h1>

                <p style="font-size:15px;color:#667085;
                  line-height:1.7;">
                  Hola, ${escapeHtml(data.guestName)}.
                  <br><br>
                  ¡Tenemos buenas noticias!
                  Tu reserva en
                  <strong>${escapeHtml(data.companyName)}</strong>
                  fue confirmada correctamente.
                </p>

              </div>

              <!-- RESERVATION DETAILS -->
              <h2 style="font-size:16px;color:#101425;
                margin:32px 0 12px;">
                Detalles de tu estadía
              </h2>

              <table role="presentation" width="100%"
                cellpadding="0" cellspacing="0">

                ${row("Código de reserva", data.code)}

                ${row(
                  "Check-in",
                  formatDate(data.checkIn)
                )}

                ${row(
                  "Check-out",
                  formatDate(data.checkOut)
                )}

                ${row(
                  "Personas",
                  String(data.persons)
                )}

              </table>

              <div style="height:1px;background:#E9E9F0;
                margin:24px 0;"></div>

              <!-- AMOUNTS -->
              <table role="presentation" width="100%"
                cellpadding="0" cellspacing="0"
                style="background:#F5F3FF;border-radius:8px;">

                <tr>
                  <td style="padding:20px;">

                    <table role="presentation" width="100%">

                      <tr>
                        <td style="font-size:14px;color:#55546A;">
                          Total de la estadía
                        </td>

                        <td align="right"
                          style="font-size:17px;
                          font-weight:700;color:#101425;">
                          ${escapeHtml(formatMoney(data.total))}
                        </td>
                      </tr>

                      <tr>
                        <td style="padding-top:16px;
                          font-size:14px;color:#55546A;">
                          Anticipo
                        </td>

                        <td align="right"
                          style="padding-top:16px;
                          font-size:21px;font-weight:800;
                          color:#7665E8;">
                          ${escapeHtml(formatMoney(data.deposit))}
                        </td>
                      </tr>

                    </table>

                  </td>
                </tr>
              </table>

              <!-- BUTTON -->
              <table role="presentation" width="100%"
                cellpadding="0" cellspacing="0"
                style="margin-top:30px;">

                <tr>
                  <td align="center" bgcolor="#7665E8"
                    style="border-radius:8px;">

                    <a href="${escapeHtml(url.toString())}"
                      style="display:block;
                      padding:17px 20px;
                      color:#FFFFFF;
                      text-decoration:none;
                      font-size:15px;
                      font-weight:700;">
                      Consultar mi reserva
                    </a>

                  </td>
                </tr>

              </table>

              <!-- FOOTER MESSAGE -->
              <p style="font-size:14px;color:#667085;
                line-height:1.7;text-align:center;
                margin-top:30px;">

                ¡Gracias por elegirnos!
                <br>
                Esperamos que disfrutes tu estadía.

              </p>

              <p style="text-align:center;
                color:#98A2B3;font-size:12px;
                margin-top:24px;">
                Código de reserva:
                ${escapeHtml(data.code)}
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center"
              style="background:#F8F8FC;padding:24px;">

              <p style="font-size:13px;color:#55546A;
                font-weight:600;margin:0;">
                ${escapeHtml(data.companyName)}
              </p>

              <p style="font-size:11px;color:#A1A1AA;
                margin-top:10px;">
                Este correo fue generado automáticamente.
              </p>

              <p style="font-size:11px;color:#A1A1AA;
                margin-top:6px;">
                Tecnología de gestión proporcionada por LAIXIA.
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