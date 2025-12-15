// app/api/inngest/route.ts

import { Inngest } from "inngest";
import { serve } from "inngest/next";
import { bulkImport } from "@/app/inngest/functions/bulkImport";
import { generateProductsFromImages } from "@/app/inngest/functions/generateProductsFromImages";
import {
  sendDailyReport,
  sendWeeklyReport,
  sendMonthlyReport,
} from "@/app/inngest/functions/scheduled-reports";

const inngest = new Inngest({ id: "brandex-app" });

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    bulkImport,
    generateProductsFromImages,
    sendDailyReport,
    sendWeeklyReport,
    sendMonthlyReport,
  ],
});
