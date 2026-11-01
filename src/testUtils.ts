import { renderHook } from '@testing-library/react'

import { type I18nMessages, type Messages, useI18n } from './index.ts'

/** The typed `t` of `messages`, in the current language, for a test. */
export function tFor<Tree extends Messages>(messages: I18nMessages<Tree>) {
	return renderHook(() => useI18n(messages)).result.current.t
}
