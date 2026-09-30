/**
 * Library module (Nuxt layer + module entry).
 *
 * A private, talebook-style book library that mounts onto the host admin
 * project.
 *
 * While `LIBRARY_ENABLED=true` the module:
 *   - owns the site root: the shelf is the homepage at `/` — the host landing
 *     page is removed;
 *   - serves its pages at the site root (`/book/:id`, `/read/:id`,
 *     `/mindmap/:id`, …) with no `/library` path prefix;
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
      // Both the host and this layer may define a page at `/`, and Nuxt's
      // layer conflict resolution is not deterministic in our favour — so
      // drop EVERY page mounted at `/` and mount the shelf explicitly.
      for (let i = pages.length - 1; i >= 0; i--) {
        if (pages[i]?.path === '/') pages.splice(i, 1)
      }
      pages.unshift({
        name: 'library-home',
        path: '/',
        file: join(moduleDir, 'app/pages/index.vue')
      })
    })
  }
})
