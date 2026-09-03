import type { TabPayload } from "@/lib/types";
import { fmtCurrency, fmtNumber, fmtPercent, safeDiv } from "@/lib/format";
import { num, sortDesc, type LoadedOrder } from "./shared";

export function buildCancellationsTab(orders: LoadedOrder[]): TabPayload {
  const cancelled = orders.filter((o) => o.status === "CANCELLED");
  const cancelledAmount = cancelled.reduce((sum, o) => sum + num(o.netSales), 0);
  const cancelledCount = cancelled.length;
  const cancelRate = safeDiv(cancelledCount, orders.length) * 100;
  const cancelledAov = safeDiv(cancelledAmount, cancelledCount);
  const postCancelled = cancelled.filter((o) => o.isPostCancelled);
  const postCancelledPct = safeDiv(postCancelled.length, cancelledCount) * 100;

  const byChannel = new Map<string, number>();
  for (const o of cancelled) byChannel.set(o.channel.name, (byChannel.get(o.channel.name) ?? 0) + 1);
  const channelRows = sortDesc([...byChannel.entries()], ([, v]) => v);
  const worstChannel = channelRows[0]?.[0] ?? "—";

  const byBrand = new Map<string, number>();
  for (const o of cancelled) byBrand.set(o.brand.name, (byBrand.get(o.brand.name) ?? 0) + num(o.netSales));
  const brandRows = sortDesc([...byBrand.entries()], ([, v]) => v);

  const byReason = new Map<string, { orders: number; amount: number }>();
  for (const o of cancelled) {
    const reason = o.cancellationReason?.description ?? "Unspecified";
    const entry = byReason.get(reason) ?? { orders: 0, amount: 0 };
    entry.orders += 1;
    entry.amount += num(o.netSales);
    byReason.set(reason, entry);
  }
  const reasonRows = sortDesc([...byReason.entries()], ([, v]) => v.orders);

  return {
    kpis: [
      { key: "cancelledAmount", label: "Cancelled Amount", value: fmtCurrency(cancelledAmount), accent: true },
      {
        key: "cancelledOrders",
        label: "Cancelled Orders",
        value: fmtNumber(cancelledCount),
        subtitle: fmtPercent(cancelRate),
      },
      { key: "cancelledAov", label: "Cancelled AOV", value: fmtCurrency(cancelledAov) },
      {
        key: "postCancelled",
        label: "Post-Cancelled",
        value: fmtNumber(postCancelled.length),
        subtitle: `${fmtPercent(postCancelledPct)} of cancellations`,
      },
      { key: "worstChannel", label: "Worst Channel", value: worstChannel },
    ],
    charts: [
      {
        id: "cancelled-by-channel",
        title: "Cancelled Orders by Channel",
        type: "hbar",
        labels: channelRows.map(([name]) => name),
        datasets: [{ label: "Cancelled Orders", data: channelRows.map(([, v]) => v) }],
      },
      {
        id: "cancelled-by-brand",
        title: "Cancelled Value by Brand",
        type: "bar",
        labels: brandRows.map(([name]) => name),
        datasets: [{ label: "Cancelled Value", data: brandRows.map(([, v]) => v) }],
      },
      {
        id: "post-cancelled-split",
        title: "Post-Cancelled Split",
        type: "doughnut",
        labels: ["Post-Accepted", "Pre-Accepted"],
        datasets: [
          {
            label: "Orders",
            data: [postCancelled.length, cancelledCount - postCancelled.length],
          },
        ],
      },
    ],
    table: {
      title: "Cancellation Reasons",
      columns: [
        { key: "reason", label: "Reason" },
        { key: "orders", label: "Orders", align: "right" },
        { key: "share", label: "Share", align: "right" },
        { key: "amount", label: "Lost Revenue", align: "right" },
      ],
      rows: reasonRows.map(([reason, v]) => ({
        reason,
        orders: fmtNumber(v.orders),
        share: fmtPercent(safeDiv(v.orders, cancelledCount) * 100),
        amount: fmtCurrency(v.amount),
      })),
    },
    scope: { orderCount: orders.length },
  };
}
