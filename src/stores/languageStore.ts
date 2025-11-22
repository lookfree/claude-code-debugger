import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '../i18n'
import type { SupportedLanguage } from '../i18n/config'

interface LanguageState {
  language: SupportedLanguage
  setLanguage: (language: SupportedLanguage) => void
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: (i18n.language as SupportedLanguage) || 'en',
      setLanguage: (language: SupportedLanguage) => {
        i18n.changeLanguage(language)
        set({ language })
      },
    }),
    {
      name: 'language-storage',
    }
  )
)
