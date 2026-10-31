import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { CompanyPickerPage } from './pages/CompanyPickerPage';
import { DashboardPage } from './pages/DashboardPage';
import { CalendarPage } from './pages/CalendarPage';
import { MessagesPage } from './pages/MessagesPage';
import { RoomsPage } from './pages/RoomsPage';
import { ReservationsPage } from './pages/ReservationsPage';
import { BookingLinksPage } from './pages/BookingLinksPage';
import { PublicBookingPage } from './pages/PublicBookingPage';
import { PublicAvailabilityPage } from './pages/PublicAvailabilityPage';
import { PublicReservationStatusPage } from './pages/PublicReservationStatusPage';
import { GuestsPage } from './pages/GuestsPage';
import { RoomTypesPage } from './pages/RoomTypesPage';
import { ServicesPage } from './pages/ServicesPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { ProfilePage } from './pages/ProfilePage';
import { PaymentResultPage } from './pages/PaymentResultPage';
import ConfirmEmail from './pages/ConfirmEmail';
import { DEMO_MODE } from './demo/config';

// El callback de Instagram vuelve a /settings/instagram?connected=…; las tabs
// viven en /settings, así que redirigimos conservando el query para que el
// toast del callback se vea en la pestaña de redes sociales.
function InstagramRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('tab', 'redes');
  return <Navigate to={`/settings?${params.toString()}`} replace />;
}

function AppRoutes() {
  if (DEMO_MODE) {
    return (
      <Routes>
        <Route path="/reserva/:token" element={<PublicBookingPage />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route path="booking-links" element={<BookingLinksPage />} />
          <Route path="guests" element={<GuestsPage />} />
          <Route path="room-types" element={<RoomTypesPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/company" element={<CompanyPickerPage />} />
      <Route path="/pago" element={<PaymentResultPage />} />
      <Route path="/confirm-email" element={<ConfirmEmail />} />
      {/* Link publico que se comparte por WhatsApp: sin sesion ni layout. */}
      <Route path="/reserva/:token" element={<PublicBookingPage />} />
      <Route path="/consultar-reserva" element={<PublicReservationStatusPage />} />
      <Route path="/disponibilidad" element={<PublicAvailabilityPage />} />
      <Route path="/disponibilidad/:slug" element={<PublicAvailabilityPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="rooms" element={<RoomsPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="booking-links" element={<BookingLinksPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="guests" element={<GuestsPage />} />
        <Route path="room-types" element={<RoomTypesPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/instagram" element={<InstagramRedirect />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
