import { I18nProvider, Trans, useI18n } from '@scr2em/i18n-modules'
import { Suspense } from 'react'

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
			<h2>{t('preview')}</h2>
			{/* This subtree is always in French. Its own Suspense keeps the rest
			    of the page on the screen while the French strings load. */}
			<Suspense>
				<I18nProvider language="fr">
					<Inbox />
				</I18nProvider>
			</Suspense>
			<p>
				<Trans
					messages={messages}
					i18nKey="footer"
					components={{
						code: <code />,
						link: <a href="https://github.com/scr2em/i18n-modules" />,
					}}
				/>
			</p>
		</main>
	)
}
