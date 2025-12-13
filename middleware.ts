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
  "/api/:storeId/leaderboard(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // #region agent log
  const logEntry = {location:'middleware.ts:21',message:'middleware entry',data:{url:req.url,method:req.method,pathname:req.nextUrl.pathname,isPublic:isPublicRoute(req)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'};
  await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry)}).catch(()=>{});
  // #endregion
  
  // Handle OPTIONS requests for CORS preflight - allow them through
  if (req.method === "OPTIONS") {
    // #region agent log
    const logEntry2 = {location:'middleware.ts:25',message:'OPTIONS request in middleware',data:{origin:req.headers.get("origin"),url:req.url},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'};
    await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry2)}).catch(()=>{});
    // #endregion
    
    const origin = req.headers.get("origin");
    const allowedOrigins = [
      "https://brandexme.com",
      "https://www.brandexme.com",
      "http://localhost:3000",
      "http://localhost:3001",
    ];
    
    // Allow any localhost port in development
    const isLocalhost = origin && (
      origin.startsWith("http://localhost:") || 
      origin.startsWith("http://127.0.0.1:")
    );
    
    const allowOrigin = origin && (allowedOrigins.includes(origin) || isLocalhost) 
      ? origin 
      : "*";
    
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
    // #region agent log
    const logEntry3 = {location:'middleware.ts:48',message:'route not public, calling auth.protect',data:{url:req.url,pathname:req.nextUrl.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'};
    await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry3)}).catch(()=>{});
    // #endregion
    await auth.protect();
  } else {
    // #region agent log
    const logEntry4 = {location:'middleware.ts:52',message:'route is public, allowing through',data:{url:req.url,pathname:req.nextUrl.pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'};
    await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry4)}).catch(()=>{});
    // #endregion
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
