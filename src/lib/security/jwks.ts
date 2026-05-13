import { exportJWK, importPKCS8 } from "jose";
import { logger } from "@/lib/logger";

/**
 * JWKS Service
 * ------------
 * Manages the RSA key pair used for JWE encryption/decryption.
 * The private key is loaded from JWE_PRIVATE_KEY environment variable.
 */

let cachedJwks: { keys: Array<Record<string, unknown>> } | null = null;
let cachedPrivateKey: unknown | null = null;
let jwksPromise: Promise<{ keys: Array<Record<string, unknown>> }> | null = null;

/**
 * FOR TESTING ONLY: Resets the cached JWKS and private key.
 */
export function __resetJwksCache() {
  cachedJwks = null;
  cachedPrivateKey = null;
  jwksPromise = null;
}

const ALG = "RSA-OAEP-256";
const KID = "ghostclass-v1"; // Hardcoded for simplified rotation in this version

/**
 * Loads and returns the RSA Private Key for decryption.
 */
export async function getJwePrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;

  const pem = process.env.JWE_PRIVATE_KEY;
  if (!pem) {
    logger.error("JWE: Missing JWE_PRIVATE_KEY environment variable.");
    throw new Error("Server misconfiguration: JWE keys not found.");
  }

  try {
    // Handle both raw PEM and \n escaped PEM from .env
    const formattedPem = pem.replace(/\\n/g, "\n");
    cachedPrivateKey = await importPKCS8(formattedPem, ALG);
    return cachedPrivateKey;
  } catch (error) {
    logger.error("JWE: Failed to import private key:", error);
    throw new Error("Server misconfiguration: Invalid JWE private key.");
  }
}

/**
 * Returns the Public Key(s) in JWKS format for clients to fetch.
 */
export async function getJwks() {
  if (cachedJwks) return cachedJwks;
  if (jwksPromise) return jwksPromise;

  jwksPromise = (async () => {
    const pem = process.env.JWE_PRIVATE_KEY;
    if (!pem) {
      throw new Error("JWE: Missing JWE_PRIVATE_KEY.");
    }

    try {
      const formattedPem = pem.replace(/\\n/g, "\n");

      // Import as extractable
      const privateKey = await importPKCS8(formattedPem, ALG, {
        extractable: true,
      });

      // Export the full JWK
      const fullJwk = await exportJWK(privateKey);

      // SECURITY: Manually map ONLY the public components (n, e)
      // COMPATIBILITY: Include both 'wrapKey' and 'encrypt' for Flutter
      cachedJwks = {
        keys: [
          {
            kty: fullJwk.kty,
            n: fullJwk.n,
            e: fullJwk.e,
            kid: KID,
            alg: ALG,
            use: "enc",
            key_ops: ["wrapKey", "encrypt"],
          },
        ],
      };

      return cachedJwks;
    } catch (error) {
      logger.error("JWE: Failed to generate JWKS:", error);
      jwksPromise = null; // Allow retry
      throw new Error("Internal Server Error: JWKS generation failed.");
    }
  })();

  return jwksPromise;
}
