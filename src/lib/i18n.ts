import hr from '../../messages/hr.json';
import en from '../../messages/en.json';

export type Locale = 'hr' | 'en';

const dict: Record<Locale, Record<string, string>> = { hr, en };

export function t(key: string, vars: Record<string, string | number> = {}, locale: Locale = 'hr'): string {
  const s = dict[locale][key] ?? dict.hr[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
