import { describe, expect, it } from 'vitest';
import {
  generateRunSignature,
  sanitizePlayerName,
  validateSubmission,
} from '../../src/gameplay/leaderboard/LeaderboardValidation';

describe('LeaderboardValidation', () => {
  describe('sanitizePlayerName', () => {
    it('returns default name for empty or non-string inputs', () => {
      expect(sanitizePlayerName('')).toBe('Runner');
      expect(sanitizePlayerName(null)).toBe('Runner');
      expect(sanitizePlayerName(undefined)).toBe('Runner');
      expect(sanitizePlayerName('   ')).toBe('Runner');
    });

    it('strips HTML tags and script elements', () => {
      expect(sanitizePlayerName('<script>alert("hack")</script>Veera')).toBe('alerthackVeera');
      expect(sanitizePlayerName('<b>Player</b>')).toBe('Player');
    });

    it('supports Tamil Unicode characters', () => {
      expect(sanitizePlayerName('வீரமணி')).toBe('வீரமணி');
      expect(sanitizePlayerName('கார்த்திக் 07')).toBe('கார்த்திக் 07');
    });

    it('clamps name length to 15 characters', () => {
      const longName = 'SuperSpeedRiderVeeramani2026';
      const sanitized = sanitizePlayerName(longName);
      expect(sanitized.length).toBeLessThanOrEqual(15);
      expect(sanitized).toBe('SuperSpeedRider');
    });

    it('replaces offensive words', () => {
      expect(sanitizePlayerName('admin')).toBe('Runner');
      expect(sanitizePlayerName('bad_asshole_boy')).toBe('Runner');
    });
  });

  describe('validateSubmission', () => {
    it('accepts legitimate run submissions', () => {
      const valid = validateSubmission({
        deviceId: 'dev-1234',
        name: 'VeeraRunner',
        score: 1500,
        distance: 1000,
        tokens: 50,
        runTimeSeconds: 60,
      });

      expect(valid.valid).toBe(true);
      expect(valid.sanitizedName).toBe('VeeraRunner');
    });

    it('rejects submissions with negative values', () => {
      const result = validateSubmission({
        deviceId: 'dev-1234',
        name: 'VeeraRunner',
        score: -100,
        distance: 100,
        tokens: 10,
        runTimeSeconds: 20,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Negative');
    });

    it('rejects submissions with impossible average speeds', () => {
      const result = validateSubmission({
        deviceId: 'dev-1234',
        name: 'Teleporter',
        score: 10000,
        distance: 5000, // 5000m in 10s = 500 m/s!
        tokens: 100,
        runTimeSeconds: 10,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Average speed');
    });

    it('rejects submissions with impossible scores', () => {
      // 100m distance + 0 tokens cannot yield 90,000 score
      const result = validateSubmission({
        deviceId: 'dev-1234',
        name: 'Cheater',
        score: 90000,
        distance: 100,
        tokens: 0,
        runTimeSeconds: 10,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds theoretical maximum');
    });
  });

  describe('generateRunSignature', () => {
    it('generates consistent 8-character hex signature', () => {
      const sub = {
        deviceId: 'device-abc',
        name: 'Test',
        score: 1200,
        distance: 800,
        tokens: 40,
        runTimeSeconds: 50,
      };
      const sig1 = generateRunSignature(sub);
      const sig2 = generateRunSignature(sub);

      expect(sig1).toBe(sig2);
      expect(sig1).toHaveLength(8);
      expect(/^[0-9a-f]{8}$/.test(sig1)).toBe(true);
    });

    it('alters signature if score or distance changes', () => {
      const sub1 = {
        deviceId: 'device-abc',
        name: 'Test',
        score: 1200,
        distance: 800,
        tokens: 40,
        runTimeSeconds: 50,
      };
      const sub2 = { ...sub1, score: 1201 };
      expect(generateRunSignature(sub1)).not.toBe(generateRunSignature(sub2));
    });
  });
});
