# @scr2em/i18n-modules

Scoped i18n strings for React and Vite. It works like CSS Modules.

Each component keeps its strings in its own strings file, `Name.i18n.ts`.
This file is next to `Name.tsx`. The namespace comes from the file path. Thus
two files never share keys. When two people add strings to different
components, they do not get a merge conflict in one large translation file.

- The default language is in the chunk of the component. The text shows on
  the first render. The text does not flicker.
- Each other language loads in its own chunk. A language loads only when the
  user selects it.
- The keys and the `{{values}}` have types. `t()` autocompletes the values of
  each string. A wrong key or a wrong value fails the type check.
- Plurals use `Intl.PluralRules`.
- `<Trans>` puts React elements, such as links, in a translated sentence.
- You do not need a provider. Use `<I18nProvider>` only to give a subtree a
  different language. Use `<I18nOverrides>` only to replace strings at
  runtime.
- The build fails when two languages of a file have different keys.
- An oxlint plugin makes sure that keys are static and strings are scoped.

## Features

To install the package and set up Vite and oxlint, see [Setup](#setup).

### Write a component

Put the strings next to the component. Write one object for each language.

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

- `t()` replaces `{{name}}` with the value that has the same name.
- `t('heading', …)` autocompletes `name`. A missing, wrong or extra value
  fails the type check.
- `t('unread', { count })` selects one plural form: `unread_zero`,
  `unread_one`, `unread_two`, `unread_few`, `unread_many` or `unread_other`.
  It uses the plural rules of the current language.
- `t()` uses `_zero` for a count of 0 only when the file has a `_zero` key.
- A plural key needs `count`. `t('unread')` fails the type check.
- When a language does not have a key, `t()` uses the less specific
  language. Then it uses the default language. See
  [Language tags](#language-tags).

### Typed keys and values

The package does not generate files. TypeScript reads the strings file.
`defineMessages` keeps the exact text of each string. Thus:

- `t()` autocompletes the keys and the `{{values}}` of each string.
- `<Trans>` checks its tags.
- These checks occur in the editor and in `tsc`.

The strings must be literals: keys, nested objects and strings. The plugin
reads them at build time to put each language in its own chunk. Thus a
variable, a spread or a template literal with `${…}` fails the build. The
error gives the line of the problem.

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
t('invite', { 'first name': 'Ada' }) // t() removes the spaces at the ends of the name
t('saved') // no placeholders, so no values
t('files', { count: 2, folder: 'Docs' }) // the names of all plural forms
t('settings.title', { team: 'Design' }) // a nested key
t('greeting', { name: null, count: 0 }) // null shows as ''
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

- A value can be a string, a number, `null` or `undefined`. A value with the
  name `count` must be a number.
- Your editor autocompletes the names of the values after you type the key.
- When you change the text, the type check finds each `t()` call that does
  not agree with the new text. For example, when you change `{{name}}` to
  `{{fullName}}`, each `t('greeting', { name })` fails.
- A name with a default value is optional. See
  [Default values](#default-values).
- The `values` prop of `<Trans>` has the same types.

### Language tags

The language keys of a strings file are BCP 47 tags. Each tag starts with an
ISO 639 language. Examples:

- `en`, `fr`
- `pt-BR`: a language and an ISO 3166 region
- `zh-Hant-TW`: a language, an ISO 15924 script and a region

Rules:

- The build fails for a key that is not a tag, such as `english`.
- The build fails for a tag that is not in its canonical form, such as
  `pt-br`. The error gives the canonical form:
  `"pt-br" must be written "pt-BR"`.
- When a language does not have a key, `t()` uses the less specific tags.
  Then it uses the default language: `pt-BR` → `pt` → `en`.
- Thus a regional language needs only the strings that are different. When
  the file has `pt`, `pt-BR` can omit keys.
- When the file does not have `pt`, `pt-BR` needs all keys, as all other
  languages do.
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

`setLanguage` loads the strings of all imported files for the new language.
Then it renders the page again. Thus the page never shows two languages at
the same time.

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
`<Suspense>` around your app. React waits there:

```tsx
createRoot(root).render(
	<Suspense>
		<App />
	</Suspense>,
)
```

### Put elements in a sentence with `<Trans>`

Use `<Trans>` when a sentence has a link, bold text or a line break. Put tags
in the string. Give one React element for each tag name:

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
  element.
- A tag can be in a different tag.
- `<br/>` shows the element with no children.
- A tag that is not in `components` shows as plain text.
- `<Trans>` never shows HTML from a string.
- `<Trans>` reads the tags before it puts in the values. Thus a value never
  becomes a tag.
- `i18nKey` has the same type as the key of `t()`.
- `values` needs one value for each `{{name}}` in the text. A plural key also
  needs `count`.
- `components` needs one element for each tag in the text. In this example,
  the type check fails when `link`, `bold` or `br` is missing.

### Give a subtree a different language with `<I18nProvider>`

The app does not need a provider. With no provider, each component uses the
language that `setLanguage` sets.

You can show a part of the page in a different language. For example, you
can show a preview of an email in the language of its reader. To do this,
put that part in `<I18nProvider>`:

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

- The components in the provider use the language of the provider.
- The components outside the provider keep the language of the app. This is
  also true after `setLanguage`.
- When you put a provider in a different provider, the inner provider wins.
- When the language of the provider is not loaded, the subtree suspends
  while its strings load.
- The `<Suspense>` of the subtree keeps the remaining part of the page on
  the screen.
- To keep the old text on the screen while the new strings load, change
  `language` in `startTransition`.

### Override strings at runtime with `<I18nOverrides>`

You can replace some strings at runtime. For example, you can show text
that a customer edited and that the app gets from a server. To do this, put
a subtree in `<I18nOverrides>`:

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

- `strings` has only the keys that it changes. The keys have the same paths
  as in the file.
- The other keys come from the file.
- Each plural form is a separate key. An override of `items_other` does not
  change `items_one`.
- While `strings` is `undefined`, the text of the file shows. There is no
  loading state.
- Without `language`, the strings are for all languages.
- With `language="fr"`, the strings are only for French and its regional
  tags, such as `fr-CA`.
- The type of `strings` is a partial of the strings of the file. Thus a wrong
  key in the code fails the type check.
- The build does not check text from a server. In development,
  `console.warn` shows two types of problem: a key that is not in the file,
  and a `{{name}}` that is not in the original text.
- For more than one file, put one `<I18nOverrides>` in a different one. The
  inner override wins. Each override changes only its own file.
- `t` does not change while `strings` is the same object, as with query
  data. Thus the effects and memos that use `t` do not run again.
- `<Trans>` also uses the override, with its tags.

### Strings in helpers (schemas, columns, options)

Only the hook reads strings. Thus each component that shows text renders
again when the language changes. There is no function that reads a string
outside a hook.

A helper that is not a component keeps its strings in its own file. The
helper gets the `t` of those strings as a parameter. The file of the helper
exports a hook that gives that `t`. The component that calls the helper uses
this hook:

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

- `TranslateFunction<typeof messages>` gives types to the keys and the values
  of the strings of the helper.
- The `t` of a different file has different keys. Thus the type check fails
  when a component gives its own `t` to the helper.
- In a test, you can use a function such as `(key: string) => key` in place
  of `t`.

### Default values

Some values are for all strings, such as display names from the settings of
a customer. Set these values one time with `setDefaultValues`. Declare their
names. Then a `{{name}}` with a default value does not need a value in `t()`:

```ts
import { setDefaultValues } from '@scr2em/i18n-modules'

declare module '@scr2em/i18n-modules' {
	interface DefaultValues {
		staffDisplayName: string
	}
}

setDefaultValues({ staffDisplayName: settings.staffDisplayName ?? 'Staff' })
```

Each component that uses `useI18n` renders again with the new values. A
value in `t()` wins over the default value.

### Values and formats

- A value can be a string, a number, `null` or `undefined`.
- `null` and `undefined` show as an empty string.
- `{{count, number}}` formats a number for the current language. For
  example, `1234567` is `1,234,567` in English and `1.234.567` in German.

### Who can import a strings file

Only these files can import `Page.i18n.ts`. They must be in the same folder:

- `Page.tsx` (or `.ts`, `.jsx`, `.js`)
- its tests: `Page.test.tsx`, `Page.spec.tsx`
- its stories: `Page.stories.tsx`

An import from a different file fails the dev server and the build. This is
also true for a dynamic `import()` and for a file that exports the strings
again. To use the same text in a different file, put the text in the strings
file of that file.

## Setup

### Requirements

- React 19 or later
- Vite 6 or later
- TypeScript 5.0 or later. `defineMessages` uses a `const` type parameter.

### 1. Install

The package is not on npm. Install it from GitHub:

```sh
pnpm add github:scr2em/i18n-modules
# or
npm install github:scr2em/i18n-modules
```

### 2. Add the plugin to your Vite app

Add `i18nModules()` to the plugins in `vite.config.ts`:

```ts
import { i18nModules } from '@scr2em/i18n-modules/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [react(), i18nModules()],
})
```

#### Default language

The default language is `en`. To use a different language, use
`i18nModules({ defaultLanguage: 'fr' })`. The language can also have a
region, such as `'en-US'`.

### 3. Add the oxlint rules

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

| Rule                 | What it checks                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static-keys`        | The key of `t()` or `<Trans i18nKey>` is a string literal. Thus tools can find all keys.                                                                               |
| `colocated-messages` | `Name.tsx` imports only `./Name.i18n`. Its tests and stories can also import it. The rule reports a dynamic import or a re-export of a `.i18n.ts` file.                |
| `no-messages-access` | You can give the imported strings only to `useI18n()`, `<Trans messages>` or `typeof` in a type. At runtime the import is not the strings object, so `messages.en` is `undefined`. |

## Example project

`example/` is a small Vite and React app that uses the package. It has:

- components with their own `.i18n.ts` files
- a language picker (English, French, Arabic)
- plurals
- `<Trans>`
- a French preview with `<I18nProvider>`
- a helper that gets the `t` of its own strings

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

`dist` is in git. Thus an install from GitHub does not need a build step.
When you change `src`, run `pnpm build` and commit `dist` with the change.
