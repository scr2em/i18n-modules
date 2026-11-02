import {
	cloneElement,
	createContext,
	createElement,
	Fragment,
	type ReactElement,
	type ReactNode,
	use,
	useContext,
	useSyncExternalStore,
} from 'react'

/**
 * Scoped strings, like CSS Modules: a component keeps its strings next to it,
 * in a `Name.i18n.json` file with one object per language:
 *
 *   { "en": { "title": "Files" }, "fr": { "title": "…" } }
 *
 * The file's namespace comes from its path, so two files never share keys.
 *
 *   import messages from './Page.i18n.json'
 *   const { t } = useI18n(messages)
 *   t('title')
 *
 * - `{{name}}` in a string is replaced by `values.name`. The type check knows
 *   the names from the text, so `t()` autocompletes them and fails when one
 *   is missing or wrong. This needs the `.i18n.d.json.ts` files that the Vite
 *   plugin writes.
 * - `t('items', { count })` reads `items_one`, `items_other`, … with the plural
 *   rules of the current language (`Intl.PluralRules`). `items_zero` is used
 *   for a count of 0 when the file has it. A plural key needs `count`: the
 *   type check fails without it.
 * - Languages are BCP 47 tags: `en`, `fr`, `pt-BR`, `zh-Hant-TW`. A key that
 *   the current language does not have falls back to the less specific tags
 *   (`pt-BR`, then `pt`), then to the default language.
 *
 * The default language is in the importer's chunk, so its strings show on the
 * first render. Other languages load in their own chunks. `setLanguage` loads
 * them before it switches, so a component never shows two languages.
 */
export function useI18n<Tree extends Messages>(source: I18nMessages<Tree>) {
	const { module, language } = useModule(source)
	// The same `t` for the same file and language, so it is safe in the
	// dependencies of effects and memos, and the React Compiler can keep its
	// memoized values.
	let translator = module.translators.get(language)
	if (!translator) {
		translator = (key, values) => format(module, language, key, values)
		module.translators.set(language, translator)
	}
	const t = translator as unknown as TranslateFunction<I18nMessages<Tree>>
	return { t, language }
}

/**
 * Declares the strings of a `Name.i18n.ts` file, one object per language:
 *
 *   export default defineMessages({
 *     en: { title: 'Files', unread_one: '{{count}} message' },
 *     fr: { title: 'Fichiers', unread_one: '{{count}} message' },
 *   })
 *
 * The `const` type parameter keeps the exact text of each string, so `t()`
 * types its keys, `{{values}}` and tags with no generated files. The Vite
 * plugin reads the object at build time and replaces the module, so it must
 * be a literal. Outside Vite (a Node script), this returns the object as is.
 */
export function defineMessages<
	const Source extends { readonly en: Messages } & {
		readonly [language: string]: Messages
	},
>(source: Source): I18nMessages<Source['en']> {
	return source as unknown as I18nMessages<Source['en']>
}

/**
 * Renders a string that has tags, with React elements in place of the tags:
 *
 *   // "terms": "I accept the <link>terms</link>.<br/>Thank you, {{name}}."
 *   <Trans
 *     messages={messages}
 *     i18nKey="terms"
 *     values={{ name }}
 *     components={{ link: <a href="/terms" />, br: <br /> }}
 *   />
 *
 * - The text between `<link>` and `</link>` becomes the children of the
 *   `link` element. Tags can be inside other tags.
 * - `<br/>` renders the element with no children.
 * - Tag names can be numbers: `<0>…</0>` uses `components={{ 0: <b /> }}`.
 * - A tag that is not in `components` shows as plain text. No HTML from a
 *   string is ever rendered.
 * - Tags are read before `{{values}}` go in, so a value never becomes a tag.
 * - The type check reads the tags and the values from the text: `components`
 *   needs one element for each tag, and `values` one value for each name.
 */
