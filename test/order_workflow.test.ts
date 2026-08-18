import assert from "node:assert/strict";
import test from "node:test";
import type { LoopMessage, ModelTurn, OrderModel, ToolRequest } from "../src/ai_gateway";
import { runOrderWorkflow } from "../src/order_workflow";

function turn(...toolRequests: ToolRequest[]): ModelTurn {
  return {
    message: {
      role: "assistant",
      content: null,
      tool_calls: toolRequests.map((request) => ({
        id: request.id,
        type: "function",
        function: { name: request.name, arguments: request.arguments }
      }))
    },
    toolRequests
  };
}

test("rejects fulfillment before checkout capture", async () => {
  const model: OrderModel = {
    async next(_messages: LoopMessage[]) {
      return turn({ id: "call-1", name: "release_fulfillment", arguments: JSON.stringify({ orderId: "ord-7" }) });
    },
    async embedReceipt() { return [0.1]; }
  };

  await assert.rejects(
    runOrderWorkflow({
      orderId: "ord-7",
      amountCents: 2500,
      currency: "USD",
      itemSku: "CARE-PACK",
      shippingRegion: "US-NY"
    }, model),
    /Fulfillment requires captured checkout/
  );
});

test("hands a completed, minimized receipt to embeddings", async () => {
  const calls = [
    turn({ id: "call-1", name: "capture_checkout", arguments: JSON.stringify({ orderId: "ord-8", amountCents: 2500 }) }),
    turn({ id: "call-2", name: "release_fulfillment", arguments: JSON.stringify({ orderId: "ord-8" }) }),
    turn({ id: "call-3", name: "issue_receipt", arguments: JSON.stringify({ orderId: "ord-8" }) }),
    turn({ id: "call-4", name: "record_customer_update", arguments: JSON.stringify({ orderId: "ord-8", message: "Your care pack is ready for carrier pickup." }) })
  ];
  let embedded = "";
  const model: OrderModel = {
    async next() { return calls.shift() ?? { message: { role: "assistant", content: "done" }, toolRequests: [] }; },
    async embedReceipt(summary) { embedded = summary; return [0.25, 0.75]; }
  };

  const result = await runOrderWorkflow({
    orderId: "ord-8",
    amountCents: 2500,
    currency: "USD",
    itemSku: "CARE-PACK",
    shippingRegion: "US-NY"
  }, model);

  assert.equal(result.state, "complete");
  assert.deepEqual(result.audit, ["checkout:paid", "fulfillment:released", "receipt:issued", "customer:updated"]);
  assert.equal(embedded, "receipt-ord-8|CARE-PACK|2500|USD|complete");
  assert.deepEqual(result.receiptEmbedding, [0.25, 0.75]);
});
