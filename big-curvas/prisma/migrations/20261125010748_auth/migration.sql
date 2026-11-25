-- CreateEnum
CREATE TYPE "session_kind" AS ENUM ('WEB', 'POS');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_changed_at" TIMESTAMP(3),
ADD COLUMN     "password_hash" TEXT;

-- CreateTable
CREATE TABLE "pos_devices" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "device_token_hash" TEXT,
    "pairing_code_hash" TEXT,
    "pairing_expires_at" TIMESTAMP(3),
    "registered_by" TEXT NOT NULL,
    "paired_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "session_kind" NOT NULL,
    "pos_device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_throttles" (
    "key" TEXT NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_throttles_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_device_token_hash_key" ON "pos_devices"("device_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "pos_devices_pairing_code_hash_key" ON "pos_devices"("pairing_code_hash");

-- CreateIndex
CREATE INDEX "pos_devices_location_id_active_idx" ON "pos_devices"("location_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_pos_device_id_idx" ON "sessions"("pos_device_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_pos_device_id_fkey" FOREIGN KEY ("pos_device_id") REFERENCES "pos_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ══════════ SQL MANUAL (Prisma no soporta CHECK) ══════════
-- Esta migración SOLO AGREGA (columnas nullable o con default, tablas, índices y CHECK): no borra ni cambia datos
-- salvo normalizar los emails existentes a minúsculas. Un rollback del código a la versión anterior sigue
-- funcionando con este esquema, porque el código viejo ignora las columnas y tablas nuevas. No toca los triggers de
-- inmutabilidad ni los CHECK existentes (scripts/verify-db.sql lo comprueba).

-- Los emails se guardan y se buscan en minúsculas. Se normalizan los existentes antes de exigirlo.
UPDATE "users" SET "email" = lower("email") WHERE "email" IS NOT NULL AND "email" <> lower("email");
ALTER TABLE "users" ADD CONSTRAINT "users_email_lower_chk" CHECK ("email" IS NULL OR "email" = lower("email"));

-- Una contraseña temporal solo existe si hay contraseña.
ALTER TABLE "users" ADD CONSTRAINT "users_must_change_chk" CHECK (NOT "must_change_password" OR "password_hash" IS NOT NULL);

-- Una sesión POS siempre nace de un dispositivo; una web nunca.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_kind_device_chk" CHECK (("kind" = 'POS') = ("pos_device_id" IS NOT NULL));
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expiry_chk" CHECK ("expires_at" > "created_at");

-- Contador de intentos nunca negativo.
ALTER TABLE "auth_throttles" ADD CONSTRAINT "auth_throttles_failed_chk" CHECK ("failed_attempts" >= 0);

-- Un dispositivo inactivo siempre está revocado (con fecha). El código de vinculación y su vencimiento van juntos.
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_revoked_chk" CHECK ("active" OR "revoked_at" IS NOT NULL);
ALTER TABLE "pos_devices" ADD CONSTRAINT "pos_devices_pairing_chk" CHECK (("pairing_code_hash" IS NULL) = ("pairing_expires_at" IS NULL));
