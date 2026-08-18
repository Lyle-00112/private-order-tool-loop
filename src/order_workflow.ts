import { z } from "zod";
import type { LoopMessage, OrderModel, ToolRequest } from "./ai_gateway";

export const orderRequestSchema = z.object({
  orderId: z.string().min(1).max(80),
  amountCents: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  itemSku: z.string().min(1).max(80),
  shippingRegion: z.string().min(2).max(80)
}).strict();

export type OrderRequest = z.infer<typeof orderRequestSchema>;
type OrderState = "authorized" | "paid" | "released" | "complete";

export type OrderResult = {
  orderId: string;
  state: OrderState;
  receiptId: string;
  customerUpdate: string;
  receiptEmbedding: number[];
  audit: string[];
};

const checkoutArgs = z.object({ orderId: z.string(), amountCents: z.number().int().positive() }).strict();
const orderArgs = z.object({ orderId: z.string() }).strict();
const updateArgs = z.object({ orderId: z.string(), message: z.string().min(1).max(240) }).strict();

export async function runOrderWorkflow(input: OrderRequest, model: OrderModel): Promise<OrderResult> {
  let state: OrderState = "authorized";
  let receiptId = "";
  let customerUpdate = "";
  const audit: string[] = [];
  const messages: LoopMessage[] = [
    {
      role: "system",
      content: "Process one order. Capture checkout before fulfillment. Then issue a receipt and record one customer update. Use only supplied order data. Never put personal or payment data in messages."
    },
    { role: "user", content: JSON.stringify(input) }
  ];

  const execute = (request: ToolRequest): string => {
    const raw: unknown = JSON.parse(request.arguments);
    if (request.name === "capture_checkout") {
      const args = checkoutArgs.parse(raw);
      assertOrder(args.orderId, input.orderId);
      if (args.amountCents !== input.amountCents) throw new Error("Checkout amount does not match order");
      if (state !== "authorized") throw new Error("Checkout has already been captured");
      state = "paid";
      audit.push("checkout:paid");
      return JSON.stringify({ orderId: input.orderId, state });
    }
    if (request.name === "release_fulfillment") {
      const args = orderArgs.parse(raw);
      assertOrder(args.orderId, input.orderId);
      if (state !== "paid") throw new Error("Fulfillment requires captured checkout");
      state = "released";
      audit.push("fulfillment:released");
      return JSON.stringify({ orderId: input.orderId, state });
    }
    if (request.name === "issue_receipt") {
      const args = orderArgs.parse(raw);
      assertOrder(args.orderId, input.orderId);
      if (state !== "released") throw new Error("Receipt requires released fulfillment");
      receiptId = `receipt-${input.orderId}`;
      audit.push("receipt:issued");
      return JSON.stringify({ orderId: input.orderId, receiptId });
    }
    if (request.name === "record_customer_update") {
      const args = updateArgs.parse(raw);
      assertOrder(args.orderId, input.orderId);
      if (!receiptId) throw new Error("Customer update requires a receipt");
      customerUpdate = args.message;
      state = "complete";
      audit.push("customer:updated");
      return JSON.stringify({ orderId: input.orderId, state });
    }
    throw new Error(`Unknown order tool: ${request.name}`);
  };

  for (let turn = 0; turn < 8; turn += 1) {
    const decision = await model.next(messages);
    messages.push(decision.message);
    if (decision.toolRequests.length === 0) break;
    for (const request of decision.toolRequests) {
      messages.push({ role: "tool", tool_call_id: request.id, content: execute(request) });
    }
    if (state === "complete") break;
  }

  if (state !== "complete" || !receiptId || !customerUpdate) {
    throw new Error("Order workflow ended before completion");
  }

  // Keep the embedding handoff free of names, addresses, and payment data.
  const receiptSummary = `${receiptId}|${input.itemSku}|${input.amountCents}|${input.currency}|${state}`;
  const receiptEmbedding = await model.embedReceipt(receiptSummary);
  return { orderId: input.orderId, state, receiptId, customerUpdate, receiptEmbedding, audit };
}

function assertOrder(actual: string, expected: string): void {
  if (actual !== expected) throw new Error("Tool order does not match active order");
}
