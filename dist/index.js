import { use, useSyncExternalStore } from 'react';
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
export function useI18n(source) {
    const state = useSyncExternalStore(subscribe, getState);
    const module = moduleOf(source);
    const pending = pendingLoad(module, state.language);
    if (pending) {
        // A module imported after a switch to another language: wait for its
        // strings, so the component does not show the default language first.
        use(pending);
    }
    const t = (key, ...values) => format(module, state.language, key, values[0]);
    return { t, language: state.language };
}
/** Reads a string outside React (Yup messages, utils), in the current
 *  language. */
export function translate(source, key, ...values) {
    return format(moduleOf(source), state.language, key, values[0]);
}
export function getLanguage() {
    return state.language;
}
/**
 * Loads the strings of every imported module for `language`, then switches
 * to it. Components re-render once, with all strings in the new language.
 */
export async function setLanguage(language) {
    requestedLanguage = language;
    await Promise.all([...modules.values()].flatMap((module) => pendingLoad(module, language) ?? []));
    // A later call wins over a slower earlier one.
    if (requestedLanguage === language && state.language !== language) {
        setState({ language });
    }
}
/** Called by the code that the Vite plugin makes from a `.i18n.json` file. */
export function registerI18nModule(namespace, defaultLanguage, defaultMessages, loaders) {
    const isHotUpdate = modules.has(namespace);
    modules.set(namespace, {
        defaultLanguage,
        loaders: new Map(Object.entries(loaders)),
        languages: new Map([[defaultLanguage, defaultMessages]]),
        loading: new Map(),
    });
    if (isHotUpdate) {
        setState({ language: state.language });
    }
    return { [NAMESPACE]: namespace };
}
const NAMESPACE = Symbol('i18n module namespace');
const modules = new Map();
const listeners = new Set();
// Replaced on every change, so `useSyncExternalStore` sees a new snapshot.
let state = { language: 'en' };
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
/** The loader for `language`, or for its base language (`fr` for `fr-CA`). */
function loaderOf(module, language) {
    return (module.loaders.get(language) ?? module.loaders.get(language.split('-')[0]));
}
/** Starts loading `language` if it is not loaded yet. Returns nothing when
 *  its strings are ready, so a render can go on with no wait. */
function pendingLoad(module, language) {
    const loader = loaderOf(module, language);
    if (!loader || module.languages.has(language)) {
        return undefined;
    }
    let loading = module.loading.get(language);
    if (!loading) {
        loading = loader().then((loaded) => {
            module.languages.set(language, loaded.default);
        }, (error) => {
            // Lets a later render try again.
            module.loading.delete(language);
            throw error;
        });
        module.loading.set(language, loading);
    }
    return loading;
}
function format(module, language, key, values) {
    const template = find(module.languages.get(language), language, key, values) ??
        find(module.languages.get(module.defaultLanguage), module.defaultLanguage, key, values) ??
        key;
    if (!values) {
        return template;
    }
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, name) => name in values ? String(values[name]) : placeholder);
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
