"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import type { OrderInvoice } from "@/lib/types";
import { fmtCurrencyExact, fmtDateTimeGst, fmtMinutes } from "@/lib/format";

interface Props {
  orderId: string;
  onClose: () => void;
}

export function InvoiceModal({ orderId, onClose }: Props) {
  const [invoice, setInvoice] = useState<OrderInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/orders/${orderId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Order not found");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setInvoice(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load invoice");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal invoice-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header no-print">
          <div>
            <div className="badge">Invoice</div>
            <h4>{invoice ? `Order ${invoice.orderNumber}` : "Order invoice"}</h4>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {invoice && (
              <button className="btn btn-primary" onClick={() => window.print()}>
                <Printer size={16} />
                Print / Save PDF
              </button>
            )}
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="empty-state">Loading…</div>
          ) : error || !invoice ? (
            <div className="empty-state">{error ?? "Order not found"}</div>
          ) : (
            <div className="invoice-sheet">
              <div className="invoice-top">
                <div>
                  <div className="invoice-brand">FoodHive</div>
                  <div className="invoice-meta">{invoice.location}</div>
                </div>
                <div className="invoice-top-right">
                  <div className="invoice-title">INVOICE</div>
                  <div className="invoice-meta">Order #{invoice.orderNumber}</div>
                  <div className="invoice-meta">{fmtDateTimeGst(invoice.receivedAt)}</div>
                </div>
              </div>

              <div className="invoice-grid">
                <div>
                  <div className="invoice-label">Brand</div>
                  <div>{invoice.brand}</div>
                </div>
                <div>
                  <div className="invoice-label">Channel</div>
                  <div>{invoice.channel}</div>
                </div>
                <div>
                  <div className="invoice-label">Payment Method</div>
                  <div>{invoice.paymentMethod ?? "—"}</div>
                </div>
                <div>
                  <div className="invoice-label">Status</div>
                  <div>
                    {invoice.status}
                    {invoice.isPostCancelled ? " (post-cancelled)" : ""}
                  </div>
                </div>
                {invoice.deliveryPartner && (
                  <div>
                    <div className="invoice-label">Delivery Partner</div>
                    <div>{invoice.deliveryPartner}</div>
                  </div>
                )}
                {invoice.cancellationReason && (
                  <div>
                    <div className="invoice-label">Cancellation Reason</div>
                    <div>{invoice.cancellationReason}</div>
                  </div>
                )}
                {invoice.actualPrepTime !== null && (
                  <div>
                    <div className="invoice-label">Prep Time</div>
                    <div>{fmtMinutes(invoice.actualPrepTime)}</div>
                  </div>
                )}
                {invoice.rating !== null && (
                  <div>
                    <div className="invoice-label">Rating</div>
                    <div>{invoice.rating.toFixed(1)} / 5</div>
                  </div>
                )}
              </div>

              <table className="data-table invoice-items">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit Price</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((it, i) => (
                    <tr key={i}>
                      <td>{it.name}</td>
                      <td className="num">{it.quantity}</td>
                      <td className="num">{fmtCurrencyExact(it.unitPrice)}</td>
                      <td className="num">{fmtCurrencyExact(it.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoice.itemsEstimated && (
                <div className="invoice-note">
                  GrubCenter does not report a per-item breakdown for this order — the line above is the order&apos;s total.
                </div>
              )}

              <div className="invoice-totals">
                <div className="invoice-totals-row">
                  <span>Gross Sales</span>
                  <span>{fmtCurrencyExact(invoice.grossSales)}</span>
                </div>
                <div className="invoice-totals-row">
                  <span>Discount ({invoice.discountPercent.toFixed(1)}%)</span>
                  <span>-{fmtCurrencyExact(invoice.discountAmount)}</span>
                </div>
                <div className="invoice-totals-row">
                  <span>VAT</span>
                  <span>{fmtCurrencyExact(invoice.taxAmount)}</span>
                </div>
                <div className="invoice-totals-row invoice-totals-total">
                  <span>Net Sales</span>
                  <span>{fmtCurrencyExact(invoice.netSales)}</span>
                </div>
                <div className="invoice-totals-row">
                  <span>Receipt Total</span>
                  <span>{fmtCurrencyExact(invoice.receiptTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
