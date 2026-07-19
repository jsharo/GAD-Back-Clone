-- CreateEnum
CREATE TYPE "ProfessionalStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "user" ADD COLUMN "senescyt_code" TEXT;
ALTER TABLE "user" ADD COLUMN "professional_status" "ProfessionalStatus" NOT NULL DEFAULT 'UNVERIFIED';
