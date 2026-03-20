const DEFAULT_GHL_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

const DEFAULT_GHL_LEGACY_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

const encoder = new TextEncoder();

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let ghlKeyPromise: Promise<CryptoKey> | null = null;
let legacyKeyPromise: Promise<CryptoKey> | null = null;

function getGhlKey(): Promise<CryptoKey> {
  if (!ghlKeyPromise) {
    const pem = Deno.env.get("GHL_WEBHOOK_PUBLIC_KEY") || DEFAULT_GHL_PUBLIC_KEY;
    ghlKeyPromise = crypto.subtle.importKey(
      "spki",
      pemToArrayBuffer(pem),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  }
  return ghlKeyPromise;
}

function getLegacyKey(): Promise<CryptoKey> {
  if (!legacyKeyPromise) {
    const pem = Deno.env.get("GHL_WEBHOOK_LEGACY_PUBLIC_KEY") || DEFAULT_GHL_LEGACY_PUBLIC_KEY;
    legacyKeyPromise = crypto.subtle.importKey(
      "spki",
      pemToArrayBuffer(pem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }
  return legacyKeyPromise;
}

export async function verifyGhlWebhookSignature(
  rawBody: string,
  signature: string | null,
  legacySignature?: string | null,
): Promise<boolean> {
  const payload = encoder.encode(rawBody);

  if (signature && signature !== "N/A") {
    try {
      return await crypto.subtle.verify(
        "Ed25519",
        await getGhlKey(),
        base64ToUint8Array(signature),
        payload,
      );
    } catch (_error) {
      return false;
    }
  }

  if (legacySignature && legacySignature !== "N/A") {
    try {
      return await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        await getLegacyKey(),
        base64ToUint8Array(legacySignature),
        payload,
      );
    } catch (_error) {
      return false;
    }
  }

  return false;
}
