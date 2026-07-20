-- AlterTable
ALTER TABLE "user" ADD COLUMN "recovery_email" TEXT;
ALTER TABLE "user" ADD COLUMN "recovery_email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user" ADD COLUMN "recovery_email_code" TEXT;
ALTER TABLE "user" ADD COLUMN "recovery_email_code_expiry" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN "password_reset_code" TEXT;
ALTER TABLE "user" ADD COLUMN "password_reset_expiry" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "user_recovery_email_key" ON "user"("recovery_email");
