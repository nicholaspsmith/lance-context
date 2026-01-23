import { describe, it, expect } from 'vitest';
import { isStringArray, isString, isNumber, isBoolean } from '../../utils/type-guards.js';

describe('type-guards', () => {
  describe('isStringArray', () => {
    it('should return true for empty array', () => {
      expect(isStringArray([])).toBe(true);
    });

    it('should return true for array of strings', () => {
      expect(isStringArray(['a', 'b', 'c'])).toBe(true);
    });

    it('should return false for array with non-strings', () => {
      expect(isStringArray(['a', 1, 'c'])).toBe(false);
    });

    it('should return false for non-array values', () => {
      expect(isStringArray('not an array')).toBe(false);
      expect(isStringArray(123)).toBe(false);
      expect(isStringArray(null)).toBe(false);
      expect(isStringArray(undefined)).toBe(false);
      expect(isStringArray({ length: 0 })).toBe(false);
    });

    it('should return false for array of numbers', () => {
      expect(isStringArray([1, 2, 3])).toBe(false);
    });

    it('should return false for mixed array', () => {
      expect(isStringArray([true, 'string', null])).toBe(false);
    });
  });

  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('hello')).toBe(true);
      expect(isString('123')).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString([])).toBe(false);
      expect(isString({})).toBe(false);
      expect(isString(true)).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(123)).toBe(true);
      expect(isNumber(-45.67)).toBe(true);
      expect(isNumber(Infinity)).toBe(true);
      expect(isNumber(-Infinity)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isNumber(NaN)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isNumber('123')).toBe(false);
      expect(isNumber(null)).toBe(false);
      expect(isNumber(undefined)).toBe(false);
      expect(isNumber([])).toBe(false);
      expect(isNumber({})).toBe(false);
      expect(isNumber(true)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('should return true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it('should return false for non-booleans', () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('')).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
      expect(isBoolean(undefined)).toBe(false);
      expect(isBoolean([])).toBe(false);
      expect(isBoolean({})).toBe(false);
    });
  });
});
