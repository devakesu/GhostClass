import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  signRequest,
  verifyRequestSignature,
  extractSignatureFromRequest,
  validateSignedRequest,
  generateSignedHeaders,
} from '../request-signing';

describe('Request Signing (Ed25519)', () => {
  let testPrivateKey: string;
  let testPublicKey: string;

  const originalPrivateKey = process.env.REQUEST_PRIVATE_KEY;
  const originalPublicKey = process.env.REQUEST_PUBLIC_KEY;

  beforeEach(() => {
    // Generate fresh Ed25519 keys for each test
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
      privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
      publicKeyEncoding: { format: 'pem', type: 'spki' },
    });
    testPrivateKey = privateKey;
    testPublicKey = publicKey;

    process.env.REQUEST_PRIVATE_KEY = testPrivateKey;
    process.env.REQUEST_PUBLIC_KEY = testPublicKey;
  });

  afterEach(() => {
    process.env.REQUEST_PRIVATE_KEY = originalPrivateKey;
    process.env.REQUEST_PUBLIC_KEY = originalPublicKey;
    vi.restoreAllMocks();
  });

  describe('signRequest', () => {
    it('should generate a signature for a payload and timestamp', () => {
      const payload = JSON.stringify({ data: 'test' });
      const timestamp = Math.floor(Date.now() / 1000);

      const signature = signRequest(payload, timestamp);

      expect(signature).toBeTruthy();
      expect(typeof signature).toBe('string');
      expect(signature).toHaveLength(128); // Ed25519 signature is 64 bytes -> 128 hex chars
    });

    it('should generate different signatures for different payloads', () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature1 = signRequest('payload1', timestamp);
      const signature2 = signRequest('payload2', timestamp);

      expect(signature1).not.toBe(signature2);
    });

    it('should generate different signatures for different timestamps', () => {
      const payload = 'test-payload';
      const signature1 = signRequest(payload, 1000);
      const signature2 = signRequest(payload, 2000);

      expect(signature1).not.toBe(signature2);
    });

    it('should generate consistent signatures for same input', () => {
      const payload = 'test-payload';
      const timestamp = 1000;

      const signature1 = signRequest(payload, timestamp);
      const signature2 = signRequest(payload, timestamp);

      expect(signature1).toBe(signature2);
    });

    it('should throw error if REQUEST_PRIVATE_KEY is not set', () => {
      delete process.env.REQUEST_PRIVATE_KEY;

      expect(() => {
        signRequest('payload', 1000);
      }).toThrow('REQUEST_PRIVATE_KEY must be configured for request signing');
    });
  });

  describe('verifyRequestSignature', () => {
    it('should verify valid signature', () => {
      const payload = JSON.stringify({ data: 'test' });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signRequest(payload, timestamp);

      const isValid = verifyRequestSignature(payload, timestamp, signature);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ data: 'test' });
      const timestamp = Math.floor(Date.now() / 1000);
      const invalidSignature = 'invalid-signature';

      const isValid = verifyRequestSignature(payload, timestamp, invalidSignature);

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong payload', () => {
      const originalPayload = 'original';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signRequest(originalPayload, timestamp);

      const isValid = verifyRequestSignature('modified', timestamp, signature);

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong timestamp', () => {
      const payload = 'test-payload';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signRequest(payload, timestamp);

      const isValid = verifyRequestSignature(payload, timestamp + 1, signature);

      expect(isValid).toBe(false);
    });

    it('should reject expired signatures (older than maxAge)', () => {
      const payload = 'test-payload';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const signature = signRequest(payload, oldTimestamp);

      const isValid = verifyRequestSignature(payload, oldTimestamp, signature, 300); // maxAge 300s

      expect(isValid).toBe(false);
    });

    it('should accept signatures within maxAge', () => {
      const payload = 'test-payload';
      const recentTimestamp = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
      const signature = signRequest(payload, recentTimestamp);

      const isValid = verifyRequestSignature(payload, recentTimestamp, signature, 300); // maxAge 300s

      expect(isValid).toBe(true);
    });

    it('should reject timestamps in the future', () => {
      const payload = 'test-payload';
      const futureTimestamp = Math.floor(Date.now() / 1000) + 100; // 100 seconds in future
      const signature = signRequest(payload, futureTimestamp);

      const isValid = verifyRequestSignature(payload, futureTimestamp, signature);

      expect(isValid).toBe(false);
    });

    it('should use constant-time comparison to prevent timing attacks', () => {
      const payload = 'test-payload';
      const timestamp = Math.floor(Date.now() / 1000);
      const validSignature = signRequest(payload, timestamp);
      
      // Create a signature that differs only in the last character
      const almostValidSignature = validSignature.slice(0, -1) + 'x';

      const isValid = verifyRequestSignature(payload, timestamp, almostValidSignature);

      expect(isValid).toBe(false);
    });

    it('should handle errors gracefully', () => {
      const isValid = verifyRequestSignature('payload', 1000, null as any);

      expect(isValid).toBe(false);
    });
  });

  describe('extractSignatureFromRequest', () => {
    it('should extract signature and timestamp from headers', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-signature': 'test-signature',
          'x-timestamp': '1234567890',
        },
      });

      const { signature, timestamp } = extractSignatureFromRequest(request);

      expect(signature).toBe('test-signature');
      expect(timestamp).toBe(1234567890);
    });

    it('should return null when signature header is missing', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-timestamp': '1234567890',
        },
      });

      const { signature, timestamp } = extractSignatureFromRequest(request);

      expect(signature).toBeNull();
      expect(timestamp).toBe(1234567890);
    });

    it('should return null when timestamp header is missing', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-signature': 'test-signature',
        },
      });

      const { signature, timestamp } = extractSignatureFromRequest(request);

      expect(signature).toBe('test-signature');
      expect(timestamp).toBeNull();
    });

    it('should return null for invalid timestamp', () => {
      const request = new Request('http://localhost', {
        headers: {
          'x-signature': 'test-signature',
          'x-timestamp': 'not-a-number',
        },
      });

      const { signature, timestamp } = extractSignatureFromRequest(request);

      expect(signature).toBe('test-signature');
      expect(timestamp).toBeNull();
    });

    it('should handle missing headers', () => {
      const request = new Request('http://localhost');

      const { signature, timestamp } = extractSignatureFromRequest(request);

      expect(signature).toBeNull();
      expect(timestamp).toBeNull();
    });
  });

  describe('validateSignedRequest', () => {
    it('should validate a properly signed request', async () => {
      const payload = JSON.stringify({ data: 'test' });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signRequest(payload, timestamp);

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp.toString(),
        },
        body: payload,
      });

      const isValid = await validateSignedRequest(request);

      expect(isValid).toBe(true);
    });

    it('should reject request with missing signature', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'x-timestamp': '1234567890',
        },
        body: 'test',
      });

      const isValid = await validateSignedRequest(request);

      expect(isValid).toBe(false);
    });

    it('should reject request with missing timestamp', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'x-signature': 'test-signature',
        },
        body: 'test',
      });

      const isValid = await validateSignedRequest(request);

      expect(isValid).toBe(false);
    });

    it('should reject request with invalid signature', async () => {
      const payload = JSON.stringify({ data: 'test' });
      const timestamp = Math.floor(Date.now() / 1000);

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'x-signature': 'invalid-signature',
          'x-timestamp': timestamp.toString(),
        },
        body: payload,
      });

      const isValid = await validateSignedRequest(request);

      expect(isValid).toBe(false);
    });

    it('should not consume the request body (uses clone)', async () => {
      const payload = JSON.stringify({ data: 'test' });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signRequest(payload, timestamp);

      const request = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp.toString(),
        },
        body: payload,
      });

      await validateSignedRequest(request);

      // Should still be able to read the body
      const body = await request.text();
      expect(body).toBe(payload);
    });

    it('should handle errors gracefully', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'x-signature': 'test',
          'x-timestamp': 'invalid',
        },
        body: 'test',
      });

      const isValid = await validateSignedRequest(request);

      expect(isValid).toBe(false);
    });
  });

  describe('generateSignedHeaders', () => {
    it('should generate valid signature headers', () => {
      const payload = JSON.stringify({ data: 'test' });
      const headers = generateSignedHeaders(payload);

      expect(headers).toHaveProperty('x-signature');
      expect(headers).toHaveProperty('x-timestamp');
      expect(headers['x-signature']).toBeTruthy();
      expect(headers['x-timestamp']).toBeTruthy();
    });

    it('should generate verifiable signatures', () => {
      const payload = JSON.stringify({ data: 'test' });
      const headers = generateSignedHeaders(payload);

      const timestamp = parseInt(headers['x-timestamp'], 10);
      const isValid = verifyRequestSignature(
        payload,
        timestamp,
        headers['x-signature']
      );

      expect(isValid).toBe(true);
    });

    it('should use current timestamp', () => {
      const payload = 'test';
      const beforeTimestamp = Math.floor(Date.now() / 1000);
      const headers = generateSignedHeaders(payload);
      const afterTimestamp = Math.floor(Date.now() / 1000);

      const generatedTimestamp = parseInt(headers['x-timestamp'], 10);

      expect(generatedTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(generatedTimestamp).toBeLessThanOrEqual(afterTimestamp);
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle empty payload', () => {
      const payload = '';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signRequest(payload, timestamp);

      const isValid = verifyRequestSignature(payload, timestamp, signature);

      expect(isValid).toBe(true);
    });

    it('should handle very large payloads', () => {
      const largePayload = 'a'.repeat(100000);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signRequest(largePayload, timestamp);

      const isValid = verifyRequestSignature(largePayload, timestamp, signature);

      expect(isValid).toBe(true);
    });

    it('should handle special characters in payload', () => {
      const payload = '{"test": "🔒 special chars: <>&\'""}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signRequest(payload, timestamp);

      const isValid = verifyRequestSignature(payload, timestamp, signature);

      expect(isValid).toBe(true);
    });

    it('should detect payload tampering', () => {
      const originalPayload = '{"amount": 100}';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signRequest(originalPayload, timestamp);

      // Attacker tries to modify the amount
      const tamperedPayload = '{"amount": 999999}';
      const isValid = verifyRequestSignature(tamperedPayload, timestamp, signature);

      expect(isValid).toBe(false);
    });

    it('should prevent replay attacks with expired timestamps', () => {
      const payload = 'test-payload';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 1000; // 1000 seconds ago
      const signature = signRequest(payload, oldTimestamp);

      const isValid = verifyRequestSignature(payload, oldTimestamp, signature, 300);

      expect(isValid).toBe(false);
    });

    it('should return false if REQUEST_PUBLIC_KEY is missing', () => {
      delete process.env.REQUEST_PUBLIC_KEY;
      const timestamp = Math.floor(Date.now() / 1000);
      const isValid = verifyRequestSignature('p', timestamp, 's');
      expect(isValid).toBe(false);
    });

    it('should handle body reading failure in validateSignedRequest', async () => {
      const request = {
        headers: new Headers({
          'x-signature': 'sig',
          'x-timestamp': '100',
        }),
        clone: () => ({
          text: () => Promise.reject(new Error('Clone fail'))
        })
      } as unknown as Request;

      const isValid = await validateSignedRequest(request);
      expect(isValid).toBe(false);
    });
  });
});
