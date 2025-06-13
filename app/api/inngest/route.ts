// app/api/inngest/route.ts

import { Inngest } from "inngest";
import { serve } from "inngest/next";
import { bulkImport } from "@/app/inngest/functions/bulkImport";

const inngest = new Inngest({ id: "brandex-app" });

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [bulkImport],
});
