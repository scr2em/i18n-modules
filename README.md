# @scr2em/i18n-modules

Scoped i18n strings for React and Vite, like CSS Modules.

Each component keeps its strings in its own `Name.i18n.ts` file, next to
`Name.tsx`. The namespace comes from the file path, so two files never share
keys. Two people who add strings to different components never get a merge
conflict in one big translation file.

- The default language is in the component's chunk. The text shows on the
  first render, with no flicker.
- Other languages load in their own chunks, only when the user picks them.
- The keys and the `{{values}}` are typed. `t()` autocompletes the values
  of each string, and a wrong key or value fails the type check.
- Plurals use `Intl.PluralRules`.
- `<Trans>` puts React elements, such as links, inside a translated sentence.
- No provider is necessary. Add `<I18nProvider>` only to give a subtree a
  different language, and `<I18nOverrides>` only to replace strings at
  runtime.
- The build fails when two languages of a file have different keys.
- An oxlint plugin keeps keys static and strings scoped.

## Requirements

- React 19 or later
- Vite 6 or later
- TypeScript 5.0 or later (for the `const` type parameter of `defineMessages`)

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

### Who can import a strings file

Only these files, in the same folder, can import `Page.i18n.ts`:

- `Page.tsx` (or `.ts`, `.jsx`, `.js`)
- its tests: `Page.test.tsx`, `Page.spec.tsx`
- its stories: `Page.stories.tsx`

An import from any other file fails the dev server and the build. This is
also true for a dynamic `import()` and for a file that re-exports the strings.
To use the same text in a different file, put it in that file's own
`.i18n.ts` file.

### Default language

The default language is `en`. To use a different one, give
`i18nModules({ defaultLanguage: 'fr' })`. It can also have a region, such as
`'en-US'`.

### Typed keys and values

Nothing is generated. TypeScript reads the strings file itself:
`defineMessages` keeps the exact text of each string, so `t()` autocompletes
the keys and the `{{values}}` of each string, and `<Trans>` checks its tags,
in the editor and in `tsc`.

The strings must be literals: keys, nested objects and strings. The plugin
reads them at build time to put each language in its own chunk, so a
variable, a spread or a template literal with `${…}` fails the build with
the line of the problem.

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
| `static-keys`        | The key given to `t()` or `<Trans i18nKey>` is a string literal, so tools can find every key.                          |
| `colocated-messages` | `Name.tsx` imports only `./Name.i18n`. Its tests and stories can import it too. A dynamic import or a re-export of a `.i18n.ts` file is reported. |
| `no-messages-access` | The imported strings go only to `useI18n()`, `<Trans messages>` or `typeof` in a type. At runtime the import is not the JSON, so `messages.en` is `undefined`. |

## 4. Write a component

Put the strings next to the component, with one object for each language.

`Inbox.i18n.ts`:

```ts
import { defineMessages } from '@scr2em/i18n-modules'

export default defineMessages({
	en: {
		heading: 'Inbox of {{name}}',
		unread_zero: 'No unread messages',
		unread_one: '{{count}} unread message',
		unread_other: '{{count}} unread messages',
		clear: 'Clear',
	},
	fr: {
		heading: 'Boîte de réception de {{name}}',
		unread_zero: 'Aucun message non lu',
		unread_one: '{{count}} message non lu',
		unread_many: '{{count}} de messages non lus',
		unread_other: '{{count}} messages non lus',
		clear: 'Effacer',
	},
})
```

`Inbox.tsx`:

```tsx
import { useI18n } from '@scr2em/i18n-modules'
import { useState } from 'react'

import messages from './Inbox.i18n'

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

- `{{name}}` is replaced by the value with the same name. `t('heading', …)`
  autocompletes `name`. A missing, wrong or extra value fails the type check.
- `t('unread', { count })` picks `unread_zero`, `unread_one`, `unread_two`,
  `unread_few`, `unread_many` or `unread_other` with the plural rules of the
  current language. `_zero` is used for a count of 0 only when the file has
  it.
- A plural key needs `count`. `t('unread')` fails the type check.
- When a language does not have a key, the less specific language is used,
  then the default language. See [Language tags](#language-tags).

### Typed values in `{{…}}`

`t()` reads the `{{name}}` placeholders from the text of each string. The
second parameter of `t()` must have one value for each placeholder. The type
check uses the `en` strings of the file.

`Task.i18n.ts`:

```ts
import { defineMessages } from '@scr2em/i18n-modules'

