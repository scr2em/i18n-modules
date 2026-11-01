import { i18nModules } from '@scr2em/i18n-modules/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [react(), i18nModules()],
	// The package is linked from the folder above, which has its own React.
	// One copy of React is needed for hooks to work.
	resolve: { dedupe: ['react', 'react-dom'] },
})