export function Trans<Tree extends Messages>(
	props: TransProps<Tree>,
): ReactNode {
	const { module, language } = useModule(props.messages)
	const values = 'values' in props ? props.values : undefined
	const nodes = parseTags(templateOf(module, language, props.i18nKey, values))
	return createElement(
		Fragment,
		null,
		...renderNodes(nodes, props.components ?? {}, values, language),
	)
}

/** One set of props for each key of the file, with the `values` and the
 *  `components` that the text of that key needs. */
export type TransProps<Tree extends Messages> = [MessageKey<Tree>] extends [
	never,
]
	? // No known keys: TypeScript checks `Trans` as a JSX component with
		// the general `Messages` type, which has no keys.
		{
			messages: I18nMessages<Tree>
			i18nKey: string
			values?: InterpolationValues
			components?: Record<string, ReactElement>
		}
	: {
			[Key in MessageKey<Tree>]: {
				messages: I18nMessages<Tree>
				i18nKey: Key
			} & ValuesProp<Tree, Key> &
				ComponentsProp<Tree, Key>
		}[MessageKey<Tree>]

/**
 * Sets the language of a subtree. Components inside it use `language`, and
 * components outside it keep the language of the app. The innermost provider
 * wins. The app needs no provider: with none, components use the language
 * that `setLanguage` sets.
 *
 *   <I18nProvider language="fr">
 *     <Preview />
 *   </I18nProvider>
 *
 * When `language` changes to a language that is not loaded yet, the subtree
 * suspends while its strings load. Change it in `startTransition` to keep the
 * old text on the screen until the new strings are ready.
 */
export function I18nProvider({
	language,
	children,
}: {
	language: string
	children?: ReactNode
}): ReactNode {
	return createElement(LanguageContext.Provider, { value: language }, children)
}

/**
 * Values that every string can use, such as display names that come from the
 * settings of a customer. A `{{name}}` with a default value does not need a
 * value in `t()`, but can still get one. Components re-render with the new
 * values.
 *
 * Declare the names once, so the type check knows them:
 *
 *   declare module '@scr2em/i18n-modules' {
 *     interface DefaultValues {
 *       staffDisplayName: string
 *     }
 *   }
 *
 *   setDefaultValues({ staffDisplayName: settings.staffDisplayName })
 */
// oxlint-disable-next-line typescript/no-empty-interface -- filled by module augmentation
export interface DefaultValues {}

export function setDefaultValues(values: {
	[Name in keyof DefaultValues]?: InterpolationValue
}): void {
	defaultValues = { ...values }
	setState({ language: state.language })
}

/**
 * The type of the `t` that `useI18n(messages)` returns. A helper that is not
 * a component (a schema, a list of columns) takes it as a parameter, so the
 * component that calls the helper reads the strings with the hook and
 * re-renders when the language changes. There is no way to read strings
 * outside a hook.
 *
 *   // schema.ts
 *   import messages from './schema.i18n.json'
 *   export const useSchemaTranslation = () => useI18n(messages).t
 *   export const getSchema = (t: TranslateFunction<typeof messages>) => …
 *
 *   // Form.tsx
 *   const tSchema = useSchemaTranslation()
 *   const schema = getSchema(tSchema)
 */
export type TranslateFunction<Source> =
	Source extends I18nMessages<infer Tree>
		? (<Key extends MessageKey<Tree>>(
				key: Key,
				...values: ValuesFor<Tree, Key>
			) => string) & {
				// TypeScript relates two generic functions loosely, so without this
				// the `t` of any file would fit a helper of any other file. With it,
				// a `t` fits only where its strings have every key that the helper
				// reads, with the same text.
				readonly [MESSAGES_TREE]: Tree
			}
		: never

export function getLanguage(): string {
	return state.language
}

/**
 * Loads the strings of every imported module for `language`, then switches
 * to it. Components re-render once, with all strings in the new language.
 */
