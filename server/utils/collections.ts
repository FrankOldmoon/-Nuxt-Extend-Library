/**
 * Library — collection (书单) helpers.
 */
import { and, eq, isNull, ne } from 'drizzle-orm'
import { db } from '../../../../server/database'
import * as lib from '../database/schema'
import { slugify } from './parse'

/**
 * Produce a slug that is unique among live collections, suffixing `-2`, `-3`…
 * until free. `excludeId` lets an update keep its own slug.
 */
export async function uniqueCollectionSlug(name: string, excludeId?: number): Promise<string> {
  const base = slugify(name)
  let candidate = base
  for (let i = 2; i < 200; i++) {
    const conditions = [eq(lib.libCollections.slug, candidate), isNull(lib.libCollections.deletedAt)]
    if (excludeId) conditions.push(ne(lib.libCollections.id, excludeId))
    const [existing] = await db
      .select({ id: lib.libCollections.id })
      .from(lib.libCollections)
      .where(and(...conditions))
      .limit(1)
    if (!existing) return candidate
    candidate = `${base}-${i}`
  }
  return `${base}-${Date.now().toString(36)}`
}
