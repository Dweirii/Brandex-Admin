// app/inngest/inngest.ts
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "brandex-app",
  eventKey: process.env.INNGEST_EVENT_KEY,
  name: "Brandex Importer",
});