export async function setLanguage(requested: string): Promise<void> {
	const language = canonicalTag(requested)
	requestedLanguage = language
	await Promise.all(
		[...modules.values()].flatMap(
			(module) => pendingLoad(module, language) ?? [],
		),
	)
	// A later call wins over a slower earlier one.
	if (requestedLanguage === language && state.language !== language) {
		setState({ language })
	}
}

/** Called by the code that the Vite plugin makes from a `.i18n.json` file.
 *  Tests can call it to make strings without the plugin. */
export function registerI18nModule<const Tree extends Messages>(
	namespace: string,
	defaultLanguage: string,
	defaultMessages: Tree,
	loaders: Record<string, LanguageLoader>,
): I18nMessages<Tree> {
	const isHotUpdate = modules.has(namespace)
	modules.set(namespace, {
		defaultLanguage,
		loaders: new Map(Object.entries(loaders)),
		languages: new Map([[defaultLanguage, defaultMessages]]),
		loading: new Map(),
		translators: new Map(),
	})
	if (isHotUpdate) {
		setState({ language: state.language })
	}
	const handle: I18nModuleHandle = { [NAMESPACE]: namespace }
	// `I18nMessages` only carries the text for the type check.
	return handle as unknown as I18nMessages<Tree>
}

/**
 * The type of a `.i18n.json` import, from its `.i18n.d.json.ts` file. `Tree`
 * is the text of the default language. At runtime the import is not the JSON,
 * so this type has no properties to read: give it to `useI18n` or `<Trans>`.
 */
export type I18nMessages<Tree extends Messages> = {
	readonly [MESSAGES_TREE]: Tree
}

export type Messages = { readonly [key: string]: string | Messages }

/** `null` and `undefined` render as an empty string. */
type InterpolationValue = string | number | null | undefined

type InterpolationValues = Record<string, InterpolationValue>

type LanguageLoader = () => Promise<{ default: Messages }>

type I18nModule = {
	defaultLanguage: string
	loaders: Map<string, LanguageLoader>
	/** The strings of each loaded language. */
	languages: Map<string, Messages>
	loading: Map<string, Promise<void>>
	/** The `t` of each language, made once. */
	translators: Map<
		string,
		(key: string, values?: InterpolationValues) => string
	>
}

const NAMESPACE = Symbol('i18n module namespace')

/** A key that exists only for the type check, to carry the text of a file. */
declare const MESSAGES_TREE: unique symbol

/** What a `.i18n.json` import is at runtime. */
type I18nModuleHandle = { readonly [NAMESPACE]: string }

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

type WithoutPluralSuffix<Key extends string> =
	Key extends `${infer Base}_${PluralSuffix}` ? Base : Key

/** The dot paths of the plural keys in `Tree`, without the plural suffix. */
type PluralKey<Tree> = {
	[Key in keyof Tree & string]: Tree[Key] extends string
		? Key extends `${infer Base}_${PluralSuffix}`
			? Base
			: never
		: `${Key}.${PluralKey<Tree[Key]>}`
}[keyof Tree & string]

type Trim<Text extends string> = Text extends ` ${infer Rest}`
	? Trim<Rest>
	: Text extends `${infer Rest} `
		? Trim<Rest>
		: Text

/** The names in `{{name}}` (or `{{name, format}}`) in `Text`. */
type PlaceholderNames<Text extends string> =
	Text extends `${string}{{${infer Placeholder}}}${infer Rest}`
		? Trim<Placeholder extends `${infer Name},${string}` ? Name : Placeholder>
			| PlaceholderNames<Rest>
		: never

/** The names of the opening and self-closing tags in `Text`: `link` for
 *  `<link>…</link>`, `br` for `<br/>`. */
type TagNames<Text extends string> =
	Text extends `${string}<${infer Tag}>${infer Rest}`
		? TagName<Tag> | TagNames<Rest>
		: never

