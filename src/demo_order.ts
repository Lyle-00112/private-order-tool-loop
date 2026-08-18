import { createOrderModel } from "./ai_gateway";
import { runOrderWorkflow } from "./order_workflow";

const result = await runOrderWorkflow({
  orderId: "ord-health-1042",
  amountCents: 4800,
  currency: "USD",
  itemSku: "HOME-KIT-2",
  shippingRegion: "US-CA"
}, createOrderModel());

console.log(JSON.stringify(result, null, 2));
