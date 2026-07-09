/*
  Warnings:

  - The primary key for the `session` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `token_id` on the `session` table. All the data in the column will be lost.
  - The required column `session_id` was added to the `session` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterEnum
ALTER TYPE "SessionState" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "session" DROP CONSTRAINT "session_pkey",
DROP COLUMN "token_id",
ADD COLUMN     "agent" TEXT,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "session_id" TEXT NOT NULL,
ADD CONSTRAINT "session_pkey" PRIMARY KEY ("session_id");
