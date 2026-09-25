/**
 * Library — search an external metadata provider (Douban).
 *
 * Authenticated only: the search hits a third-party service on the server's
 * behalf, so it must never be an open proxy for anonymous visitors.
 */
import { requireUser } from '../../../../../../server/utils/auth'
import { searchDouban } from '../../../utils/douban'
import { getDoubanOptions } from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const body = await readBody<{ q?: string, isbn?: string }>(event)
  const query = String(body?.isbn ?? body?.q ?? '').trim()
  if (!query) {
    throw createError({ statusCode: 400, statusMessage: 'A title or an ISBN is required' })
  }

  const options = await getDoubanOptions()
  const items = await searchDouban(query, options)
  return { provider: 'douban', query, items }
})
