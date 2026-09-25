/**
 * Library module (Nuxt layer) — i18n locale files.
 *
 * The i18n block tells @nuxtjs/i18n to load this layer's locale files
 * (`./i18n/locales/*.json`) and deep-merge them with the host locales, so the
 * library tables/fields participate in the shared `dashboard.tables` /
 * `dashboard.fields` translation system and the library UI is localised.
 */
export default defineNuxtConfig({
  i18n: {
    langDir: 'locales',
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'zh', name: '中文', file: 'zh.json' },
      { code: 'zh-TW', name: '繁體中文', file: 'zh-TW.json' }
    ]
  }
})
