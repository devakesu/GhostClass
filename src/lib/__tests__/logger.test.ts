/**
 * Tests for logger utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from '@/lib/logger'

describe('logger', () => {
  let consoleLogSpy: any
  let consoleInfoSpy: any
  let consoleWarnSpy: any
  let consoleErrorSpy: any

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleInfoSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('info', () => {
    it('should log info messages via console.info', () => {
      logger.info('test info message')
      expect(consoleInfoSpy).toHaveBeenCalledWith('test info message')
    })

    it('should handle multiple arguments', () => {
      logger.info('info:', { data: 'test' })
      expect(consoleInfoSpy).toHaveBeenCalledWith('info:', { data: 'test' })
    })
  })

  describe('warn', () => {
    it('should suppress warnings in test environment (VITEST=true)', () => {
      // In test mode (detected via process.env.VITEST), warn is suppressed to avoid noisy CI output
      logger.warn('test warning')
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })
  })

  describe('error', () => {
    it('should suppress errors in test environment (VITEST=true)', () => {
      // In test mode (detected via process.env.VITEST), error is suppressed to avoid noisy CI output
      logger.error('test error')
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })
  })
})
