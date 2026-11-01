import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.tsx'

const root = document.getElementById('root')
if (!root) {
	throw new Error('The page has no #root element')
}

createRoot(root).render(
	<StrictMode>
		{/* A component imported after a language switch waits here for its
		    strings, so it never shows the default language first. */}
		<Suspense>
			<App />
		</Suspense>
	</StrictMode>,
)
