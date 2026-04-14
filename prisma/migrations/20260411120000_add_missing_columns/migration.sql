-- AlterTable
ALTER TABLE "CoachProfile" ADD COLUMN     "stravaDisplayName" TEXT,
ADD COLUMN     "stravaEmail" TEXT,
ADD COLUMN     "stravaUsername" TEXT;

-- CreateTable
CREATE TABLE "TelegramCoachMessage" (
    "id" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramCoachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramCoachMessage_coachProfileId_createdAt_idx" ON "TelegramCoachMessage"("coachProfileId", "createdAt");

-- AddForeignKey
ALTER TABLE "TelegramCoachMessage" ADD CONSTRAINT "TelegramCoachMessage_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
