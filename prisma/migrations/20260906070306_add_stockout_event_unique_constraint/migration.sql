-- AlterTable
CREATE UNIQUE INDEX "StockoutEvent_itemName_brandId_locationId_markedUnavailab_key" ON "StockoutEvent"("itemName", "brandId", "locationId", "markedUnavailableAt");
