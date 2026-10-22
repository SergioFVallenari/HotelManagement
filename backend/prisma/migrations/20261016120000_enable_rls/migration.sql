-- Bloquea el acceso al schema public via PostgREST/anon key de Supabase.
-- RLS habilitado SIN policies es deny-by-default: anon/authenticated no leen ni
-- escriben nada. El backend conecta como "postgres" (owner de las tablas) y
-- bypasea RLS, asi que sigue funcionando igual.
-- NO agregar FORCE ROW LEVEL SECURITY: forzaria RLS tambien al owner y romperia
-- al backend.

-- AlterTable
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "CompanyMpAccount" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "EmailVerificationCode" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "Guest" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "Reservation" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "ReservationService" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "RoomType" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "UserType" ENABLE ROW LEVEL SECURITY;

-- AlterTable
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
