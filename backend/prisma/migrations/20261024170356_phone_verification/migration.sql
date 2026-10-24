-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'PHONE_CHANGE');

-- AlterTable
ALTER TABLE "otp_codes" ADD COLUMN     "purpose" "OtpPurpose" NOT NULL DEFAULT 'LOGIN',
ADD COLUMN     "user_id" UUID,
ALTER COLUMN "code_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone_verified_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "otp_codes_user_id_created_at_idx" ON "otp_codes"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing user signed up by proving their number with a one-time code
-- (the only way an account is created), so their phone was verified at creation.
UPDATE "users" SET "phone_verified_at" = "created_at" WHERE "phone_verified_at" IS NULL;

-- A PHONE_CHANGE code must name the user who requested it; LOGIN codes never do.
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_purpose_user_check"
  CHECK (("purpose" = 'PHONE_CHANGE') = ("user_id" IS NOT NULL));
