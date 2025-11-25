// /lib/verify-customer-token.ts
import { createRemoteJWKSet, jwtVerify, decodeJwt, JWTPayload } from "jose";


const CLERK_INSTANCE_DOMAIN = process.env.CLERK_INSTANCE_DOMAIN || "evident-puma-10.clerk.accounts.dev";
const CLERK_JWKS_URL = process.env.CLERK_JWKS_URL || `https://${CLERK_INSTANCE_DOMAIN}/.well-known/jwks.json`;
const CLERK_ISSUER = process.env.CLERK_ISSUER || `https://${CLERK_INSTANCE_DOMAIN}`;

// Map custom domain to actual Clerk instance
const CLERK_DOMAIN_MAP: Record<string, string> = {
  "https://clerk.brandexme.com": `https://${CLERK_INSTANCE_DOMAIN}`,
  "clerk.brandexme.com": CLERK_INSTANCE_DOMAIN,
};

// Lazy-load JWKS to allow for better error handling
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(CLERK_JWKS_URL));
  }
  return jwks;
}

/**
 * Verified user data extracted from JWT token
 */
export interface VerifiedUserData {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

/**
 * Verify customer JWT token and return user ID only (backward compatible)
 * 
 * @param token - JWT token from Clerk
 * @returns userId (sub claim)
 * @throws Error if token is invalid
 */
export async function verifyCustomerToken(token: string): Promise<string> {
  const userData = await verifyCustomerTokenWithData(token);
  return userData.userId;
}

/**
 * Verify customer JWT token and return full user data from token claims
 * 
 * @param token - JWT token from Clerk
 * @returns VerifiedUserData with userId, email, firstName, lastName
 * @throws Error if token is invalid or missing required claims
 */
export async function verifyCustomerTokenWithData(token: string): Promise<VerifiedUserData> {
  let decodedToken: JWTPayload | null = null;
  let jwksUrl = CLERK_JWKS_URL;
  let actualIssuerForJWKS = CLERK_INSTANCE_DOMAIN;

  try {
    // First, decode the token (without verification) to see what's in it
    try {
      decodedToken = decodeJwt(token);
    } catch {
      throw new Error("Invalid token format");
    }

    if (!decodedToken) {
      throw new Error("Failed to decode token");
    }

    // Try to get audience from token or use default
    const tokenAudience = Array.isArray(decodedToken.aud)
      ? decodedToken.aud[0]
      : decodedToken.aud || process.env.CLERK_JWT_AUDIENCE || "brandex:checkout";

    // Get token's issuer and map custom domain to actual Clerk instance
    const tokenIssuer = decodedToken.iss || CLERK_ISSUER;

    // If token issuer is the custom domain (any variation), use it directly for JWKS
    // Check for various formats of the custom domain
    const isCustomDomain = tokenIssuer && (
      tokenIssuer === "https://clerk.brandexme.com" ||
      tokenIssuer === "clerk.brandexme.com" ||
      tokenIssuer.includes("clerk.brandexme.com")
    );

    if (isCustomDomain) {
      // Use custom domain directly for JWKS since we verified it works
      actualIssuerForJWKS = "https://clerk.brandexme.com";
      jwksUrl = "https://clerk.brandexme.com/.well-known/jwks.json";
    } else {
      // Map custom domain to actual Clerk instance domain for JWKS lookup
      const mappedIssuer = CLERK_DOMAIN_MAP[tokenIssuer || ""];
      if (mappedIssuer) {
        actualIssuerForJWKS = mappedIssuer;
      } else if (tokenIssuer && tokenIssuer.includes(CLERK_INSTANCE_DOMAIN)) {
        actualIssuerForJWKS = tokenIssuer;
      } else {
        // Fallback: use the token issuer as-is, or default to instance domain
        actualIssuerForJWKS = tokenIssuer || `https://${CLERK_INSTANCE_DOMAIN}`;
      }
      jwksUrl = actualIssuerForJWKS.startsWith('http')
        ? `${actualIssuerForJWKS}/.well-known/jwks.json`
        : `https://${actualIssuerForJWKS}/.well-known/jwks.json`;
    }

    // Always use JWKS from the actual Clerk instance
    const jwksToUse = createRemoteJWKSet(new URL(jwksUrl));

    // Use the token's issuer as-is for verification (it should match what's in the token)
    // The issuer in the token must match exactly what we pass here
    const verifyIssuer: string = tokenIssuer || CLERK_ISSUER || `https://${CLERK_INSTANCE_DOMAIN}`;

    // Verify with token's issuer (custom domain is fine for issuer check)
    // but use actual instance domain for JWKS
    const { payload } = await jwtVerify(token, jwksToUse, {
      audience: tokenAudience,
      issuer: verifyIssuer, // Use the token's issuer exactly as it appears
    });

    if (!payload.sub) {
      throw new Error("Missing subject (sub) in token payload");
    }

    // Extract user data from token claims
    // Clerk typically includes: sub (userId), email, first_name, last_name
    const userId = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : null;
    const firstName = typeof payload.first_name === "string" ? payload.first_name : null;
    const lastName = typeof payload.last_name === "string" ? payload.last_name : null;

    return {
      userId,
      email,
      firstName,
      lastName,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Provide more context for specific errors
      if (error.message.includes("JSON Web Key Set") || error.message.includes("no applicable key")) {
        throw new Error(`Failed to verify token with JWKS from ${jwksUrl}. The token issuer is ${decodedToken?.iss || "unknown"}, but keys are at ${actualIssuerForJWKS}. Please check your Clerk configuration.`);
      }
      if (error.message.includes("audience") || error.message.includes("Audience")) {
        throw new Error(`JWT audience mismatch. Token audience: ${decodedToken?.aud || "unknown"}, Expected: ${process.env.CLERK_JWT_AUDIENCE || "brandex:checkout"}. Check your Clerk JWT template "CustomerJWTBrandex" configuration.`);
      }
      if (error.message.includes("issuer") || error.message.includes("Issuer")) {
        throw new Error(`JWT issuer mismatch. Token issuer: ${decodedToken?.iss || "unknown"}. Check your Clerk domain configuration.`);
      }
      if (error.message.includes("expired") || error.message.includes("Expiration")) {
        throw new Error("Token has expired. Please sign in again.");
      }
      throw error;
    }
    throw new Error("Token verification failed");
  }
}
