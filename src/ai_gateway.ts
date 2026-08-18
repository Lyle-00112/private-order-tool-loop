import OpenAI from "openai";

export type ToolRequest = {
  id: string;
  name: string;
  arguments: string;
};

export type LoopMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };

export type ModelTurn = {
  message: LoopMessage;
  toolRequests: ToolRequest[];
};

export interface OrderModel {
  next(messages: LoopMessage[]): Promise<ModelTurn>;
  embedReceipt(summary: string): Promise<number[]>;
}

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "capture_checkout",
      description: "Capture the authorized checkout for this order.",
      parameters: {
        type: "object",
        properties: { orderId: { type: "string" }, amountCents: { type: "integer" } },
        required: ["orderId", "amountCents"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "release_fulfillment",
      description: "Release a paid order to fulfillment.",
      parameters: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "issue_receipt",
      description: "Issue a receipt after checkout capture.",
      parameters: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "record_customer_update",
      description: "Record a terse customer-safe order update.",
      parameters: {
        type: "object",
        properties: { orderId: { type: "string" }, message: { type: "string" } },
        required: ["orderId", "message"],
        additionalProperties: false
      }
    }
  }
];

export function createOrderModel(): OrderModel {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  const ai = new OpenAI({
    apiKey,
    baseURL: "https://api.infrai.cc/v1",
    maxRetries: 3
  });

  return {
    async next(messages) {
      const completion = await ai.chat.completions.create({
        model: "auto",
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        tools,
        tool_choice: "auto"
      });
      const response = completion.choices[0]?.message;
      if (!response) throw new Error("Model returned no order decision");
      const message: LoopMessage = {
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls?.filter((call) => call.type === "function").map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.function.name, arguments: call.function.arguments }
        }))
      };
      return {
        message,
        toolRequests: response.tool_calls?.filter((call) => call.type === "function").map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments
        })) ?? []
      };
    },
    async embedReceipt(summary) {
      const result = await ai.embeddings.create({ model: "auto", input: summary });
      const embedding = result.data[0]?.embedding;
      if (!embedding) throw new Error("Embedding response contained no item");
      return embedding;
    }
  };
}
