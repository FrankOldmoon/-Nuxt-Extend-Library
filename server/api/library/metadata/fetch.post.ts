/**
 * Library — fetch the full metadata of one provider subject (Douban book id).
 */
import { requireUser } from '../../../../../../server/utils/auth'
import { fetchDoubanSubject } from '../../../utils/douban'
import { getDoubanOptions } from '../../../utils/providers'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const body = await readBody<{ sourceId?: string | number }>(event)
  const sourceId = String(body?.sourceId ?? '').trim()
  if (!sourceId) {
    throw createError({ statusCode: 400, statusMessage: 'sourceId is required' })
  }

  const options = await getDoubanOptions()
  const metadata = await fetchDoubanSubject(sourceId, options)
  return { metadata }
})
