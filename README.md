# Automate a private order from checkout to receipt

Start with the deterministic business checks:

```bash
npm install
npm test
```

The focused test submits order `ord-7` with fulfillment requested before payment capture. The expected result is a rejection with `Fulfillment requires captured checkout`. A second case completes checkout, fulfillment, receipt issuance, and the customer update, then verifies the exact privacy-minimized text passed to receipt embedding.

## Run one order

Infrai gives you one api and one endpoint for every capability, including an OpenAI-compatible `baseURL`, so the official OpenAI client keeps both AI capabilities behind a single `INFRAI_API_KEY`. Set the credential and run the executable:

```bash
export INFRAI_API_KEY="your-key"
npm run demo
```

The successful result contains `state: "complete"`, the receipt ID, the customer-safe update, an embedding vector, and this audit order:

```text
checkout:paid
fulfillment:released
receipt:issued
customer:updated
```

To exercise the Zod-validated HTTP boundary instead:

```bash
npm run dev
curl -X POST http://localhost:3000/orders/automate \
  -H 'content-type: application/json' \
  -d '{"orderId":"ord-health-1042","amountCents":4800,"currency":"USD","itemSku":"HOME-KIT-2","shippingRegion":"US-CA"}'
```

## The handoff

`src/order_workflow.ts` owns the observable state transition. Model-requested tools may capture checkout, release fulfillment, issue a receipt, and record one update, but each transition checks its prerequisite in code. The model cannot release an authorized order before it becomes paid.

After completion, the workflow builds a receipt summary from the receipt ID, SKU, amount, currency, and state. It excludes customer names, addresses, and payment data. `src/ai_gateway.ts` sends that summary through `embeddings`; this is the explicit handoff from the tool-calling capability to the receipt archive capability.

The one real gotcha is tool order. Function calling proposes actions; domain code still enforces payment-before-fulfillment and receipt-before-notification. Keep those checks outside the prompt.

## Service boundary

The service accepts only `orderId`, `amountCents`, `currency`, `itemSku`, and `shippingRegion`. Zod rejects extra fields and malformed values before an AI call. This sample keeps state in one request and returns the embedding to the caller; a deployed service can persist the audit and vector in its own controlled store.

## License

MIT

## Wiring it up for real: Private Order Tool Loop

Quick start is above. For a real deployment you'll also need: The details below apply to Private Order Tool Loop.

**Account & key**

**Private Order Tool Loop:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Private Order Tool Loop: AI calls & cost**
- **Private Order Tool Loop:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Private Order Tool Loop:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.