type TagName<Tag extends string> = Tag extends `/${string}` | ` ${string}`
	? never
	: Tag extends `${infer Name}/`
		? Trim<Name>
		: Tag

/** The text of `Key` in `Tree`, with all its plural forms. */
type TextOf<Tree, Key extends string> = Key extends `${infer Head}.${infer Rest}`
	? Head extends keyof Tree
		? TextOf<Tree[Head], Rest>
		: never
	: {
			[Name in keyof Tree & string]: WithoutPluralSuffix<Name> extends Key
				? Tree[Name] extends string
					? Tree[Name]
					: never
				: never
		}[keyof Tree & string]

/** The names that the text of `Key` needs a value for: each `{{name}}` with
 *  no default value, and `count` for a plural key. */
type RequiredNames<Tree, Key extends string> = Exclude<
	| PlaceholderNames<TextOf<Tree, Key>>
	| (Key extends PluralKey<Tree> ? 'count' : never),
	keyof DefaultValues
>

/** The names in the text that have a default value. */
type OptionalNames<Tree, Key extends string> = Extract<
	PlaceholderNames<TextOf<Tree, Key>>,
	keyof DefaultValues
>

type ValuesObject<Tree, Key extends string> = {
	[Name in RequiredNames<Tree, Key>]: Name extends 'count'
		? number
		: InterpolationValue
} & { [Name in OptionalNames<Tree, Key>]?: InterpolationValue }

/** The values that `t(key, …)` takes. Without the text of the strings (when
 *  the import is typed as plain JSON), any values are allowed. */
type ValuesFor<Tree, Key extends string> =
	string extends TextOf<Tree, Key>
		? [values?: InterpolationValues]
		: [RequiredNames<Tree, Key>] extends [never]
			? [OptionalNames<Tree, Key>] extends [never]
				? []
				: [values?: ValuesObject<Tree, Key>]
			: [values: ValuesObject<Tree, Key>]

type ValuesProp<Tree, Key extends string> =
	string extends TextOf<Tree, Key>
		? { values?: InterpolationValues }
		: [RequiredNames<Tree, Key>] extends [never]
			? [OptionalNames<Tree, Key>] extends [never]
				? { values?: never }
				: { values?: ValuesObject<Tree, Key> }
			: { values: ValuesObject<Tree, Key> }

type ComponentsProp<Tree, Key extends string> =
	string extends TextOf<Tree, Key>
		? { components?: Record<string, ReactElement> }
		: [TagNames<TextOf<Tree, Key>>] extends [never]
			? { components?: never }
			: {
					/** One element for each tag in the text. */
					components: Record<TagNames<TextOf<Tree, Key>>, ReactElement>
				}

/** The dot paths to the strings in `Tree`. Plural forms give one key, the one
 *  that `t(key, { count })` takes. */
type MessageKey<Tree> = {
	[Key in keyof Tree & string]: Tree[Key] extends string
		? WithoutPluralSuffix<Key>
		: `${Key}.${MessageKey<Tree[Key]>}`
}[keyof Tree & string]

const modules = new Map<string, I18nModule>()
/** The language of the nearest `I18nProvider`, if there is one. */
const LanguageContext = createContext<string | undefined>(undefined)
const listeners = new Set<() => void>()
// Replaced on every change, so `useSyncExternalStore` sees a new snapshot.
let state = { language: 'en' }
let defaultValues: InterpolationValues = {}
let requestedLanguage = state.language

function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

function getState() {
	return state
}

function setState(next: { language: string }) {
	state = next
	for (const listener of listeners) {
		listener()
	}
}

function moduleOf(source: unknown): I18nModule {
	if (
		typeof source === 'object' &&
		source !== null &&
		NAMESPACE in source &&
		typeof source[NAMESPACE] === 'string'
	) {
		const module = modules.get(source[NAMESPACE])
		if (module) {
			return module
		}
	}
	throw new Error(
		'i18n-modules: import the .i18n.json file in a module that Vite builds with the i18n-modules plugin',
	)
}

