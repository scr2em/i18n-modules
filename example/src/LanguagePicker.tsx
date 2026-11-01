import { setLanguage, useI18n } from '@scr2em/i18n-modules'

import messages from './LanguagePicker.i18n.json'

export function LanguagePicker() {
	const { t, language } = useI18n(messages)
	// Each label is a static `t()` call, so tools can find every key.
	const languages = [
		{ code: 'en', label: t('languages.english') },
		{ code: 'fr', label: t('languages.french') },
		{ code: 'ar', label: t('languages.arabic') },
	]
	return (
		<label>
			{t('label')}{' '}
			<select
				value={language}
				onChange={(event) => {
					void setLanguage(event.target.value)
				}}
			>
				{languages.map((option) => (
					<option key={option.code} value={option.code}>
						{option.label}
					</option>
				))}
			</select>
		</label>
	)
}
