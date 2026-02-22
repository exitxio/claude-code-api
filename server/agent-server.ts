import { createServer } from "http";
import { AgentQueue } from "./agent/queue";
import { AgentHttpHandler } from "./agent/http-handler";

process.on("unhandledRejection", (reason) => {
  console.error("[Agent] Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Agent] Uncaught exception:", err);
  process.exit(1);
});

if (process.env.NODE_ENV === "production") {
  process.chdir("/app");
}

const agentQueue = new AgentQueue();
const agentHandler = new AgentHttpHandler(agentQueue);

agentQueue.initialize().catch((err) =>
  console.error("[Agent] Init failed:", err)
);

const PORT = parseInt(process.env.PORT || "8080");
const server = createServer(async (req, res) => {
  const handled = await agentHandler.handle(req, res);
  if (!handled) {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Agent server running on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await agentQueue.shutdown();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await agentQueue.shutdown();
  server.close();
  process.exit(0);
});
