import { useI18n } from '@scr2em/i18n-modules'
import { useState } from 'react'

import messages from './Inbox.i18n.json'

export function Inbox() {
	const { t } = useI18n(messages)
	const [unreadCount, setUnreadCount] = useState(0)
	return (
		<section>
			<h2>{t('heading')}</h2>
			{/* `count` picks the plural form: zero, one, two, few, many or other. */}
			<p>{t('unread', { count: unreadCount })}</p>
			<button
				type="button"
				onClick={() => setUnreadCount((count) => count + 1)}
			>
				{t('add')}
			</button>{' '}
			<button type="button" onClick={() => setUnreadCount(0)}>
				{t('clear')}
			</button>
		</section>
	)
}
