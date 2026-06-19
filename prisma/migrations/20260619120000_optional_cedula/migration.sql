-- Make cedula optional (collected later during profile completion)
ALTER TABLE "user" ALTER COLUMN "cedula" DROP NOT NULL;
