-- CreateTable
CREATE TABLE "FitNote" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "coversFrom" DATE NOT NULL,
    "coversTo" DATE NOT NULL,
    "receivedOn" DATE NOT NULL,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FitNote_leaveRequestId_idx" ON "FitNote"("leaveRequestId");

-- AddForeignKey
ALTER TABLE "FitNote" ADD CONSTRAINT "FitNote_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitNote" ADD CONSTRAINT "FitNote_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