export default defineMessages({
	en: {
		greeting: 'Hello {{name}}, you have {{count}} tasks',
		total: 'Total: {{amount, number}}',
		invite: 'Invite {{ first name }}',
		saved: 'Saved',
		files_one: '{{count}} file in {{folder}}',
		files_other: '{{count}} files in {{folder}}',
		settings: {
			title: 'Settings of {{team}}',
		},
	},
})
```

These calls pass the type check:

```ts
t('greeting', { name: 'Ada', count: 3 })
t('total', { amount: 1234.5 }) // the name is `amount`, not `amount, number`
t('invite', { 'first name': 'Ada' }) // spaces at the ends of the name are removed
t('saved') // no placeholders, so no values
t('files', { count: 2, folder: 'Docs' }) // the names of all plural forms
t('settings.title', { team: 'Design' }) // a nested key
t('greeting', { name: null, count: 0 }) // null renders as ''
```

These calls fail the type check:

```ts
t('greeting') // `name` and `count` are missing
t('greeting', { name: 'Ada' }) // `count` is missing
t('greeting', { nme: 'Ada', count: 3 }) // `nme` is not in the text
t('greeting', { name: 'Ada', count: 3, extra: 1 }) // `extra` is not in the text
t('greeting', { name: 'Ada', count: '3' }) // `count` must be a number
t('files', { count: 2 }) // `folder` is missing
t('saved', { name: 'Ada' }) // `saved` has no placeholders
t('total', { amount: { value: 1 } }) // a value is a string, a number, null or undefined
```

- A value can be a string, a number, `null` or `undefined`. A value named
  `count` must be a number.
- Your editor autocompletes the names of the values after you type the key.
- When you change the text, the type check finds each `t()` call that no
  longer fits. For example, rename `{{name}}` to `{{fullName}}` and every
  `t('greeting', { name })` fails.
- A name with a default value is optional. See
  [Default values](#default-values).
- `values` of `<Trans>` has the same types.

### Language tags

The language keys of a strings file are BCP 47 tags with an ISO 639 language:
`en`, `fr`, `pt-BR` (ISO 3166 region), `zh-Hant-TW` (ISO 15924 script and a
region).

- The build fails for a key that is not a tag, such as `english`, and for a
  tag that is not in its canonical form, such as `pt-br`. The error gives the
  canonical form: `"pt-br" must be written "pt-BR"`.
- A key that a language does not have falls back to the less specific tags,
  then to the default language: `pt-BR` → `pt` → `en`.
- So a regional language needs only the strings that are different. When the
  file has `pt`, `pt-BR` can leave out keys. With no `pt` in the file,
  `pt-BR` needs every key, as any other language does.
- `setLanguage('pt-br')` and `<I18nProvider language="pt-br">` use `pt-BR`.

```ts
import { defineMessages } from '@scr2em/i18n-modules'

export default defineMessages({
	en: {
		title: 'Settings',
		color: 'Color',
	},
	pt: {
		title: 'Configurações',
		color: 'Cor',
	},
	'pt-BR': {
		color: 'Cor do tema',
	},
})
```

### Change the language

`setLanguage` loads the strings of every imported file for the new language.
Then it re-renders, so the page never shows two languages at the same time.

```tsx
import { setLanguage, useI18n } from '@scr2em/i18n-modules'

import messages from './LanguagePicker.i18n'

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

### Put elements in a sentence with `<Trans>`

Use `<Trans>` when a sentence has a link, bold text or a line break. Put tags
in the string, and give one React element for each tag name:

```ts
import { defineMessages } from '@scr2em/i18n-modules'

export default defineMessages({
	en: {
		terms: 'Hello {{name}}, please accept the <link>terms</link>.<br/>It takes <bold>one minute</bold>.',
	},
})
```

```tsx
import { Trans } from '@scr2em/i18n-modules'

import messages from './SignUp.i18n'

export function SignUp({ name }: { name: string }) {
	return (
		<p>
			<Trans
				messages={messages}
				i18nKey="terms"
				values={{ name }}
				components={{
					link: <a href="/terms" />,
					bold: <strong />,
					br: <br />,
				}}
			/>
		</p>
	)
}
```

- The text between `<link>` and `</link>` becomes the children of the `link`
  element. Tags can be inside other tags.
- `<br/>` renders the element with no children.
- A tag that is not in `components` shows as plain text. No HTML from a
  string is ever rendered.
- Tags are read before the values go in, so a value never becomes a tag.
- `i18nKey` is typed like the key of `t()`. `values` needs one value for each
  `{{name}}` in the text, and `count` for a plural key.
- `components` needs one element for each tag in the text. Here the type
  check fails without `link`, `bold` or `br`.

### Give a subtree a different language with `<I18nProvider>`

