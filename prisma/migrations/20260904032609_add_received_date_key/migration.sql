-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "receivedDateKey" TEXT;

-- CreateIndex
CREATE INDEX "Order_receivedDateKey_idx" ON "Order"("receivedDateKey");
