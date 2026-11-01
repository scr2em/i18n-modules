# @scr2em/i18n-modules

Scoped strings, like CSS Modules. Each component keeps its strings in its own
`Name.i18n.json` file, next to `Name.tsx`. The namespace comes from the file
path, so files never share keys and never cause merge conflicts in one big
file. This package does not use i18next.

## Use

`Page.i18n.json`:

```json
{
	"en": {
		"title": "Files",
		"files_one": "{{count}} file",
		"files_other": "{{count}} files"
	}
}
```

`Page.tsx`:

```tsx
import { useI18n } from '@scr2em/i18n-modules'

import messages from './Page.i18n.json'

const { t } = useI18n(messages)
t('title')
t('files', { count: 3 }) // `count` is required for a plural key
```

- Outside React, use `translate(messages, 'title')`.
- `{{name}}` is replaced by `values.name`.
- Plurals use `_zero`, `_one`, `_two`, `_few`, `_many` and `_other`, chosen
  with `Intl.PluralRules`.
- `setLanguage('fr')` loads the strings of every imported file for that
  language, then re-renders. The default language (`en`) is in the
  component's chunk, so it shows on the first render with no flicker.

## Example

`example/` is a small Vite + React app that uses the package: three
components with their own `.i18n.json` files, a language picker (English,
French, Arabic), plurals, and `translate` outside React.

```sh
cd example
pnpm install
pnpm dev
```

## Set up

`vite.config.ts`:

```ts
import { i18nModules } from '@scr2em/i18n-modules/vite'

plugins: [i18nModules()]
```

The plugin fails the dev server and the build when a language has keys that
the default language does not have, or does not have keys that it has.

`.oxlintrc.json`:

```json
"jsPlugins": ["@scr2em/i18n-modules/oxlint"],
"rules": {
	"i18n-modules/static-keys": "error",
	"i18n-modules/colocated-messages": "error",
	"i18n-modules/no-messages-access": "error"
}
```

- `static-keys`: keys are string literals.
- `colocated-messages`: a file imports only its own `.i18n.json` file.
- `no-messages-access`: give the import only to `useI18n` or `translate`. At
  runtime it is not the JSON of the file.
