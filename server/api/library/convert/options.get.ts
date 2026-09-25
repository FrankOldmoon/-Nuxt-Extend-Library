/**
 * Library — which conversions this installation can perform.
 *
 * The client uses this to build the "convert format" menu: native conversions
 * are always available, everything else appears only when a Calibre
 * `ebook-convert` binary has been detected.
 */
import { requireUser } from '../../../../../../server/utils/auth'
import { getConfigValue } from '../../../../../../server/utils/configs'
import { CONVERT_TARGETS, NATIVE_TARGETS, findCalibre } from '../../../utils/convert'

export default defineEventHandler(async (event) => {
  await requireUser(event)

  const enabled = await getConfigValue<boolean>('library.converter.enabled', true).catch(() => true)
  let calibre = false
  if (enabled) {
    const configured = await getConfigValue<string>('library.converter.path', '').catch(() => '')
    calibre = Boolean(await findCalibre(configured).catch(() => null))
  }

  return {
    targets: [...CONVERT_TARGETS],
    native: NATIVE_TARGETS,
    calibre,
    calibreEnabled: enabled
  }
})
