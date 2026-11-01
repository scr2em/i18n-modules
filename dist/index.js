import { cloneElement, createContext, createElement, Fragment, use, useContext, useSyncExternalStore, } from 'react';
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
export function useI18n(source) {
    const { module, language } = useModule(source);
    // The same `t` for the same file and language, so it is safe in the
    // dependencies of effects and memos, and the React Compiler can keep its
    // memoized values.
    let translator = module.translators.get(language);
    if (!translator) {
        translator = (key, values) => format(module, language, key, values);
        module.translators.set(language, translator);
    }
    const t = translator;
    return { t, language };
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
export function Trans(props) {
    const { module, language } = useModule(props.messages);
    const values = 'values' in props ? props.values : undefined;
    const nodes = parseTags(templateOf(module, language, props.i18nKey, values));
    return createElement(Fragment, null, ...renderNodes(nodes, props.components ?? {}, values, language));
}
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
export function I18nProvider({ language, children, }) {
    return createElement(LanguageContext.Provider, { value: language }, children);
}
export function setDefaultValues(values) {
    defaultValues = { ...values };
    setState({ language: state.language });
}
export function getLanguage() {
    return state.language;
}
/**
 * Loads the strings of every imported module for `language`, then switches
 * to it. Components re-render once, with all strings in the new language.
 */
export async function setLanguage(requested) {
    const language = canonicalTag(requested);
    requestedLanguage = language;
    await Promise.all([...modules.values()].flatMap((module) => pendingLoad(module, language) ?? []));
    // A later call wins over a slower earlier one.
    if (requestedLanguage === language && state.language !== language) {
        setState({ language });
    }
}
/** Called by the code that the Vite plugin makes from a `.i18n.json` file.
 *  Tests can call it to make strings without the plugin. */
export function registerI18nModule(namespace, defaultLanguage, defaultMessages, loaders) {
    const isHotUpdate = modules.has(namespace);
    modules.set(namespace, {
        defaultLanguage,
        loaders: new Map(Object.entries(loaders)),
        languages: new Map([[defaultLanguage, defaultMessages]]),
        loading: new Map(),
        translators: new Map(),
    });
    if (isHotUpdate) {
        setState({ language: state.language });
    }
    const handle = { [NAMESPACE]: namespace };
    // `I18nMessages` only carries the text for the type check.
    return handle;
}
const NAMESPACE = Symbol('i18n module namespace');
const modules = new Map();
/** The language of the nearest `I18nProvider`, if there is one. */
const LanguageContext = createContext(undefined);
const listeners = new Set();
// Replaced on every change, so `useSyncExternalStore` sees a new snapshot.
let state = { language: 'en' };
let defaultValues = {};
let requestedLanguage = state.language;
function subscribe(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
function getState() {
    return state;
}
function setState(next) {
    state = next;
    for (const listener of listeners) {
        listener();
    }
}
function moduleOf(source) {
    if (typeof source === 'object' &&
        source !== null &&
        NAMESPACE in source &&
        typeof source[NAMESPACE] === 'string') {
        const module = modules.get(source[NAMESPACE]);
        if (module) {
            return module;
        }
    }
    throw new Error('i18n-modules: import the .i18n.json file in a module that Vite builds with the i18n-modules plugin');
}
/** `pt-br` → `pt-BR`. A tag that is not valid stays as it is. */
function canonicalTag(language) {
    try {
        return Intl.getCanonicalLocales(language)[0] ?? language;
    }
    catch {
        return language;
    }
}
/** `language` and its less specific tags: `zh-Hant-TW`, `zh-Hant`, `zh`. */
function fallbackTags(language) {
    const subtags = language.split('-');
    return subtags.map((_subtag, index) => subtags.slice(0, subtags.length - index).join('-'));
}
/** The tags of `module` to read for `language`, most specific first, and
 *  then the default language. */
function tagsToRead(module, language) {
    return [
        ...fallbackTags(language).filter((tag) => tag !== module.defaultLanguage && module.loaders.has(tag)),
        module.defaultLanguage,
    ];
}
/** Starts loading the strings that `language` reads (its own and those of
 *  its less specific tags). Returns nothing when they are ready, so a render
 *  can go on with no wait. */
function pendingLoad(module, language) {
    const loads = tagsToRead(module, language).flatMap((tag) => {
        const loader = module.loaders.get(tag);
        return loader && !module.languages.has(tag)
            ? [loadTag(module, tag, loader)]
            : [];
    });
    return loads.length > 0 ? Promise.all(loads).then(() => undefined) : undefined;
}
function loadTag(module, tag, loader) {
    let loading = module.loading.get(tag);
    if (!loading) {
        loading = loader().then((loaded) => {
            module.languages.set(tag, loaded.default);
        }, (error) => {
            // Lets a later render try again.
            module.loading.delete(tag);
            throw error;
        });
        module.loading.set(tag, loading);
    }
    return loading;
}
/** Reads the language (of the nearest `I18nProvider`, or else of the app)
 *  and the strings of `source`. Suspends while the strings of the language
 *  load. */
function useModule(source) {
    const current = useSyncExternalStore(subscribe, getState);
    const providerLanguage = useContext(LanguageContext);
    const language = providerLanguage === undefined
        ? current.language
        : canonicalTag(providerLanguage);
    const module = moduleOf(source);
    const pending = pendingLoad(module, language);
    if (pending) {
        // The strings of this language are not loaded yet: a module imported
        // after a language switch, or an `I18nProvider` with a new language.
        // Wait, so the component does not show the default language first.
        use(pending);
    }
    return { module, language };
}
function format(module, language, key, values) {
    return interpolate(templateOf(module, language, key, values), values, language);
}
/** The string of `key`, before the values go in. */
function templateOf(module, language, key, values) {
    for (const tag of tagsToRead(module, language)) {
        // The plural rules of the language of the text pick its plural form.
        const text = find(module.languages.get(tag), tag, key, values);
        if (text !== undefined) {
            return text;
        }
    }
    return key;
}
/** `{{name}}`, or `{{name, number}}` with a format. */
const PLACEHOLDER = /\{\{\s*(\w+)\s*(?:,\s*(\w+)\s*)?\}\}/g;
function interpolate(text, values, language) {
    const allValues = { ...defaultValues, ...values };
    return text.replace(PLACEHOLDER, (placeholder, name, formatName) => {
        if (!(name in allValues)) {
            return placeholder;
        }
        const value = allValues[name];
        if (value === null || value === undefined) {
            return '';
        }
        return formatName === 'number' && typeof value === 'number'
            ? new Intl.NumberFormat(language).format(value)
            : String(value);
    });
}
// Names can be numbers (`<0>…</0>`), as with an array of components.
const TAG = /<(\/?)([A-Za-z0-9][\w-]*)\s*(\/?)>/g;
/** Splits a string into text and tags. A closing tag with no matching opening
 *  tag stays text, and so does an opening tag that is never closed. */
function parseTags(template) {
    const root = { kind: 'tag', name: '', source: '', children: [] };
    const stack = [root];
    let textStart = 0;
    for (const match of template.matchAll(TAG)) {
        const [source, closing, name, selfClosing] = match;
        const parent = stack[stack.length - 1];
        if (match.index > textStart) {
            parent.children.push({
                kind: 'text',
                text: template.slice(textStart, match.index),
            });
        }
        textStart = match.index + source.length;
        if (selfClosing) {
            parent.children.push({ kind: 'tag', name, source, children: [] });
        }
        else if (!closing) {
            const node = { kind: 'tag', name, source, children: [] };
            parent.children.push(node);
            stack.push(node);
        }
        else if (stack.length > 1 && parent.name === name) {
            stack.pop();
        }
        else {
            parent.children.push({ kind: 'text', text: source });
        }
    }
    const lastParent = stack[stack.length - 1];
    if (textStart < template.length) {
        lastParent.children.push({ kind: 'text', text: template.slice(textStart) });
    }
    // Tags that are never closed: show the opening tag as text, and keep
    // their children in place.
    for (let depth = stack.length - 1; depth > 0; depth--) {
        const unclosed = stack[depth];
        const siblings = stack[depth - 1].children;
        siblings.splice(siblings.indexOf(unclosed), 1, { kind: 'text', text: unclosed.source }, ...unclosed.children);
    }
    return root.children;
}
function renderNodes(nodes, components, values, language) {
    return nodes.map((node) => {
        if (node.kind === 'text') {
            return interpolate(node.text, values, language);
        }
        const children = renderNodes(node.children, components, values, language);
        const component = Object.hasOwn(components, node.name)
            ? components[node.name]
            : undefined;
        if (!component) {
            // Not in `components`: show the tag as text.
            return createElement(Fragment, null, node.source, ...children, node.source.endsWith('/>') ? '' : `</${node.name}>`);
        }
        return children.length > 0
            ? cloneElement(component, undefined, ...children)
            : cloneElement(component);
    });
}
function find(messages, language, key, values) {
    if (!messages) {
        return undefined;
    }
    const path = key.split('.');
    const lastKey = path.pop() ?? key;
    let parent = messages;
    for (const segment of path) {
        const child = parent[segment];
        parent = typeof child === 'object' ? child : undefined;
        if (!parent) {
            return undefined;
        }
    }
    const count = values?.count;
    const candidates = typeof count === 'number'
        ? [
            ...(count === 0 ? [`${lastKey}_zero`] : []),
            `${lastKey}_${new Intl.PluralRules(language).select(count)}`,
            `${lastKey}_other`,
            lastKey,
        ]
        : [lastKey];
    for (const candidate of candidates) {
        const value = parent[candidate];
        if (typeof value === 'string') {
            return value;
        }
    }
    return undefined;
}
