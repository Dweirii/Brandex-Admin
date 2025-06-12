// app/inngest/inngest.ts
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "brandex-app",
  eventKey: "bulk.import",
  name: "Brandex Importer",
});
