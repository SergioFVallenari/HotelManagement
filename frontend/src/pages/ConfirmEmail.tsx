import { useEffect, useState } from "react";
import { api } from "../api/client";

const ConfirmEmail = () => {
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [message, setMessage] = useState("Verificando tu email...");

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tokenHash = params.get("token_hash");
        const type = params.get("type");
        window.history.replaceState({}, "", window.location.pathname);

        if (!tokenHash || type !== "email") {
            setStatus("error");
            setMessage("El enlace de confirmación es inválido.");
            return;
        }

        api(
            `/auth/confirm-email?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`,
            { method: "GET" }
        )
            .then((res) => {
                setStatus("success");
                setMessage((res as { message: string }).message);
            })
            .catch(() => {
                setStatus("error");
                setMessage("No pudimos confirmar tu email. El enlace puede haber expirado o ya haber sido utilizado.");
            });
    }, []);

    return (
        <main
            className="min-vh-100 d-flex align-items-center justify-content-center p-4"
            style={{
                background: "linear-gradient(135deg, #DAE4E7 0%, #B5C9D0 100%)",
            }}
        >
            <div
                className="card border-0 rounded-4 text-center p-4 p-md-5"
                style={{
                    width: "100%",
                    maxWidth: "460px",
                    boxShadow: "0 20px 60px rgba(3, 30, 39, 0.10)",
                }}
            >
                {/* Logo */}
                <div className="mb-4">
                    <span
                        className="fw-bold"
                        style={{
                            fontSize: "2rem",
                            letterSpacing: "-1.5px",
                            color: "#084C61",
                        }}
                    >
                        Hospia<span style={{ color: "#031E27" }}>.</span>
                    </span>
                    <div className="text-secondary small mt-1">
                        Gestión hotelera, más simple.
                    </div>
                </div>

                {/* Ícono de estado */}
                <div className="d-flex justify-content-center mb-4">
                    {status === "loading" ? (
                        <div
                            className="spinner-border"
                            role="status"
                            style={{
                                width: "4rem",
                                height: "4rem",
                                color: "#084C61",
                                borderWidth: "4px",
                            }}
                        >
                            <span className="visually-hidden">Verificando...</span>
                        </div>
                    ) : (
                        <div
                            className="d-flex align-items-center justify-content-center rounded-circle"
                            style={{
                                width: "84px",
                                height: "84px",
                                backgroundColor:
                                    status === "success" ? "#dcfce7" : "#fee2e2",
                                color: status === "success" ? "#16a34a" : "#dc2626",
                                fontSize: "2.5rem",
                                boxShadow: `0 0 0 10px ${status === "success" ? "#f0fdf4" : "#fef2f2"
                                    }`,
                            }}
                        >
                            {status === "success" ? "✓" : "×"}
                        </div>
                    )}
                </div>

                {/* Mensaje */}
                <h1 className="h3 fw-bold mb-3" style={{ color: "#031E27" }}>
                    {status === "loading"
                        ? "Verificando tu email"
                        : status === "success"
                            ? "¡Todo listo!"
                            : "No pudimos confirmar tu email"}
                </h1>

                <p
                    className="mb-4"
                    style={{
                        color: "#528290",
                        fontSize: "0.95rem",
                        lineHeight: 1.7,
                    }}
                >
                    {status === "loading"
                        ? "Estamos verificando tu cuenta. Esto solo tomará unos segundos."
                        : status === "success"
                            ? "Tu dirección de email fue verificada correctamente. Ya podés ingresar a Hospia y comenzar a gestionar tus alojamientos."
                            : message}
                </p>

                {/* Indicador de estado */}
                {status !== "loading" && (
                    <div
                        className={`alert ${status === "success" ? "alert-success" : "alert-danger"
                            } rounded-3 small mb-4`}
                        role="status"
                    >
                        {status === "success"
                            ? "Tu cuenta ya está verificada."
                            : "Revisá el enlace o solicitá uno nuevo."}
                    </div>
                )}

                {/* Acción */}
                {status === "success" && (
                    <a
                        href="/login"
                        className="btn btn-primary btn-lg w-100 rounded-3 fw-semibold"
                        style={{
                            backgroundColor: "#084C61",
                            borderColor: "#084C61",
                            padding: "13px",
                            boxShadow: "0 5px 14px rgba(8, 76, 97, 0.22)",
                        }}
                    >
                        Ir a iniciar sesión <span className="ms-2">→</span>
                    </a>
                )}

                {status === "error" && (
                    <a
                        href="/login"
                        className="btn btn-outline-secondary w-100 rounded-3 py-3 fw-semibold"
                    >
                        Volver al inicio de sesión
                    </a>
                )}

                <div
                    className="border-top mt-4 pt-3 text-secondary"
                    style={{ fontSize: "0.8rem" }}
                >
                    © {new Date().getFullYear()} Hospia · Todos los derechos reservados
                </div>
            </div>
        </main>
    );
};

export default ConfirmEmail;