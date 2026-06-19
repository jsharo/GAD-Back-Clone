-- Migration: user RBAC model + schema sync
-- Transforms legacy "users" table (enum role, refresh_token column)
-- into "user" table + role/user_role/refresh_token tables.

-- ── 1. New enums ──────────────────────────────────────────────────────────────

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "RefreshTokenStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- ── 2. RBAC tables (before dropping legacy role column) ───────────────────────

CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permission_name_key" ON "permission"("name");

CREATE TABLE "user_permission" (
    "user_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_pkey" PRIMARY KEY ("user_id", "permission_id")
);

CREATE TABLE "role_permission" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id", "permission_id")
);

CREATE TABLE "user_role" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id", "role_id")
);

CREATE UNIQUE INDEX "user_role_user_id_key" ON "user_role"("user_id");

CREATE TABLE "role_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_by_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "role_assignments_user_id_idx" ON "role_assignments"("user_id");
CREATE INDEX "role_assignments_role_id_idx" ON "role_assignments"("role_id");
CREATE INDEX "role_assignments_assigned_by_id_idx" ON "role_assignments"("assigned_by_id");

CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "RefreshTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refresh_token_user_id_status_idx" ON "refresh_token"("user_id", "status");

-- Seed canonical roles (matches legacy Role enum values)
INSERT INTO "role" ("id", "name", "description", "created_at", "updated_at") VALUES
  ('role_superadmin', 'SUPERADMIN', 'System administrator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_citizen',    'CITIZEN',    'Citizen / property owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_technician', 'TECHNICIAN', 'Field technician', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_secretary',  'SECRETARY',  'Secretary reviewer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_financial',  'FINANCIAL',  'Financial officer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_architect',  'ARCHITECT',  'Licensed architect / engineer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_guest',      'GUEST',      'Guest account', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- ── 3. Transform legacy users → user ─────────────────────────────────────────

ALTER TABLE "users" RENAME TO "user";

ALTER TABLE "user" RENAME COLUMN "password_hash" TO "password";
ALTER TABLE "user" RENAME COLUMN "first_name" TO "name";
ALTER TABLE "user" RENAME COLUMN "last_name" TO "lastname";
ALTER TABLE "user" RENAME COLUMN "national_id" TO "cedula";

ALTER TABLE "user" ADD COLUMN "direction" TEXT;
ALTER TABLE "user" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "user" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN "verification_code" TEXT;
ALTER TABLE "user" ADD COLUMN "verification_expiry" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "deleted_at" TIMESTAMP(3);

UPDATE "user"
SET "status" = CASE
  WHEN "active" = true THEN 'ACTIVE'::"UserStatus"
  ELSE 'INACTIVE'::"UserStatus"
END;

ALTER TABLE "user" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "user" ALTER COLUMN "lastname" DROP NOT NULL;

-- Migrate enum role → user_role join table
INSERT INTO "user_role" ("user_id", "role_id", "created_at")
SELECT
  u."id",
  r."id",
  u."created_at"
FROM "user" u
JOIN "role" r ON r."name" = u."role"::text;

-- Audit trail for migrated role assignments (self-assigned on migration)
INSERT INTO "role_assignments" ("id", "user_id", "role_id", "assigned_by_id", "assigned_at")
SELECT
  'mra_' || u."id",
  u."id",
  r."id",
  u."id",
  u."created_at"
FROM "user" u
JOIN "role" r ON r."name" = u."role"::text;

-- Migrate legacy single refresh_token column → refresh_token table
INSERT INTO "refresh_token" ("id", "user_id", "token_hash", "status", "expires_at", "created_at")
SELECT
  'rtm_' || u."id",
  u."id",
  u."refresh_token",
  'ACTIVE'::"RefreshTokenStatus",
  u."updated_at" + INTERVAL '7 days',
  u."updated_at"
FROM "user" u
WHERE u."refresh_token" IS NOT NULL;

-- Drop legacy columns (phone, zone, architect fields — export first if needed in prod)
ALTER TABLE "user" DROP COLUMN "phone";
ALTER TABLE "user" DROP COLUMN "role";
ALTER TABLE "user" DROP COLUMN "active";
ALTER TABLE "user" DROP COLUMN "zone";
ALTER TABLE "user" DROP COLUMN "enabled";
ALTER TABLE "user" DROP COLUMN "degree";
ALTER TABLE "user" DROP COLUMN "registration_number";
ALTER TABLE "user" DROP COLUMN "refresh_token";

DROP TYPE "Role";

-- Rename legacy indexes
ALTER INDEX "users_email_key" RENAME TO "user_email_key";
ALTER INDEX "users_national_id_key" RENAME TO "user_cedula_key";

-- ── 4. RBAC foreign keys ──────────────────────────────────────────────────────

ALTER TABLE "user_permission" ADD CONSTRAINT "user_permission_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permission" ADD CONSTRAINT "user_permission_permission_id_fkey"
  FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey"
  FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5. Sync remaining schema drift (non-user modules) ───────────────────────

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "folder" TEXT NOT NULL DEFAULT 'OTROS';

ALTER TABLE "resolutions" ADD COLUMN IF NOT EXISTS "calculation_detail" TEXT;
ALTER TABLE "resolutions" ADD COLUMN IF NOT EXISTS "auto_calculated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "secretary_decisions" ADD COLUMN IF NOT EXISTS "signature_validated" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "fee_rules" (
    "id" TEXT NOT NULL,
    "request_type" "RequestType" NOT NULL,
    "zone" "PropertyZone" NOT NULL,
    "base_fee" DOUBLE PRECISION NOT NULL,
    "rate_per_m2" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fee_rules_request_type_zone_key"
  ON "fee_rules"("request_type", "zone");
