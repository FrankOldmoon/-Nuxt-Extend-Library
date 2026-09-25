/**
 * Library module — metadata provider configuration.
 *
 * All provider settings live in the shared `configs` table (declared by the
 * boot plugin) so an admin can toggle/point them from System Config:
 *   library.douban.enabled    enable the Douban provider (default true)
 *   library.douban.baseUrl    provider origin (default https://book.douban.com)
 *   library.douban.cookie     optional Cookie header (helps with rate limits)
 *   library.douban.timeoutMs  per-request timeout (default 8000)
 */
import { createError } from 'h3'
import { getConfigValue } from '../../../../server/utils/configs'
import type { DoubanOptions } from './douban'

export const DEFAULT_DOUBAN_BASE_URL = 'https://book.douban.com'
const DEFAULT_TIMEOUT_MS = 8000

/** Resolve the Douban provider options, throwing when the provider is disabled. */
export async function getDoubanOptions(): Promise<DoubanOptions> {
  const enabled = await getConfigValue<boolean>('library.douban.enabled', true).catch(() => true)
  if (!enabled) {
    throw createError({ statusCode: 403, statusMessage: 'The Douban metadata provider is disabled' })
  }
  const baseUrl = (await getConfigValue<string>('library.douban.baseUrl', DEFAULT_DOUBAN_BASE_URL).catch(() => '')) || DEFAULT_DOUBAN_BASE_URL
  const cookie = await getConfigValue<string>('library.douban.cookie', '').catch(() => '')
  const timeoutMs = await getConfigValue<number>('library.douban.timeoutMs', DEFAULT_TIMEOUT_MS).catch(() => DEFAULT_TIMEOUT_MS)
  return { baseUrl, cookie, timeoutMs }
}
