import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/api/test-email",
  "/api/webhook",
  "/api/paypal/webhook",
  "/api/test-report",
  "/api/test-report-today",
  "/api/inngest(.*)",
  "/api/:storeId/categories(.*)",
  "/api/:storeId/products(.*)",
  "/api/:storeId/billboards(.*)",
  "/api/:storeId/checkout(.*)",
  "/api/:storeId/paypal/checkout(.*)",
  "/api/:storeId/order(.*)",
  "/api/:storeId/subscription(.*)",
  "/api/:storeId/downloads(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Handle OPTIONS requests for CORS preflight - allow them through
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    const allowedOrigins = [
      "https://brandexme.com",
      "https://www.brandexme.com",
      "http://localhost:3000",
      "http://localhost:3001",
    ];
    
    const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : "*";
    
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
        "Access-Control-Allow-Credentials": allowOrigin !== "*" ? "true" : "false",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Allow public routes for API
    '/api/:path*',
  ],
};
