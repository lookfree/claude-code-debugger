import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { defaultNS, fallbackLng, supportedLngs } from './config'

// Import translation files
import commonEn from './locales/en/common.json'
import layoutEn from './locales/en/layout.json'
import dashboardEn from './locales/en/dashboard.json'

import commonZh from './locales/zh/common.json'
import layoutZh from './locales/zh/layout.json'
import dashboardZh from './locales/zh/dashboard.json'

export const resources = {
  en: {
    common: commonEn,
    layout: layoutEn,
    dashboard: dashboardEn,
  },
  zh: {
    common: commonZh,
    layout: layoutZh,
    dashboard: dashboardZh,
  },
} as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    fallbackLng,
    supportedLngs,

    interpolation: {
      escapeValue: false, // React already escapes
    },

    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },

    react: {
      useSuspense: false,
    },
  })

export default i18n
