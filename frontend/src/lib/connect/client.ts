import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { VisitorService } from "@/gen/ts/visitor/v1/visitor_pb";
import { BoothService } from "@/gen/ts/booth/v1/booth_pb";
import { TicketService } from "@/gen/ts/ticket/v1/ticket_pb";
import { AdminService, StaffService } from "@/gen/ts/admin/v1/admin_pb";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

const transport = createConnectTransport({ baseUrl });

const staffTransport = createConnectTransport({
  baseUrl,
  fetch: (input, init) =>
    fetch(input, { ...init, credentials: "include" }),
});

export const visitorClient = createClient(VisitorService, transport);
export const boothClient = createClient(BoothService, transport);
export const ticketClient = createClient(TicketService, transport);
export const staffClient = createClient(StaffService, staffTransport);
export const adminClient = createClient(AdminService, staffTransport);
