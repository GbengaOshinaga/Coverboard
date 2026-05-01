-- CreateIndex
CREATE INDEX "User_organizationId_workCountry_isActive_idx" ON "User"("organizationId", "workCountry", "isActive");
