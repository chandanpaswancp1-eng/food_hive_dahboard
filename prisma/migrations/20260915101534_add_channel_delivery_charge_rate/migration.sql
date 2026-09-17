-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "deliveryChargeRate" DECIMAL(5,2);

-- RenameIndex
ALTER INDEX "StockoutEvent_itemName_brandId_locationId_markedUnavailab_key" RENAME TO "StockoutEvent_itemName_brandId_locationId_markedUnavailable_key";
