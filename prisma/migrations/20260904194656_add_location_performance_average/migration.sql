-- CreateTable
CREATE TABLE "LocationPerformanceAverage" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "durAccToStarted" DECIMAL(8,2),
    "durStartedToPrep" DECIMAL(8,2),
    "durPrepToSTD" DECIMAL(8,2),
    "durSTDToDispatched" DECIMAL(8,2),
    "durDispatchedToDelivered" DECIMAL(8,2),
    "durReceivedToDelivered" DECIMAL(8,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPerformanceAverage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocationPerformanceAverage_brandId_locationId_key" ON "LocationPerformanceAverage"("brandId", "locationId");

-- AddForeignKey
ALTER TABLE "LocationPerformanceAverage" ADD CONSTRAINT "LocationPerformanceAverage_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPerformanceAverage" ADD CONSTRAINT "LocationPerformanceAverage_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
