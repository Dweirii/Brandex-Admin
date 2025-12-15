import { NextRequest, NextResponse } from "next/server";
import { clerkClient, createClerkClient } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";

// Dynamic CORS headers based on origin
const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = [
    "https://brandexme.com",
    "https://www.brandexme.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ];
  

  
  const allowOrigin = origin && (allowedOrigins.includes(origin)) 
    ? origin 
    : "*";
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-user-id, Authorization",
    "Access-Control-Allow-Credentials": allowOrigin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  // #region agent log
  const logEntry = {location:'leaderboard/route.ts:33',message:'GET handler entry',data:{origin:req.headers.get("origin"),url:req.url,method:req.method},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,F'};
  await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry)}).catch(()=>{});
  // #endregion
  
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { storeId } = await context.params;
    
    // #region agent log
    const logEntry2 = {location:'leaderboard/route.ts:42',message:'storeId extracted',data:{storeId,page:req.nextUrl.searchParams.get("page"),limit:req.nextUrl.searchParams.get("limit")},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
    await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry2)}).catch(()=>{});
    // #endregion
    
    // Get pagination params from query string
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    if (!storeId) {
      return new NextResponse("Store ID is required", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Get leaderboard data - group downloads by userId and count
    // Also get the most recent email for each user as fallback
    const leaderboardData = await prismadb.downloads.groupBy({
      by: ["userId"],
      where: {
        storeId,
        userId: { not: null }, // Only include logged-in users
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      skip,
      take: limit,
    });

    // Get email addresses for users as fallback (from most recent download)
    const userIdsForEmail = leaderboardData.map(entry => entry.userId!);
    const userEmails = await prismadb.downloads.findMany({
      where: {
        storeId,
        userId: { in: userIdsForEmail },
        email: { not: null },
      },
      select: {
        userId: true,
        email: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      distinct: ["userId"],
    });

    // Create email map
    const emailMap = new Map<string, string>();
    userEmails.forEach(download => {
      if (download.userId && download.email && !emailMap.has(download.userId)) {
        emailMap.set(download.userId, download.email);
      }
    });

    // Get total count for pagination
    const totalUsers = await prismadb.downloads.groupBy({
      by: ["userId"],
      where: {
        storeId,
        userId: { not: null },
      },
      _count: {
        id: true,
      },
    });

    // Fetch user data from Clerk for each userId
    const userIds = leaderboardData.map(entry => entry.userId!);
    const userMap = new Map<string, {
      username: string | null;
      imageUrl: string | null;
      firstName: string | null;
      lastName: string | null;
    }>();

    if (userIds.length > 0) {
      try {
        // Use Store's Clerk secret key if available, otherwise fall back to Admin's
        const storeClerkSecretKey = process.env.STORE_CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY;
        const client = storeClerkSecretKey 
          ? createClerkClient({ secretKey: storeClerkSecretKey })
          : await clerkClient();
        
        console.log(`[LEADERBOARD] Using ${storeClerkSecretKey === process.env.STORE_CLERK_SECRET_KEY ? 'Store' : 'Admin'} Clerk instance`);
        
        // Test Clerk connection with first user
        let shouldFetchFromClerk = false;
        try {
          const testUser = await client.users.getUser(userIds[0]);
          console.log(`[LEADERBOARD] Clerk connection test successful. Sample user:`, {
            id: testUser.id,
            username: testUser.username || 'none',
            hasImage: !!testUser.imageUrl,
            firstName: testUser.firstName || 'none',
          });
          shouldFetchFromClerk = true;
        } catch (testErr: unknown) {
          const error = testErr as { message?: string; status?: number; statusCode?: number };
          console.warn(`[LEADERBOARD] Clerk connection test FAILED (will use fallback):`, {
            error: error?.message || String(testErr),
            status: error?.status || error?.statusCode,
            userId: userIds[0],
          });
          console.log(`[LEADERBOARD] Skipping Clerk API calls, using fallback from database`);
          shouldFetchFromClerk = false;
        }
        
        // Only fetch from Clerk if test passed
        if (shouldFetchFromClerk) {
          console.log(`[LEADERBOARD] Attempting to fetch ${userIds.length} users from Clerk`);
        
        // Fetch users in batches to avoid rate limits
        const batchSize = 10;
        for (let i = 0; i < userIds.length; i += batchSize) {
          const batch = userIds.slice(i, i + batchSize);
          console.log(`[LEADERBOARD] Fetching batch ${Math.floor(i / batchSize) + 1} (${batch.length} users)`);
          
          const userPromises = batch.map(async (userId) => {
            try {
              const user = await client.users.getUser(userId);
              const email = user.emailAddresses?.[0]?.emailAddress || null;
              const emailUsername = email ? email.split('@')[0] : null;
              
              const userData = {
                id: user.id,
                username: user.username || emailUsername || null,
                imageUrl: user.imageUrl || null,
                firstName: user.firstName || null,
                lastName: user.lastName || null,
              };
              
              // Log successful fetch for first user in batch for debugging
              if (batch.indexOf(userId) === 0) {
                console.log(`[LEADERBOARD] Sample user data:`, {
                  id: userData.id,
                  hasUsername: !!userData.username,
                  hasImage: !!userData.imageUrl,
                  hasFirstName: !!userData.firstName,
                });
              }
              
              return userData;
            } catch (err: unknown) {
              // Log error for debugging
              const error = err as { message?: string; status?: number; statusCode?: number; name?: string };
              const errorMsg = error?.message || String(err);
              const errorStatus = error?.status || error?.statusCode;
              
              // Log first error in batch to avoid spam
              if (batch.indexOf(userId) === 0) {
                console.error(`[LEADERBOARD] Error fetching user ${userId}:`, {
                  error: errorMsg,
                  status: errorStatus,
                  name: error?.name,
                });
              }
              
              return null;
            }
          });

          const batchResults = await Promise.all(userPromises);
          
          batchResults.forEach((userData) => {
            if (userData) {
              userMap.set(userData.id, {
                username: userData.username,
                imageUrl: userData.imageUrl,
                firstName: userData.firstName,
                lastName: userData.lastName,
              });
            }
          });
          
          // Small delay between batches to avoid rate limiting
          if (i + batchSize < userIds.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        // Log how many users were successfully fetched
        const fetchedCount = userMap.size;
        const failedCount = userIds.length - fetchedCount;
        console.log(`[LEADERBOARD] Successfully fetched ${fetchedCount}/${userIds.length} users from Clerk (${failedCount} failed or not found)`);
        
          if (fetchedCount === 0) {
            console.error(`[LEADERBOARD] WARNING: No users were fetched from Clerk. This could indicate:`);
            console.error(`  - Clerk API key is invalid or missing`);
            console.error(`  - User IDs in database don't match Clerk user IDs`);
            console.error(`  - All users have been deleted from Clerk`);
          }
        }
      } catch (clerkError: unknown) {
        const error = clerkError as { message?: string; status?: number; statusCode?: number; name?: string };
        console.error(`[LEADERBOARD] Fatal Clerk error:`, {
          message: error?.message || String(clerkError),
          status: error?.status || error?.statusCode,
          name: error?.name,
        });
        // Continue without user data if Clerk fails
      }
    }

    // Format the response with user data
    const leaderboard = leaderboardData.map((entry, index) => {
      const userData = userMap.get(entry.userId!);
      const fallbackEmail = emailMap.get(entry.userId!);
      const emailUsername = fallbackEmail ? fallbackEmail.split('@')[0] : null;
      
      // Create display name with priority: 
      // Clerk username > Clerk full name > Clerk first name > email username > null
      const displayName = userData?.username 
        || (userData?.firstName && userData?.lastName 
          ? `${userData.firstName} ${userData.lastName}`.trim()
          : userData?.firstName || emailUsername || null);

      return {
        rank: skip + index + 1,
        userId: entry.userId!,
        totalDownloads: entry._count.id,
        user: userData ? {
          username: userData.username || emailUsername,
          imageUrl: userData.imageUrl,
          firstName: userData.firstName,
          lastName: userData.lastName,
          displayName: displayName || userData.username || emailUsername || null,
        } : (fallbackEmail ? {
          username: emailUsername,
          imageUrl: null,
          firstName: null,
          lastName: null,
          displayName: emailUsername,
        } : null),
      };
    });

    const response = {
      data: leaderboard,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalUsers.length / limit),
        totalUsers: totalUsers.length,
        limit,
      },
    };

    // #region agent log
    const logEntry3 = {location:'leaderboard/route.ts:168',message:'GET response ready',data:{dataCount:response.data.length,totalUsers:response.pagination.totalUsers},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
    await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry3)}).catch(()=>{});
    // #endregion
    
    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    console.error("[LEADERBOARD_GET_ERROR]", error);
    
    // #region agent log
    const logEntry4 = {location:'leaderboard/route.ts:170',message:'GET handler error',data:{errorMessage:error instanceof Error ? error.message : String(error),errorStack:error instanceof Error ? error.stack : undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'};
    await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logEntry4)}).catch(()=>{});
    // #endregion
    
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Server Error",
      { status: 500, headers: corsHeaders }
    );
  }
}

// Handle preflight OPTIONS
export async function OPTIONS(req: NextRequest) {
  // #region agent log
  const logData = {location:'leaderboard/route.ts:179',message:'OPTIONS handler entry',data:{origin:req.headers.get("origin"),url:req.url,method:req.method},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'};
  await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logData)}).catch(()=>{});
  // #endregion
  
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  // #region agent log
  const logData2 = {location:'leaderboard/route.ts:186',message:'OPTIONS CORS headers',data:{origin,corsHeaders},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'};
  await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logData2)}).catch(()=>{});
  // #endregion
  
  const res = new NextResponse(null, { status: 204 });
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.headers.set(key, value);
  });
  
  // #region agent log
  const logData3 = {location:'leaderboard/route.ts:193',message:'OPTIONS response sent',data:{status:204,headers:Object.fromEntries(res.headers.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'};
  await fetch('http://127.0.0.1:7242/ingest/118951c9-c7dc-4544-86a8-013be18c57df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(logData3)}).catch(()=>{});
  // #endregion
  
  return res;
}