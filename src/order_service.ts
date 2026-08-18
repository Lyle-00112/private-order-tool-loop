import { createServer } from "node:http";
import { ZodError } from "zod";
import { createOrderModel } from "./ai_gateway";
import { orderRequestSchema, runOrderWorkflow } from "./order_workflow";

const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.method !== "POST" || request.url !== "/orders/automate") {
    response.writeHead(404).end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = orderRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await runOrderWorkflow(input, createOrderModel());
    response.writeHead(200).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "Invalid order request" }));
      return;
    }
    console.error(error);
    response.writeHead(502).end(JSON.stringify({ error: "Order automation did not complete" }));
  }
}).listen(port, () => console.log(`Order service listening on http://localhost:${port}`));
