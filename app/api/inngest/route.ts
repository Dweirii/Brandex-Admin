// app/api/inngest/route.ts
import { serve } from "inngest/next";
import { bulkImport } from "@/app/inngest/functions/bulkImport";
import { generateProductsFromImages } from "@/app/inngest/functions/generateProductsFromImages";
import {
  sendDailyReport,
  sendWeeklyReport,
  sendMonthlyReport,
} from "@/app/inngest/functions/scheduled-reports";

import { inngest } from "@/app/inngest/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    bulkImport,
    generateProductsFromImages,
    sendDailyReport,
    sendWeeklyReport,
    sendMonthlyReport,
  ],
  servePath: "/api/inngest",
});
