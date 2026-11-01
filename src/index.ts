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
 * - `{{name}}` in a string is replaced by `values.name`.
 * - `t('items', { count })` reads `items_one`, `items_other`, … with the plural
 *   rules of the current language (`Intl.PluralRules`). `items_zero` is used
 *   for a count of 0 when the file has it. A plural key needs `count`: the
 *   type check fails without it.
 * - A key that the current language does not have falls back to the default
 *   language.
 *
 * The default language is in the importer's chunk, so its strings show on the
 * first render. Other languages load in their own chunks. `setLanguage` loads
 * them before it switches, so a component never shows two languages.
 */
export function useI18n<Source extends DefaultLanguageMessages>(
	source: Source,
) {
	const { module, language } = useModule(source)
	const t = <Key extends MessageKey<Source['en']>>(
		key: Key,
		...values: ValuesFor<Source['en'], Key>
	): string => format(module, language, key, values[0])
	return { t, language }
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
 * - A tag that is not in `components` shows as plain text. No HTML from a
 *   string is ever rendered.
 * - Tags are read before `{{values}}` go in, so a value never becomes a tag.
 */
export function Trans<Source extends DefaultLanguageMessages>(
	props: TransProps<Source>,
): ReactNode {
	const { module, language } = useModule(props.messages)
	const values = 'values' in props ? props.values : undefined
	const nodes = parseTags(templateOf(module, language, props.i18nKey, values))
	return createElement(
		Fragment,
		null,
		...renderNodes(nodes, props.components ?? {}, values),
	)
}

/** One set of props for each key of the file, so `values` with `count` is
 *  required exactly for the plural keys. */
export type TransProps<Source extends DefaultLanguageMessages> = [
	MessageKey<Source['en']>,
] extends [never]
	? // No known keys: TypeScript checks `Trans` as a JSX component with
		// the general `Messages` type, which has no keys.
		TransPropsFor<Source, string, never>
	: TransPropsFor<Source, MessageKey<Source['en']>, PluralKey<Source['en']>>

type TransPropsFor<Source, Keys extends string, PluralKeys> = {
	[Key in Keys]: {
		messages: Source
		i18nKey: Key
		/** The element for each tag name in the string. */
		components?: Record<string, ReactElement>
	} & (Key extends PluralKeys
		? { values: InterpolationValues & { count: number } }
		: { values?: InterpolationValues })
}[Keys]

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

/** Reads a string outside React (Yup messages, utils), in the language of the
 *  app. `I18nProvider` has no effect on it. */
export function translate<
	Source extends DefaultLanguageMessages,
	Key extends MessageKey<Source['en']>,
>(source: Source, key: Key, ...values: ValuesFor<Source['en'], Key>): string {
	return format(moduleOf(source), state.language, key, values[0])
}

export function getLanguage(): string {
	return state.language
}

/**
 * Loads the strings of every imported module for `language`, then switches
 * to it. Components re-render once, with all strings in the new language.
 */
export async function setLanguage(language: string): Promise<void> {
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

/** Called by the code that the Vite plugin makes from a `.i18n.json` file. */
export function registerI18nModule(
	namespace: string,
	defaultLanguage: string,
	defaultMessages: Messages,
	loaders: Record<string, LanguageLoader>,
): I18nModuleHandle {
	const isHotUpdate = modules.has(namespace)
	modules.set(namespace, {
		defaultLanguage,
		loaders: new Map(Object.entries(loaders)),
		languages: new Map([[defaultLanguage, defaultMessages]]),
		loading: new Map(),
	})
	if (isHotUpdate) {
		setState({ language: state.language })
	}
	return { [NAMESPACE]: namespace }
}

type Messages = { [key: string]: string | Messages }

type DefaultLanguageMessages = { en: Messages }

type InterpolationValues = Record<string, string | number>

type LanguageLoader = () => Promise<{ default: Messages }>

type I18nModule = {
	defaultLanguage: string
	loaders: Map<string, LanguageLoader>
	/** The strings of each loaded language. */
	languages: Map<string, Messages>
	loading: Map<string, Promise<void>>
}

const NAMESPACE = Symbol('i18n module namespace')

/** What a `.i18n.json` import is at runtime. TypeScript still types it as the
 *  file's JSON, which is what gives `useI18n` its keys. The
 *  `i18n-modules/no-messages-access` lint rule stops reads of that JSON. */
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

/** The values that `t(key, …)` takes: `count` is required for a plural key. */
type ValuesFor<Tree, Key> = Key extends PluralKey<Tree>
	? [values: InterpolationValues & { count: number }]
	: [values?: InterpolationValues]

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

/** The loader for `language`, or for its base language (`fr` for `fr-CA`). */
function loaderOf(module: I18nModule, language: string) {
	return (
		module.loaders.get(language) ?? module.loaders.get(language.split('-')[0])
	)
}

/** Starts loading `language` if it is not loaded yet. Returns nothing when
 *  its strings are ready, so a render can go on with no wait. */
function pendingLoad(
	module: I18nModule,
	language: string,
): Promise<void> | undefined {
	const loader = loaderOf(module, language)
	if (!loader || module.languages.has(language)) {
		return undefined
	}
	let loading = module.loading.get(language)
	if (!loading) {
		loading = loader().then(
			(loaded) => {
				module.languages.set(language, loaded.default)
			},
			(error: unknown) => {
				// Lets a later render try again.
				module.loading.delete(language)
				throw error
			},
		)
		module.loading.set(language, loading)
	}
	return loading
}

/** Reads the language (of the nearest `I18nProvider`, or else of the app)
 *  and the strings of `source`. Suspends while the strings of the language
 *  load. */
function useModule(source: unknown) {
	const current = useSyncExternalStore(subscribe, getState)
	const language = useContext(LanguageContext) ?? current.language
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
	return interpolate(templateOf(module, language, key, values), values)
}

/** The string of `key`, before the values go in. */
function templateOf(
	module: I18nModule,
	language: string,
	key: string,
	values?: InterpolationValues,
): string {
	return (
		find(module.languages.get(language), language, key, values) ??
		find(
			module.languages.get(module.defaultLanguage),
			module.defaultLanguage,
			key,
			values,
		) ??
		key
	)
}

function interpolate(text: string, values?: InterpolationValues): string {
	if (!values) {
		return text
	}
	return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, name: string) =>
		name in values ? String(values[name]) : placeholder,
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

const TAG = /<(\/?)([A-Za-z][\w-]*)\s*(\/?)>/g

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
	values?: InterpolationValues,
): ReactNode[] {
	return nodes.map((node) => {
		if (node.kind === 'text') {
			return interpolate(node.text, values)
		}
		const children = renderNodes(node.children, components, values)
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
