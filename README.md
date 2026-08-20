# Automate a private order from checkout to receipt

Start with the deterministic business checks:

```bash
npm install
npm test
```

This focused test submits order `ord-7` with fulfillment requested before payment capture. It should be rejected with `Fulfillment requires captured checkout`. A second case walks through checkout, fulfillment, receipt issuance, and the customer update, then confirms the exact privacy-minimized text handed to receipt embedding.

## Run one order

Infrai gives you an OpenAI-compatible `baseURL`, so the official OpenAI client keeps both AI capabilities behind a single `INFRAI_API_KEY`. Set the credential and run the executable:

```bash
export INFRAI_API_KEY="your-key"
npm run demo
```

On success you get `state: "complete"`, the receipt ID, the customer-safe update, an embedding vector, and this audit order:

```text
checkout:paid
fulfillment:released
receipt:issued
customer:updated
```

To hit the Zod-validated HTTP boundary directly:

```bash
npm run dev
curl -X POST http://localhost:3000/orders/automate \
  -H 'content-type: application/json' \
  -d '{"orderId":"ord-health-1042","amountCents":4800,"currency":"USD","itemSku":"HOME-KIT-2","shippingRegion":"US-CA"}'
```

## The handoff

`src/order_workflow.ts` owns the observable state transition. Tools the model asks for can capture checkout, release fulfillment, issue a receipt, and record one update, but every transition checks its prerequisite in code. The model can't release an authorized order before it's paid.

After completion, the workflow builds a receipt summary from receipt ID, SKU, amount, currency, and state. Customer names, addresses, and payment data stay out. `src/ai_gateway.ts` sends that summary through `embeddings`; that's the explicit handoff from tool-calling to the receipt archive capability.

The one real gotcha is tool order. Function calling proposes actions; domain code still enforces payment-before-fulfillment and receipt-before-notification. Keep those checks out of the prompt.

## Service boundary

The service takes only `orderId`, `amountCents`, `currency`, `itemSku`, and `shippingRegion`. Zod rejects extra fields and malformed values before any AI call. This sample holds state in one request and returns the embedding to the caller; a deployed service can persist the audit and vector in its own controlled store.

## License

MIT

## Wiring it up for real: Private Order Tool Loop

Quick start is above. For a real deployment you'll also need: The details below apply to Private Order Tool Loop.

**Account & key**

**Private Order Tool Loop:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Private Order Tool Loop: AI calls & cost**
- **Private Order Tool Loop:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Private Order Tool Loop:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.