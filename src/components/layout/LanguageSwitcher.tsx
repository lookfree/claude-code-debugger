import { Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguageStore } from '@/stores/languageStore'
import { languageNames, type SupportedLanguage } from '@/i18n/config'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu'

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguageStore()

  const handleLanguageChange = (lang: SupportedLanguage) => {
    setLanguage(lang)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Globe className="h-4 w-4" />
          <span>{languageNames[language]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover border rounded-md shadow-md p-1 min-w-[120px]">
        {(Object.keys(languageNames) as SupportedLanguage[]).map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => handleLanguageChange(lang)}
            className={`px-3 py-2 cursor-pointer hover:bg-accent rounded-sm ${
              language === lang ? 'bg-accent font-semibold' : ''
            }`}
          >
            {languageNames[lang]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
