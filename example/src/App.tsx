import { useI18n } from '@scr2em/i18n-modules'

import messages from './App.i18n.json'
import { greetingFor } from './greeting.ts'
import { Inbox } from './Inbox.tsx'
import { LanguagePicker } from './LanguagePicker.tsx'

export function App() {
	const { t } = useI18n(messages)
	return (
		<main>
			<h1>{t('title')}</h1>
			<p>{greetingFor(new Date().getHours())}</p>
			<LanguagePicker />
			<Inbox />
			<p>{t('footer')}</p>
		</main>
	)
}
