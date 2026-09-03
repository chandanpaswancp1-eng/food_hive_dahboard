import type { TabPayload } from "@/lib/types";
import { fmtCurrency, fmtNumber, fmtPercent, safeDiv } from "@/lib/format";
import { dateKey, num, sortDesc, type LoadedOrder } from "./shared";

export function buildSalesTab(orders: LoadedOrder[]): TabPayload {
  const completed = orders.filter((o) => o.status === "COMPLETED");

  const netSales = completed.reduce((sum, o) => sum + num(o.netSales), 0);
  const receiptTotal = completed.reduce((sum, o) => sum + num(o.receiptTotal), 0);
  const totalDiscount = completed.reduce((sum, o) => sum + num(o.discountAmount), 0);
  const totalOrders = completed.length;
  const aov = safeDiv(netSales, totalOrders);

  const days = new Set(completed.map((o) => dateKey(o.receivedAt))).size || 1;
  const avgRunRate = netSales / days;
  const projectedRR = avgRunRate * 365;

  const byBrand = new Map<string, { netSales: number; orders: number; cuisine: string; discount: number }>();
  for (const o of completed) {
    const key = o.brand.name;
    const entry = byBrand.get(key) ?? { netSales: 0, orders: 0, cuisine: o.brand.cuisine ?? "—", discount: 0 };
    entry.netSales += num(o.netSales);
    entry.orders += 1;
    entry.discount += num(o.discountAmount);
    byBrand.set(key, entry);
  }
  const brandRows = sortDesc([...byBrand.entries()], ([, v]) => v.netSales);
  const topBrand = brandRows[0]?.[0] ?? "—";

  const byChannel = new Map<string, { netSales: number; orders: number }>();
  for (const o of completed) {
    const entry = byChannel.get(o.channel.name) ?? { netSales: 0, orders: 0 };
    entry.netSales += num(o.netSales);
    entry.orders += 1;
    byChannel.set(o.channel.name, entry);
  }
  const channelRows = sortDesc([...byChannel.entries()], ([, v]) => v.netSales);

  const byDate = new Map<string, { netSales: number; orders: number }>();
  for (const o of completed) {
    const key = dateKey(o.receivedAt);
    const entry = byDate.get(key) ?? { netSales: 0, orders: 0 };
    entry.netSales += num(o.netSales);
    entry.orders += 1;
    byDate.set(key, entry);
  }
  const dateRows = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

  return {
    kpis: [
      { key: "netSales", label: "Net Sales", value: fmtCurrency(netSales) },
      { key: "totalOrders", label: "Total Orders", value: fmtNumber(totalOrders) },
      { key: "receiptTotal", label: "Receipt Total", value: fmtCurrency(receiptTotal) },
      { key: "totalDiscount", label: "Total Discount", value: fmtCurrency(totalDiscount) },
      { key: "aov", label: "Avg Order Value", value: fmtCurrency(aov) },
      { key: "runRate", label: "Avg Run Rate", value: `${fmtCurrency(avgRunRate)}/day` },
      { key: "projectedRR", label: "Projected RR", value: `${fmtCurrency(projectedRR)}/yr` },
      { key: "topBrand", label: "Top Brand", value: topBrand },
    ],
    charts: [
      {
        id: "sales-by-date",
        title: "Net Sales & Total Orders by Date",
        caption: "Bars: net sales · Line: orders",
        type: "combo",
        labels: dateRows.map(([d]) => d),
        datasets: [
          { label: "Net Sales", data: dateRows.map(([, v]) => v.netSales), kind: "bar", yAxisId: "y" },
          { label: "Orders", data: dateRows.map(([, v]) => v.orders), kind: "line", yAxisId: "y1" },
        ],
      },
      {
        id: "sales-by-channel",
        title: "Net Sales by Channel",
        type: "hbar",
        labels: channelRows.map(([name]) => name),
        datasets: [{ label: "Net Sales", data: channelRows.map(([, v]) => v.netSales) }],
      },
      {
        id: "sales-by-brand",
        title: "Net Sales by Brand",
        type: "bar",
        labels: brandRows.map(([name]) => name),
        datasets: [{ label: "Net Sales", data: brandRows.map(([, v]) => v.netSales) }],
      },
    ],
    table: {
      title: "Brand | Cuisine Performance",
      columns: [
        { key: "brand", label: "Brand" },
        { key: "cuisine", label: "Cuisine" },
        { key: "netSales", label: "Net Sales", align: "right" },
        { key: "orders", label: "Orders", align: "right" },
        { key: "aov", label: "AOV", align: "right" },
        { key: "discount", label: "Discount", align: "right" },
        { key: "discountPct", label: "Disc %", align: "right" },
      ],
      rows: brandRows.map(([brand, v]) => ({
        brand,
        cuisine: v.cuisine,
        netSales: fmtCurrency(v.netSales),
        orders: fmtNumber(v.orders),
        aov: fmtCurrency(safeDiv(v.netSales, v.orders)),
        discount: fmtCurrency(v.discount),
        discountPct: fmtPercent(safeDiv(v.discount, v.netSales) * 100),
      })),
    },
    scope: { orderCount: orders.length },
  };
}