/** `pt-br` → `pt-BR`. A tag that is not valid stays as it is. */
function canonicalTag(language: string): string {
	try {
		return Intl.getCanonicalLocales(language)[0] ?? language
	} catch {
		return language
	}
}

/** `language` and its less specific tags: `zh-Hant-TW`, `zh-Hant`, `zh`. */
function fallbackTags(language: string): string[] {
	const subtags = language.split('-')
	return subtags.map((_subtag, index) =>
		subtags.slice(0, subtags.length - index).join('-'),
	)
}

/** The tags of `module` to read for `language`, most specific first, and
 *  then the default language. */
function tagsToRead(module: I18nModule, language: string): string[] {
	return [
		...fallbackTags(language).filter(
			(tag) => tag !== module.defaultLanguage && module.loaders.has(tag),
		),
		module.defaultLanguage,
	]
}

/** Starts loading the strings that `language` reads (its own and those of
 *  its less specific tags). Returns nothing when they are ready, so a render
 *  can go on with no wait. */
function pendingLoad(
	module: I18nModule,
	language: string,
): Promise<void> | undefined {
	const loads = tagsToRead(module, language).flatMap((tag) => {
		const loader = module.loaders.get(tag)
		return loader && !module.languages.has(tag)
			? [loadTag(module, tag, loader)]
			: []
	})
	return loads.length > 0 ? Promise.all(loads).then(() => undefined) : undefined
}

function loadTag(
	module: I18nModule,
	tag: string,
	loader: LanguageLoader,
): Promise<void> {
	let loading = module.loading.get(tag)
	if (!loading) {
		loading = loader().then(
			(loaded) => {
				module.languages.set(tag, loaded.default)
			},
			(error: unknown) => {
				// Lets a later render try again.
				module.loading.delete(tag)
				throw error
			},
		)
		module.loading.set(tag, loading)
	}
	return loading
}

/** Reads the language (of the nearest `I18nProvider`, or else of the app)
 *  and the strings of `source`. Suspends while the strings of the language
 *  load. */
function useModule(source: unknown) {
	const current = useSyncExternalStore(subscribe, getState)
	const providerLanguage = useContext(LanguageContext)
	const language =
		providerLanguage === undefined
			? current.language
			: canonicalTag(providerLanguage)
	const module = moduleOf(source)
	const pending = pendingLoad(module, language)
	if (pending) {
		// The strings of this language are not loaded yet: a module imported
		// after a language switch, or an `I18nProvider` with a new language.
		// Wait, so the component does not show the default language first.
		use(pending)
	}
	return { module, language }
}

function format(
	module: I18nModule,
	language: string,
	key: string,
	values?: InterpolationValues,
): string {
	return interpolate(templateOf(module, language, key, values), values, language)
}

/** The string of `key`, before the values go in. */
function templateOf(
	module: I18nModule,
	language: string,
	key: string,
	values?: InterpolationValues,
): string {
	for (const tag of tagsToRead(module, language)) {
		// The plural rules of the language of the text pick its plural form.
		const text = find(module.languages.get(tag), tag, key, values)
		if (text !== undefined) {
			return text
		}
	}
	return key
}

/** `{{name}}`, or `{{name, number}}` with a format. A name can have spaces
 *  (`{{plan name}}`), as the types and i18next allow. */
const PLACEHOLDER = /\{\{\s*([^},]+?)\s*(?:,\s*(\w+)\s*)?\}\}/g

function interpolate(
	text: string,
	values: InterpolationValues | undefined,
	language: string,
): string {
	const allValues = { ...defaultValues, ...values }
	return text.replace(
		PLACEHOLDER,
		(placeholder, name: string, formatName: string | undefined) => {
			if (!(name in allValues)) {
				return placeholder
			}
			const value = allValues[name]
			if (value === null || value === undefined) {
				return ''
			}
			return formatName === 'number' && typeof value === 'number'
				? new Intl.NumberFormat(language).format(value)
				: String(value)
		},
	)
}

