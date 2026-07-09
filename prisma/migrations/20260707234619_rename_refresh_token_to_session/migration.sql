/*
  Warnings:

  - You are about to drop the `refresh_token` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('ACTIVE', 'REVOKED');

-- DropForeignKey
ALTER TABLE "refresh_token" DROP CONSTRAINT "refresh_token_user_id_fkey";

-- DropTable
DROP TABLE "refresh_token";

-- DropEnum
DROP TYPE "RefreshTokenStatus";

-- CreateTable
CREATE TABLE "session" (
    "token_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "session_pkey" PRIMARY KEY ("token_id")
);

-- CreateIndex
CREATE INDEX "session_user_id_state_idx" ON "session"("user_id", "state");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
