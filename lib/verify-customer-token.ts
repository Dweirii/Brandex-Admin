// /lib/verify-customer-token.ts
import { createRemoteJWKSet, jwtVerify } from "jose";

// Clerk Production
const JWKS = createRemoteJWKSet(
  new URL("https://brandex.clerk.accounts.dev/.well-known/jwks.json")
);

export async function verifyCustomerToken(token: string): Promise<string> {
  const audience = "brandex:checkout"; // أو حسب template تبعك
  const issuer = "https://brandex.clerk.accounts.dev";

  const { payload } = await jwtVerify(token, JWKS, {
    audience,
    issuer,
  });

  if (!payload.sub) throw new Error("Missing sub");
  return payload.sub;
}