The app needs no provider. With no provider, every component uses the
language that `setLanguage` sets. To show part of the page in a different
language, for example a preview of an email in the language of its reader,
wrap that part in `<I18nProvider>`:

```tsx
import { I18nProvider } from '@scr2em/i18n-modules'
import { Suspense } from 'react'

export function EmailPreview({ readerLanguage }: { readerLanguage: string }) {
	return (
		<Suspense>
			<I18nProvider language={readerLanguage}>
				<EmailBody />
			</I18nProvider>
		</Suspense>
	)
}
```

- Components inside the provider use its language. Components outside it
  keep the language of the app, also after `setLanguage`.
- The innermost provider wins.
- When the language of the provider is not loaded yet, the subtree suspends
  while its strings load. Its own `<Suspense>` keeps the rest of the page on
  the screen. To keep the old text on the screen while the new strings load,
  change `language` in `startTransition`.

### Override strings at runtime with `<I18nOverrides>`

To replace some strings at runtime, for example with text that a customer
edited and the app fetches, wrap a subtree in `<I18nOverrides>`:

```tsx
import { I18nOverrides } from '@scr2em/i18n-modules'

import pageMessages from './Page.i18n.ts'

export function CustomerPage() {
	const { data } = useQuery(customerCopyQuery)

	return (
		<I18nOverrides messages={pageMessages} strings={data?.page}>
			<Page />
		</I18nOverrides>
	)
}
```

- `strings` has only the keys it changes, with the same paths as the file.
  The other keys come from the file. A plural form is a separate key: an
  override of `items_other` leaves `items_one` as it is.
- Until `strings` arrives (`undefined`), the file's text shows. There is no
  loading state.
- Without `language`, the strings are for every language. With
  `language="fr"`, they are only for French and its regional tags (`fr-CA`).
- `strings` is typed as a partial of the file's strings, so a wrong key in
  code fails the type check. Remote text is not checked at build time: in
  development, a key that the file does not have, and a `{{name}}` that the
  original text does not have, are reported with `console.warn`.
- For several files, nest providers. An inner override wins, and each
  override applies only to its own file.
- `t` stays the same while `strings` is the same object (as with query data),
  so effects and memos that depend on it do not run again.
- `<Trans>` uses the override too, with its tags.

### Strings in helpers (schemas, columns, options)

Strings are read only with the hook, so every component that shows text
re-renders when the language changes. There is no function that reads a
string outside a hook.

A helper that is not a component keeps its strings in its own file and takes
the `t` of those strings as a parameter. The file exports a hook that gives
that `t`, and the component that calls the helper uses it:

```ts
// signUpSchema.ts
import { type TranslateFunction, useI18n } from '@scr2em/i18n-modules'
import { z } from 'zod'

import messages from './signUpSchema.i18n'

export const useSignUpSchemaTranslation = () => useI18n(messages).t

export const getSignUpSchema = (t: TranslateFunction<typeof messages>) =>
	z.object({ email: z.email(t('invalidEmail')) })
```

```tsx
// SignUpForm.tsx
import { getSignUpSchema, useSignUpSchemaTranslation } from './signUpSchema.ts'

export function SignUpForm() {
	const tSchema = useSignUpSchemaTranslation()
	const schema = getSignUpSchema(tSchema)
	// …
}
```

- `TranslateFunction<typeof messages>` types the keys and the values of the
  helper's own strings.
- The `t` of a different file has different keys, so the type check fails
  when a component passes its own `t` to the helper.
- In a test, a function such as `(key: string) => key` can stand in for `t`.

### Default values

Values that every string can use, such as display names from the settings of
a customer, are set once with `setDefaultValues`. Declare their names, so a
`{{name}}` with a default value does not need a value in `t()`:

```ts
import { setDefaultValues } from '@scr2em/i18n-modules'

declare module '@scr2em/i18n-modules' {
	interface DefaultValues {
		staffDisplayName: string
	}
}

setDefaultValues({ staffDisplayName: settings.staffDisplayName ?? 'Staff' })
```

Every component that uses `useI18n` re-renders with the new values. A value
in `t()` wins over the default value.

### Values and formats

- A value can be a string, a number, `null` or `undefined`. `null` and
  `undefined` render as an empty string.
- `{{count, number}}` formats a number for the current language:
  `1234567` is `1,234,567` in English and `1.234.567` in German.

## Example project

`example/` is a small Vite + React app that uses the package. It has
components with their own `.i18n.ts` files, a language picker (English,
French, Arabic), plurals, `<Trans>`, a French preview with `<I18nProvider>`,
and a helper that takes the `t` of its own strings.

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

`dist` is in git, so an install from GitHub needs no build step. Run
`pnpm build` and commit `dist` with every change to `src`.
