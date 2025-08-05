import { query, type SDKMessage } from "@anthropic-ai/claude-code";

(async function () {
  const messages: SDKMessage[] = [];

  for await (const message of query({
    prompt: "Write a haiku about foo.py",
    options: {
      maxTurns: 3,
    },
  })) {
    messages.push(message);
  }

  console.log(messages);
})();
