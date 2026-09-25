/**
 * Library module (Nuxt layer + module entry).
 *
 * A private, talebook-style book library that mounts onto the host admin
 * project.
 *
 * While `LIBRARY_ENABLED=true` the module:
 *   - takes over the site root: the host landing page (`/`) is removed and
 *     replaced with the library shelf (mirrors the nav module);
 *   - serves its own pages under `/library/**` (provided by this layer);
 *   - registers the catalogue tables into the host dashboard CRUD
 *     (see `server/plugins/library.ts`).
 */
import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { join } from 'node:path'

export default defineNuxtModule({
  meta: {
    name: 'library',
    configKey: 'library'
  },
  setup(_options, nuxt) {
    if (process.env.LIBRARY_ENABLED !== 'true') return
    console.log('[library] module entry active — replacing the site root with the shelf')

    const resolver = createResolver(import.meta.url)
    const moduleDir = resolver.resolve('.')

    nuxt.hook('pages:extend', (pages) => {
      // Drop the host's landing page and mount the library shelf at `/`.
      for (let i = pages.length - 1; i >= 0; i--) {
        if (pages[i]?.path === '/') pages.splice(i, 1)
      }
      pages.unshift({
        name: 'library-home',
        path: '/',
        file: join(moduleDir, 'app/pages/library/index.vue')
      })
    })
  }
})
