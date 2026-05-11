import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { VisitorService } from "@/gen/ts/visitor/v1/visitor_connect";

const transport = createConnectTransport({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8080",
});

export const visitorClient = createClient(VisitorService, transport);
