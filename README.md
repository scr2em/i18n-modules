# @scr2em/i18n-modules

Scoped i18n strings for React and Vite, like CSS Modules.

Each component keeps its strings in its own `Name.i18n.json` file, next to
`Name.tsx`. The namespace comes from the file path, so two files never share
keys. Two people who add strings to different components never get a merge
conflict in one big translation file.

- The default language is in the component's chunk. The text shows on the
  first render, with no flicker.
- Other languages load in their own chunks, only when the user picks them.
- The keys are typed. A wrong key fails the type check.
- Plurals use `Intl.PluralRules`.
- The build fails when two languages of a file have different keys.
- An oxlint plugin keeps keys static and strings scoped.

## Requirements

- React 19 or later
- Vite 6 or later
- TypeScript with `resolveJsonModule` (for typed keys)

## 1. Install

The package is not on npm. Install it from GitHub:

```sh
pnpm add github:scr2em/i18n-modules
# or
npm install github:scr2em/i18n-modules
```

## 2. Add the plugin to your Vite app

Add `i18nModules()` to the plugins in `vite.config.ts`:

```ts
import { i18nModules } from '@scr2em/i18n-modules/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [react(), i18nModules()],
})
```

The default language is `en`. To use a different one, give
`i18nModules({ defaultLanguage: 'fr' })`.

Make sure that `tsconfig.json` has `resolveJsonModule`. TypeScript reads the
keys from the JSON file:

```json
{
	"compilerOptions": {
		"resolveJsonModule": true
	}
}
```

## 3. Add the oxlint rules

Install oxlint:

```sh
pnpm add -D oxlint
```

Add the plugin and its rules to `.oxlintrc.json`:

```json
{
	"jsPlugins": ["@scr2em/i18n-modules/oxlint"],
	"rules": {
		"i18n-modules/static-keys": "error",
		"i18n-modules/colocated-messages": "error",
		"i18n-modules/no-messages-access": "error"
	}
}
```

| Rule                 | What it checks                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `static-keys`        | The key given to `t()` or `translate()` is a string literal, so tools can find every key.                              |
| `colocated-messages` | `Name.tsx` imports only `./Name.i18n.json`. A file cannot read the strings of a different file.                        |
| `no-messages-access` | The imported strings go only to `useI18n()` or `translate()`. At runtime the import is not the JSON, so `messages.en` is `undefined`. |

## 4. Write a component

Put the strings next to the component, with one object for each language.

`Inbox.i18n.json`:

```json
{
	"en": {
		"heading": "Inbox of {{name}}",
		"unread_zero": "No unread messages",
		"unread_one": "{{count}} unread message",
		"unread_other": "{{count}} unread messages",
		"clear": "Clear"
	},
	"fr": {
		"heading": "Boîte de réception de {{name}}",
		"unread_zero": "Aucun message non lu",
		"unread_one": "{{count}} message non lu",
		"unread_many": "{{count}} de messages non lus",
		"unread_other": "{{count}} messages non lus",
		"clear": "Effacer"
	}
}
```

`Inbox.tsx`:

```tsx
import { useI18n } from '@scr2em/i18n-modules'
import { useState } from 'react'

import messages from './Inbox.i18n.json'

export function Inbox({ name }: { name: string }) {
	const { t } = useI18n(messages)
	const [unreadCount, setUnreadCount] = useState(3)

	return (
		<section>
			<h2>{t('heading', { name })}</h2>
			<p>{t('unread', { count: unreadCount })}</p>
			<button type="button" onClick={() => setUnreadCount(0)}>
				{t('clear')}
			</button>
		</section>
	)
}
```

- `{{name}}` is replaced by the value with the same name.
- `t('unread', { count })` picks `unread_zero`, `unread_one`, `unread_two`,
  `unread_few`, `unread_many` or `unread_other` with the plural rules of the
  current language. `_zero` is used for a count of 0 only when the file has
  it.
- A plural key needs `count`. `t('unread')` fails the type check.
- When a language does not have a key, the default language is used.

### Change the language

`setLanguage` loads the strings of every imported file for the new language.
Then it re-renders, so the page never shows two languages at the same time.

```tsx
import { setLanguage, useI18n } from '@scr2em/i18n-modules'

import messages from './LanguagePicker.i18n.json'

export function LanguagePicker() {
	const { t, language } = useI18n(messages)

	return (
		<select
			value={language}
			onChange={(event) => {
				void setLanguage(event.target.value)
			}}
		>
			<option value="en">{t('english')}</option>
			<option value="fr">{t('french')}</option>
		</select>
	)
}
```

A component that loads after a language change waits for its strings. Put a
`<Suspense>` around your app, so React has a place to wait:

```tsx
createRoot(root).render(
	<Suspense>
		<App />
	</Suspense>,
)
```

### Read strings outside React

Use `translate` in utils or validation messages. It uses the current
language.

```ts
import { translate } from '@scr2em/i18n-modules'

import messages from './validation.i18n.json'

export const requiredMessage = () => translate(messages, 'required')
```

## Example project

`example/` is a small Vite + React app that uses the package. It has three
components with their own `.i18n.json` files, a language picker (English,
French, Arabic), plurals, and `translate` outside React.

```sh
pnpm install
cd example
pnpm install
pnpm dev
```

## Develop

```sh
pnpm install
pnpm test        # Vitest
pnpm typecheck   # TypeScript
pnpm build       # compiles src to dist
```
