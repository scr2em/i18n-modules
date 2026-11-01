import { translate } from '@scr2em/i18n-modules'

import messages from './greeting.i18n.json'

/** Reads strings outside React, in the current language. */
export function greetingFor(hour: number): string {
	if (hour < 12) {
		return translate(messages, 'morning')
	}
	if (hour < 18) {
		return translate(messages, 'afternoon')
	}
	return translate(messages, 'evening')
}