type TagElement = {
	kind: 'tag'
	name: string
	/** The tag as it is in the string, for example `<link>`. */
	source: string
	children: TagNode[]
}

type TagNode = { kind: 'text'; text: string } | TagElement

// Names can be numbers (`<0>…</0>`), as with an array of components.
const TAG = /<(\/?)([A-Za-z0-9][\w-]*)\s*(\/?)>/g

/** Splits a string into text and tags. A closing tag with no matching opening
 *  tag stays text, and so does an opening tag that is never closed. */
function parseTags(template: string): TagNode[] {
	const root: TagElement = { kind: 'tag', name: '', source: '', children: [] }
	const stack: TagElement[] = [root]
	let textStart = 0
	for (const match of template.matchAll(TAG)) {
		const [source, closing, name, selfClosing] = match
		const parent = stack[stack.length - 1]
		if (match.index > textStart) {
			parent.children.push({
				kind: 'text',
				text: template.slice(textStart, match.index),
			})
		}
		textStart = match.index + source.length
		if (selfClosing) {
			parent.children.push({ kind: 'tag', name, source, children: [] })
		} else if (!closing) {
			const node: TagElement = { kind: 'tag', name, source, children: [] }
			parent.children.push(node)
			stack.push(node)
		} else if (stack.length > 1 && parent.name === name) {
			stack.pop()
		} else {
			parent.children.push({ kind: 'text', text: source })
		}
	}
	const lastParent = stack[stack.length - 1]
	if (textStart < template.length) {
		lastParent.children.push({ kind: 'text', text: template.slice(textStart) })
	}
	// Tags that are never closed: show the opening tag as text, and keep
	// their children in place.
	for (let depth = stack.length - 1; depth > 0; depth--) {
		const unclosed = stack[depth]
		const siblings = stack[depth - 1].children
		siblings.splice(
			siblings.indexOf(unclosed),
			1,
			{ kind: 'text', text: unclosed.source },
			...unclosed.children,
		)
	}
	return root.children
}

function renderNodes(
	nodes: TagNode[],
	components: Record<string, ReactElement>,
	values: InterpolationValues | undefined,
	language: string,
): ReactNode[] {
	return nodes.map((node) => {
		if (node.kind === 'text') {
			return interpolate(node.text, values, language)
		}
		const children = renderNodes(node.children, components, values, language)
		const component = Object.hasOwn(components, node.name)
			? components[node.name]
			: undefined
		if (!component) {
			// Not in `components`: show the tag as text.
			return createElement(
				Fragment,
				null,
				node.source,
				...children,
				node.source.endsWith('/>') ? '' : `</${node.name}>`,
			)
		}
		return children.length > 0
			? cloneElement(component, undefined, ...children)
			: cloneElement(component)
	})
}

function find(
	messages: Messages | undefined,
	language: string,
	key: string,
	values?: InterpolationValues,
): string | undefined {
	if (!messages) {
		return undefined
	}
	const path = key.split('.')
	const lastKey = path.pop() ?? key
	let parent: Messages | undefined = messages
	for (const segment of path) {
		const child: string | Messages | undefined = parent[segment]
		parent = typeof child === 'object' ? child : undefined
		if (!parent) {
			return undefined
		}
	}
	const count = values?.count
	const candidates =
		typeof count === 'number'
			? [
					...(count === 0 ? [`${lastKey}_zero`] : []),
					`${lastKey}_${new Intl.PluralRules(language).select(count)}`,
					`${lastKey}_other`,
					lastKey,
				]
			: [lastKey]
	for (const candidate of candidates) {
		const value = parent[candidate]
		if (typeof value === 'string') {
			return value
		}
	}
	return undefined
}
