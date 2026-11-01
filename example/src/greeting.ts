import { type TranslateFunction, useI18n } from '@scr2em/i18n-modules'

import messages from './greeting.i18n.json'

/** The `t` of this file's strings. The component that calls `greetingFor`
 *  reads it with this hook, so it re-renders when the language changes. */
export const useGreetingTranslation = () => useI18n(messages).t

/** A helper that is not a component takes the `t` of its own strings. */
export function greetingFor(
	t: TranslateFunction<typeof messages>,
	hour: number,
): string {
	if (hour < 12) {
		return t('morning')
	}
	if (hour < 18) {
		return t('afternoon')
	}
	return t('evening')
}
