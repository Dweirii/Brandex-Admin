import { jwtVerify } from "jose";

export async function verifyCustomerToken(token: string): Promise<string> {
  const JWKS_URL = process.env.CLERK_CUSTOMER_JWT_JWKS_URL!;
  const audience = process.env.CLERK_CUSTOMER_JWT_AUDIENCE!;

  const res = await fetch(JWKS_URL);
  const jwks = await res.json();

  const key = await crypto.subtle.importKey(
    "jwk",
    jwks.keys[0],
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["verify"]
  );

  const { payload } = await jwtVerify(token, key, { audience });

  return payload.sub as string; // Clerk User ID
}
