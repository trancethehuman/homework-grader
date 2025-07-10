import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, generateObject, UIMessage } from "ai";
import { GRADING_CATEGORIES } from "./schemas.js";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = generateObject({
    model: openai("gpt-4o-mini"),
    messages: convertToModelMessages(messages),
    schema: GRADING_CATEGORIES,
  });

  return result;
}
