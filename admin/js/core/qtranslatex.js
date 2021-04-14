/**
 * Main qTranslateX class for LSB and content hooks
 *
 * Search for 'Designed as interface for other plugin integration' in comments to functions
 * to find out which functions are safe to use in the 3rd-party integration.
 * Avoid accessing internal variables directly, as they are subject to be re-designed at any time.
 * Single global variable 'qTranslateConfig' is an entry point to the interface.
 * - qTranslateConfig.qtx - is a shorthand reference to the only global object of type 'qTranslateX'.
 * - qTranslateConfig.js - is a place where custom Java script functions are stored, if needed.
 * Read Integration Guide: https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide for more information.
 */
import {qtranxj_ce} from './dom';
import {qtranxj_get_split_blocks, qtranxj_split, qtranxj_split_blocks} from './qblocks';
import {getStoredEditLanguage, storeEditLanguage} from './store';

const $ = jQuery;

const qTranslateConfig = window.qTranslateConfig;

const qTranslateX = function (pg) {
    const qtx = this;

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     * return array keyed by two-letter language code. Example of usage:
     * const langs = getLanguages();
     * for(const lang_code in langs){
     *  const lang_conf = langs[lang_code];
     *  // variables available:
     *  //lang_conf.name //name of language in native language
     *  //lang_conf.admin_name //in the admin language chosen
     *  //lang_conf.flag
     *  //lang_conf.locale
     *  // and may be more properties later
     * }
     * @since 3.3
     */
    this.getLanguages = function () {
        return qTranslateConfig.language_config;
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     * return URL to folder with flag images.
     */
    this.getFlagLocation = function () {
        return qTranslateConfig.flag_location;
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     * return true if 'lang' is in the hash of enabled languages.
     * This function maybe needed, as function qtranxj_split may return languages,
     * which are not enabled, in case they were previously enabled and had some data.
     * Such data is preserved and re-saved until user deletes it manually.
     */
    this.isLanguageEnabled = function (lang) {
        return !!qTranslateConfig.language_config[lang];
    };

    if (qTranslateConfig.LSB) {
        qTranslateConfig.activeLanguage = getStoredEditLanguage();
        if (!qTranslateConfig.activeLanguage || !this.isLanguageEnabled(qTranslateConfig.activeLanguage)) {
            qTranslateConfig.activeLanguage = qTranslateConfig.language;
            if (this.isLanguageEnabled(qTranslateConfig.activeLanguage)) {
                storeEditLanguage(qTranslateConfig.activeLanguage);
            } else {
                // fallback to single mode
                qTranslateConfig.LSB = false;
            }
        }
    } else {
        qTranslateConfig.activeLanguage = qTranslateConfig.language;
        // no need to store for the current mode, but just in case the LSB are used later
        storeEditLanguage(qTranslateConfig.activeLanguage);
    }

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.3
     */
    this.getActiveLanguage = function () {
        return qTranslateConfig.activeLanguage;
    };

    const contentHooks = {};

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.3.4
     */
    this.hasContentHook = function (id) {
        return contentHooks[id];
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.3.2
     */
    this.addContentHook = function (inputField, encode, fieldName) {
        if (!inputField) return false;
        switch (inputField.tagName) {
            case 'TEXTAREA':
                break;
            case 'INPUT':
                // reject the types which cannot be multilingual
                switch (inputField.type) {
                    case 'button':
                    case 'checkbox':
                    case 'password':
                    case 'radio':
                    case 'submit':
                        return false;
                }
                break;
            default:
                return false;
        }

        if (!fieldName) {
            if (!inputField.name) return false;
            fieldName = inputField.name;
        }
        if (inputField.id) {
            if (contentHooks[inputField.id]) {
                if ($.contains(document, inputField))
                    return contentHooks[inputField.id];
                // otherwise some Java script already removed previously hooked element
                qtx.removeContentHook(inputField);
            }
        } else if (!contentHooks[fieldName]) {
            inputField.id = fieldName;
        } else {
            let idx = 0;
            do {
                ++idx;
                inputField.id = fieldName + idx;
            } while (contentHooks[inputField.id]);
        }

        /**
         * Highlighting the translatable fields
         * @since 3.2-b3
         */
        inputField.className += ' qtranxs-translatable';

        const hook = contentHooks[inputField.id] = {};
        hook.name = fieldName;
        hook.contentField = inputField;
        hook.lang = qTranslateConfig.activeLanguage;

        let qtxPrefix;
        if (encode) {
            switch (encode) {
                case 'slug':
                    qtxPrefix = 'qtranslate-slugs[';
                    break;
                case 'term':
                    qtxPrefix = 'qtranslate-terms[';
                    break;
                default:
                    qtxPrefix = 'qtranslate-fields[';
                    break;
            }
        } else {
            // since 3.1 we get rid of <--:--> encoding
            encode = '[';
            qtxPrefix = 'qtranslate-fields[';
        }

        hook.encode = encode;

        let baseName, suffixName;
        const pos = hook.name.indexOf('[');
        if (pos < 0) {
            baseName = qtxPrefix + hook.name + ']';
        } else {
            baseName = qtxPrefix + hook.name.substring(0, pos) + ']';
            if (hook.name.lastIndexOf('[]') < 0) {
                baseName += hook.name.substring(pos);
            } else {
                const len = hook.name.length - 2;
                if (len > pos)
                    baseName += hook.name.substring(pos, len);
                suffixName = '[]';
            }
        }

        let contents;

        hook.fields = {};
        if (!qTranslateConfig.RAW) {
            // Most crucial moment when untranslated content is parsed
            contents = qtranxj_split(inputField.value);
            // Substitute the current ML content with translated content for the current language
            inputField.value = contents[hook.lang];
            // Insert translated content for each language before the current field
            for (const lang in contents) {
                const text = contents[lang];
                let newName = baseName + '[' + lang + ']';
                if (suffixName)
                    newName += suffixName;
                const newField = qtranxj_ce('input', {name: newName, type: 'hidden', className: 'hidden', value: text});
                hook.fields[lang] = newField;
                inputField.parentNode.insertBefore(newField, inputField);
            }

            // insert a hidden element in the form so that the edit language is sent to the server
            const $form = $(inputField).closest('form');
            if ($form.length) {
                const $hidden = $form.find('input[name="qtranslate-edit-language"]');
                if (!$hidden.length) {
                    qtranxj_ce('input', {
                        type: 'hidden',
                        name: 'qtranslate-edit-language',
                        value: qTranslateConfig.activeLanguage
                    }, $form[0], true);
                }
            } else {
                console.error('No form found for translatable field id=', inputField.id);
            }
        }

        // since 3.2.9.8 - hook.contents -> hook.fields
        // since 3.3.8.7 - slug & term
        switch (encode) {
            case 'slug':
            case 'term': {
                if (qTranslateConfig.RAW)
                    contents = qtranxj_split(inputField.value);
                hook.sepfield = qtranxj_ce('input', {
                    name: baseName + '[qtranslate-original-value]',
                    type: 'hidden',
                    className: 'hidden',
                    value: contents[qTranslateConfig.default_language]
                });
            }
                break;
            default: {
                if (!qTranslateConfig.RAW) {
                    hook.sepfield = qtranxj_ce('input', {
                        name: baseName + '[qtranslate-separator]',
                        type: 'hidden',
                        className: 'hidden',
                        value: encode
                    });
                }
            }
                break;
        }

        if (hook.sepfield)
            inputField.parentNode.insertBefore(hook.sepfield, inputField);

        return hook;
    };
    this.addContentHookC = function (inputField) {
        return qtx.addContentHook(inputField, '['); // TODO shouldn't it be '<' ?!
    };
    this.addContentHookB = function (inputField) {
        return qtx.addContentHook(inputField, '[');
    };

    this.addContentHookById = function (id, sep, name) {
        return qtx.addContentHook(document.getElementById(id), sep, name);
    };
    this.addContentHookByIdName = function (name) {
        let sep;
        switch (name[0]) {
            case '<':
            case '[':
                sep = name.substring(0, 1);
                name = name.substring(1);
                break;
            default:
                break;
        }
        return qtx.addContentHookById(name, sep);
    };
    this.addContentHookByIdC = function (id) {
        return qtx.addContentHookById(id, '['); // TODO shouldn't it be '<' ?!
    };
    this.addContentHookByIdB = function (id) {
        return qtx.addContentHookById(id, '[');
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.1-b2
     */
    this.addContentHooks = function (fields, sep, fieldName) {
        for (let i = 0; i < fields.length; ++i) {
            const field = fields[i];
            qtx.addContentHook(field, sep, fieldName);
        }
    };

    const addContentHooksByClassName = function (name, container, sep) {
        if (!container)
            container = document;
        const fields = container.getElementsByClassName(name);
        qtx.addContentHooks(fields, sep);
    };

    this.addContentHooksByClass = function (name, container) {
        let sep;
        if (name.indexOf('<') === 0 || name.indexOf('[') === 0) {
            sep = name.substring(0, 1);
            name = name.substring(1);
        }
        addContentHooksByClassName(name, container, sep);
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.3.2
     */
    this.addContentHooksByTagInClass = function (name, tag, container) {
        const elems = container.getElementsByClassName(name);
        for (let i = 0; i < elems.length; ++i) {
            const elem = elems[i];
            const items = elem.getElementsByTagName(tag);
            qtx.addContentHooks(items);
        }
    };

    const removeContentHookH = function (hook) {
        if (!hook)
            return false;
        if (hook.sepfield)
            $(hook.sepfield).remove();
        const contents = {};
        for (const lang in hook.fields) {
            const f = hook.fields[lang];
            contents[lang] = f.value;
            $(f).remove();
        }
        $(hook.contentField).removeClass('qtranxs-translatable');
        delete contentHooks[hook.contentField.id];
        return contents;
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.3
     */
    this.removeContentHook = function (inputField) {
        if (!inputField || !inputField.id || !contentHooks[inputField.id])
            return false;
        const hook = contentHooks[inputField.id];
        removeContentHookH(hook);
        // @since 3.2.9.8 - hook.contents -> hook.fields
        $(inputField).removeClass('qtranxs-translatable');
        return true;
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     * Re-create a hook, after a piece of HTML is dynamically replaced with a custom Java script.
     */
    this.refreshContentHook = function (inputField) {
        if (!inputField || !inputField.id)
            return false;
        const hook = contentHooks[inputField.id];
        if (hook)
            removeContentHookH(hook);
        return qtx.addContentHook(inputField);
    };

    /**
     * @since 3.4.6.9
     */
    const getDisplayContentDefaultValue = function (contents) {
        if (contents[qTranslateConfig.language])
            return '(' + qTranslateConfig.language + ') ' + contents[qTranslateConfig.language];
        if (contents[qTranslateConfig.default_language])
            return '(' + qTranslateConfig.default_language + ') ' + contents[qTranslateConfig.default_language];
        for (const lang in contents) {
            if (!contents[lang])
                continue;
            return '(' + lang + ') ' + contents[lang];
        }
        return '';
    };

    /**
     * @since 3.4.6.9
     */
    const completeDisplayContent = function (contents) {
        let default_value = null;
        for (const lang in contents) {
            if (contents[lang])
                continue;
            if (!default_value)
                default_value = getDisplayContentDefaultValue(contents);
            contents[lang] = default_value;
        }
    };

    /**
     * @since 3.2.7
     */
    const displayHookNodes = [];
    const addDisplayHookNode = function (node) {
        if (!node.nodeValue)
            return 0;
        const blocks = qtranxj_get_split_blocks(node.nodeValue);
        if (!blocks || !blocks.length || blocks.length === 1)
            return 0;
        const hook = {};
        hook.nd = node;
        hook.contents = qtranxj_split_blocks(blocks);
        completeDisplayContent(hook.contents);
        node.nodeValue = hook.contents[qTranslateConfig.activeLanguage];
        displayHookNodes.push(hook);
        return 1;
    };

    /**
     * @since 3.2.7
     */
    const displayHookAttrs = [];
    const addDisplayHookAttr = function (node, attr) {
        if (!node.hasAttribute(attr)) return 0;
        const value = node.getAttribute(attr);
        const blocks = qtranxj_get_split_blocks(value);
        if (!blocks || !blocks.length || blocks.length === 1)
            return 0;
        const hook = {};
        hook.nd = node;
        hook.attr = attr;
        hook.contents = qtranxj_split_blocks(blocks);
        completeDisplayContent(hook.contents);
        node.setAttribute(attr, hook.contents[qTranslateConfig.activeLanguage]);
        displayHookAttrs.push(hook);
        return 1;
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.2.7 switched to use of nodeValue instead of innerHTML.
     */
    this.addDisplayHook = function (elem) {
        if (!elem || !elem.tagName)
            return 0;
        switch (elem.tagName) {
            case 'TEXTAREA':
                return 0;
            case 'INPUT':
                if (elem.type === 'submit' && elem.value) {
                    return addDisplayHookAttr(elem, 'value');
                }
                return 0;
            default:
                break;
        }

        let nbHooks = 0;
        if (elem.childNodes && elem.childNodes.length) {
            for (let i = 0; i < elem.childNodes.length; ++i) {
                const node = elem.childNodes[i];
                switch (node.nodeType) {
                    // http://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-1950641247
                    case 1: // ELEMENT_NODE
                        nbHooks += qtx.addDisplayHook(node);
                        break;
                    case 2: // ATTRIBUTE_NODE
                    case 3: // TEXT_NODE
                        nbHooks += addDisplayHookNode(node);
                        break;
                    default:
                        break;
                }
            }
        }
        return nbHooks;
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.0
     */
    this.addDisplayHookById = function (id) {
        return qtx.addDisplayHook(document.getElementById(id));
    };

    const updateTinyMCE = function (hook) {
        let text = hook.contentField.value;
        if (hook.wpautop && window.switchEditors) {
            text = window.switchEditors.wpautop(text);
        }
        hook.mce.setContent(text, {format: 'html'});
    };

    const onTabSwitch = function (lang) {
        storeEditLanguage(lang);

        for (let i = displayHookNodes.length; --i >= 0;) {
            const hook = displayHookNodes[i];
            if (hook.nd.parentNode) {
                hook.nd.nodeValue = hook.contents[lang]; // IE gets upset here if node was removed
            } else {
                displayHookNodes.splice(i, 1); // node was removed by some other function
            }
        }
        for (let i = displayHookAttrs.length; --i >= 0;) {
            const hook = displayHookAttrs[i];
            if (hook.nd.parentNode) {
                hook.nd.setAttribute(hook.attr, hook.contents[lang]);
            } else {
                displayHookAttrs.splice(i, 1); // node was removed by some other function
            }
        }
        if (qTranslateConfig.RAW)
            return;
        for (const key in contentHooks) {
            const hook = contentHooks[key];
            const mce = hook.mce && !hook.mce.hidden;
            if (mce) {
                hook.mce.save({format: 'html'});
            }

            const text = hook.contentField.value.trim();
            const blocks = qtranxj_get_split_blocks(text);
            if (!blocks || blocks.length <= 1) {
                // value is not ML, switch it to other language
                hook.fields[hook.lang].value = text;
                hook.lang = lang;
                const value = hook.fields[hook.lang].value;
                if (hook.contentField.placeholder && value !== '') {
                    // since 3.2.7
                    hook.contentField.placeholder = '';
                }
                hook.contentField.value = value;
                if (mce) {
                    updateTinyMCE(hook);
                }
            } else {
                // value is ML, fill out values per language
                const contents = qtranxj_split_blocks(blocks);
                for (const langField in hook.fields) {
                    hook.fields[langField].value = contents[langField];
                }
                hook.lang = lang;
            }
        }
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.0
     */
    this.addDisplayHooks = function (elems) {
        for (let i = 0; i < elems.length; ++i) {
            const e = elems[i];
            qtx.addDisplayHook(e);
        }
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.4.7
     */
    this.addDisplayHookAttrs = function (elem, attrs) {
        for (let j = 0; j < attrs.length; ++j) {
            const a = attrs[j];
            addDisplayHookAttr(elem, a);
        }
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.4.7
     */
    this.addDisplayHooksAttrs = function (elems, attrs) {
        for (let i = 0; i < elems.length; ++i) {
            const e = elems[i];
            qtx.addDisplayHookAttrs(e, attrs);
        }
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.3
     */
    this.addDisplayHooksByClass = function (name, container) {
        const elems = container.getElementsByClassName(name);
        qtx.addDisplayHooks(elems);
    };

    /**
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     * @since 3.3
     */
    this.addDisplayHooksByTagInClass = function (name, tag, container) {
        const elems = container.getElementsByClassName(name);
        for (let i = 0; i < elems.length; ++i) {
            const elem = elems[i];
            const items = elem.getElementsByTagName(tag);
            qtx.addDisplayHooks(items);
        }
    };


    /**
     * adds custom hooks from configuration
     * @since 3.1-b2 - renamed to addCustomContentHooks, since addContentHooks used in qTranslateConfig.js
     * @since 3.0 - addContentHooks
     */
    this.addCustomContentHooks = function () {
        for (let i = 0; i < qTranslateConfig.custom_fields.length; ++i) {
            const fieldName = qTranslateConfig.custom_fields[i];
            qtx.addContentHookByIdName(fieldName);
        }
        for (let i = 0; i < qTranslateConfig.custom_field_classes.length; ++i) {
            const className = qTranslateConfig.custom_field_classes[i];
            qtx.addContentHooksByClass(className);
        }
        if (qTranslateConfig.LSB)
            qtx.addContentHooksTinyMCE();
    };

    /**
     * adds translatable hooks for fields marked with classes
     * i18n-multilingual
     * i18n-multilingual-curly
     * i18n-multilingual-term
     * i18n-multilingual-slug
     * i18n-multilingual-display
     * @since 3.4
     */
    const addMultilingualHooks = function () {
        $('.i18n-multilingual').each(function (i, e) {
            qtx.addContentHook(e, '[');
        });
        $('.i18n-multilingual-curly').each(function (i, e) {
            qtx.addContentHook(e, '{');
        });
        $('.i18n-multilingual-term').each(function (i, e) {
            qtx.addContentHook(e, 'term');
        });
        $('.i18n-multilingual-slug').each(function (i, e) {
            qtx.addContentHook(e, 'slug');
        });
        $('.i18n-multilingual-display').each(function (i, e) {
            qtx.addDisplayHook(e);
        });
    };

    /**
     * Parses page configuration, loaded in qtranxf_get_admin_page_config_post_type.
     * @since 3.1-b2
     */
    const addPageHooks = function (pageConfigForms) {
        for (const formId in pageConfigForms) {
            const formConfig = pageConfigForms[formId];
            let form;
            if (formConfig.form) {
                if (formConfig.form.id) {
                    form = document.getElementById(formConfig.form.id);
                } else if (formConfig.form.jquery) {
                    form = $(formConfig.form.jquery);
                } else if (formConfig.form.name) {
                    const elms = document.getElementsByName(formConfig.form.name);
                    if (elms && elms.length) {
                        form = elms[0];
                    }
                }
            } else {
                form = document.getElementById(formId);
            }
            if (!form) {
                form = getWrapForm();
                if (!form)
                    form = document;
            }
            for (const handle in formConfig.fields) {
                const field = formConfig.fields[handle];
                let containers = [];
                if (field.container_id) {
                    const container = document.getElementById(field.container_id);
                    if (container)
                        containers.push(container);
                } else if (field.container_jquery) {
                    containers = $(field.container_jquery);
                } else if (field.container_class) {
                    containers = document.getElementsByClassName(field.container_class);
                } else {// if(form){
                    containers.push(form);
                }
                const sep = field.encode;
                switch (sep) {
                    case 'none':
                        break;
                    case 'display':
                        if (field.jquery) {
                            for (let i = 0; i < containers.length; ++i) {
                                const container = containers[i];
                                const fields = $(container).find(field.jquery);
                                if (field.attrs) {
                                    qtx.addDisplayHooksAttrs(fields, field.attrs);
                                } else {
                                    qtx.addDisplayHooks(fields);
                                }
                            }
                        } else {
                            const id = field.id ? field.id : handle;
                            const element = document.getElementById(id);
                            if (field.attrs) {
                                qtx.addDisplayHookAttrs(element, field.attrs);
                            } else {
                                qtx.addDisplayHook(element);
                            }
                        }
                        break;
                    case '[': // b - bracket
                    case '<': // c - comment
                    case '{': // s - swirly/curly bracket
                    case 'byline':
                    default:
                        if (field.jquery) {
                            for (let i = 0; i < containers.length; ++i) {
                                const container = containers[i];
                                const fields = $(container).find(field.jquery);
                                qtx.addContentHooks(fields, sep, field.name);
                            }
                        } else {
                            const id = field.id ? field.id : handle;
                            qtx.addContentHookById(id, sep, field.name);
                        }
                        break;
                }
            }
        }
    };

    /** Link a TinyMCE editor with translatable content. The editor should be initialized for TinyMCE. */
    const setEditorHooks = function (editor) {
        if (!editor.id)
            return;
        const hook = contentHooks[editor.id];
        if (!hook)
            return;
        if (hook.mce) {
            return;  // already initialized for qTranslate
        }
        hook.mce = editor;

        /**
         * Highlighting the translatable fields
         * @since 3.2-b3
         */
        editor.getContainer().className += ' qtranxs-translatable';
        editor.getElement().className += ' qtranxs-translatable';

        let updateTinyMCEonInit = hook.updateTinyMCEonInit;
        if (updateTinyMCEonInit == null) {
            // 'tmce-active' or 'html-active' was not provided on the wrapper
            const textEditor = editor.getContent({format: 'html'}).replace(/\s+/g, '');
            const textHook = hook.contentField.value.replace(/\s+/g, '');
            /**
             * @since 3.2.9.8 - this is an ugly trick.
             * Before this version, it was working relying on properly timed synchronisation of the page loading process,
             * which did not work correctly in some browsers like IE or MAC OS, for example.
             * Now, function addContentHooksTinyMCE is called in the footer scripts, before TinyMCE initialization, and it always sets
             * tinyMCEPreInit.mceInit, which causes to call this function, setEditorHooks, on TinyMCE initialization of each editor.
             * However, function setEditorHooks gets invoked in two ways:
             *
             * 1. On page load, when Visual mode is initially on.
             *      In this case we need to apply updateTinyMCE, which possibly applies wpautop.
             *      Without q-X, WP applies wpautop in this case in php code in /wp-includes/class-wp-editor.php,
             *      function 'editor', line "add_filter('the_editor_content', 'wp_richedit_pre');".
             *      q-X disables this call in 'function qtranxf_the_editor',
             *      since wpautop does not work correctly on multilingual values, and there is no filter to adjust its behaviour.
             *      So, here we have to apply back wpautop to single-language value, which is achieved
             *      with a call to updateTinyMCE(hook) below.
             *
             * 2. When user switches to Visual mode for the first time from a page, which was initially loaded in Text mode.
             *      In this case, wpautop gets applied internally inside TinyMCE, and we do not need to call updateTinyMCE(hook) below.
             *
             * We could not figure out a good way to distinct within this function which way it was called,
             * except this tricky comparison on the next line.
             *
             * If somebody finds out a better way, please let us know at https://github.com/qtranslate/qtranslate-xt/issues/.
             */
            updateTinyMCEonInit = textEditor !== textHook;
        }
        if (updateTinyMCEonInit) {
            updateTinyMCE(hook);
        }
        return hook;
    }

    /** Sets hooks on HTML-loaded TinyMCE editors via tinyMCEPreInit.mceInit. */
    this.addContentHooksTinyMCE = function () {
        if (!window.tinyMCEPreInit || !window.tinyMCE) {
            return;
        }
        for (const key in contentHooks) {
            const hook = contentHooks[key];
            if (hook.contentField.tagName !== 'TEXTAREA' || hook.mce || hook.mceInit || !tinyMCEPreInit.mceInit[key])
                continue;
            hook.mceInit = tinyMCEPreInit.mceInit[key];
            if (hook.mceInit.wpautop) {
                hook.wpautop = hook.mceInit.wpautop;
                const wrappers = tinymce.DOM.select('#wp-' + key + '-wrap');
                if (wrappers && wrappers.length) {
                    hook.wrapper = wrappers[0];
                    if (hook.wrapper) {
                        if (tinymce.DOM.hasClass(hook.wrapper, 'tmce-active'))
                            hook.updateTinyMCEonInit = true;
                        if (tinymce.DOM.hasClass(hook.wrapper, 'html-active'))
                            hook.updateTinyMCEonInit = false;
                        // otherwise hook.updateTinyMCEonInit stays undetermined
                    }
                }
            } else {
                hook.updateTinyMCEonInit = false;
            }
            tinyMCEPreInit.mceInit[key].init_instance_callback = function (editor) {
                setEditorHooks(editor);
            }
        }
    };

    /** Adds more TinyMCE editors, which may have been initialized dynamically. */
    this.loadAdditionalTinyMceHooks = function () {
        if (window.tinyMCE) {
            tinyMCE.get().forEach(function (editor) {
                setEditorHooks(editor);
            });
        }
    };

    if (!qTranslateConfig.onTabSwitchFunctions)
        qTranslateConfig.onTabSwitchFunctions = [];
    if (!qTranslateConfig.onTabSwitchFunctionsSave)
        qTranslateConfig.onTabSwitchFunctionsSave = [];
    if (!qTranslateConfig.onTabSwitchFunctionsLoad)
        qTranslateConfig.onTabSwitchFunctionsLoad = [];

    this.addLanguageSwitchListener = function (func) {
        qTranslateConfig.onTabSwitchFunctions.push(func);
    };

    /**
     * @since 3.2.9.8.6
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     * The function passed will be called when user presses one of the Language Switching Buttons
     * before the content of all fields hooked is replaced with an appropriate language.
     * Two arguments are supplied:
     * - two-letter language code of currently active language from which the edit language is being switched.
     * - the language code to which the edit language is being switched.
     * The value of "this" is set to the only global instance of qTranslateX object.
     */
    this.addLanguageSwitchBeforeListener = function (func) {
        qTranslateConfig.onTabSwitchFunctionsSave.push(func);
    };

    /**
     * @since 3.3.2
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     * Delete handler previously added by function addLanguageSwitchBeforeListener.
     */
    this.delLanguageSwitchBeforeListener = function (func) {
        for (let i = 0; i < qTranslateConfig.onTabSwitchFunctionsSave.length; ++i) {
            const funcSave = qTranslateConfig.onTabSwitchFunctionsSave[i];
            if (funcSave !== func)
                continue;
            qTranslateConfig.onTabSwitchFunctionsSave.splice(i, 1);
            return;
        }
    };

    /**
     * @since 3.2.9.8.6
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     * The function passed will be called when user presses one of the Language Switching Buttons
     * after the content of all fields hooked is replaced with an appropriate language.
     * Two arguments are supplied:
     * - two-letter language code of active language to which the edit language is already switched.
     * - the language code from which the edit language is being switched.
     * The value of "this" is set to the only global instance of qTranslateX object.
     */
    this.addLanguageSwitchAfterListener = function (func) {
        qTranslateConfig.onTabSwitchFunctionsLoad.push(func);
    };

    /**
     * @since 3.3.2
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     * Delete handler previously added by function addLanguageSwitchAfterListener.
     */
    this.delLanguageSwitchAfterListener = function (func) {
        for (let i = 0; i < qTranslateConfig.onTabSwitchFunctionsLoad.length; ++i) {
            const funcLoad = qTranslateConfig.onTabSwitchFunctionsLoad[i];
            if (funcLoad !== func)
                continue;
            qTranslateConfig.onTabSwitchFunctionsLoad.splice(i, 1);
            return;
        }
    };

    /**
     * @since 3.2.9.8.9
     * Designed as interface for other plugin integration. The documentation is available at
     * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
     *
     */
    this.enableLanguageSwitchingButtons = function (on) {
        const display = on ? 'block' : 'none';
        for (const lang in qTranslateConfig.tabSwitches) {
            const tabSwitches = qTranslateConfig.tabSwitches[lang];
            for (let i = 0; i < tabSwitches.length; ++i) {
                const tabSwitchParent = tabSwitches[i].parentElement;
                tabSwitchParent.style.display = display;
                break;
            }
            break;
        }
    };

    const getWrapForm = function () {
        const wraps = document.getElementsByClassName('wrap');
        for (let i = 0; i < wraps.length; ++i) {
            const wrap = wraps[i];
            const forms = wrap.getElementsByTagName('form');
            if (forms.length)
                return forms[0];
        }
        const forms = document.getElementsByTagName('form');
        if (forms.length === 1)
            return forms[0];
        for (let i = 0; i < forms.length; ++i) {
            const form = forms[i];
            const wraps = form.getElementsByClassName('wrap');
            if (wraps.length)
                return form;
        }
        return null;
    };

    if (typeof (pg.addContentHooks) == "function")
        pg.addContentHooks(this);

    if (qTranslateConfig.page_config && qTranslateConfig.page_config.forms)
        addPageHooks(qTranslateConfig.page_config.forms);

    addMultilingualHooks();

    if (!displayHookNodes.length && !displayHookAttrs.length && !Object.keys(contentHooks).length) {
        return;
    }

    this.onLoadLanguage = function (lang, langFrom) {
        const onTabSwitchFunctionsLoad = qTranslateConfig.onTabSwitchFunctionsLoad;
        for (let i = 0; i < onTabSwitchFunctionsLoad.length; ++i) {
            onTabSwitchFunctionsLoad[i].call(qTranslateConfig.qtx, lang, langFrom);
        }
    };

    /**
     * former switchTab
     * @since 3.3.2
     */
    this.switchActiveLanguage = function (lang) {
        if (qTranslateConfig.activeLanguage === lang) {
            return;
        }
        if (qTranslateConfig.activeLanguage) {
            let ok2switch = true;
            const onTabSwitchFunctionsSave = qTranslateConfig.onTabSwitchFunctionsSave;
            for (let i = 0; i < onTabSwitchFunctionsSave.length; ++i) {
                const ok = onTabSwitchFunctionsSave[i].call(qTranslateConfig.qtx, qTranslateConfig.activeLanguage, lang);
                if (ok === false)
                    ok2switch = false;
            }
            if (!ok2switch)
                return; // cancel button switch, if one of onTabSwitchFunctionsSave returned 'false'

            const tabSwitches = qTranslateConfig.tabSwitches[qTranslateConfig.activeLanguage];
            for (let i = 0; i < tabSwitches.length; ++i) {
                tabSwitches[i].classList.remove(qTranslateConfig.lsb_style_active_class);
                $(tabSwitches[i]).find('.button').removeClass('active');
            }
        }

        const langFrom = qTranslateConfig.activeLanguage;
        qTranslateConfig.activeLanguage = lang;
        $('input[name="qtranslate-edit-language"]').val(lang);

        {
            const tabSwitches = qTranslateConfig.tabSwitches[qTranslateConfig.activeLanguage];
            for (let i = 0; i < tabSwitches.length; ++i) {
                tabSwitches[i].classList.add(qTranslateConfig.lsb_style_active_class);
                $(tabSwitches[i]).find('.button').addClass('active');
            }
        }
        const onTabSwitchFunctions = qTranslateConfig.onTabSwitchFunctions;
        for (let i = 0; i < onTabSwitchFunctions.length; ++i) {
            onTabSwitchFunctions[i].call(qTranslateConfig.qtx, lang, langFrom);
        }
        qtx.onLoadLanguage(lang, langFrom);
    };

    this.clickSwitchLanguage = function () {
        const tabSwitch = $(this).hasClass('button') ? this.parentNode : this;
        const lang = tabSwitch.lang;
        if (!lang) {
            alert('qTranslate-XT: This should not have happened: Please, report this incident to the developers: !lang');
            return;
        }
        if ($('.qtranxs-lang-switch-wrap').hasClass('copying')) {
            qtx.copyContentFrom(lang);
            $(tabSwitch).find('.button').blur();	// remove focus of source language in case of layout with button
            $('.qtranxs-lang-switch-wrap').removeClass('copying');
            $('.qtranxs-lang-copy .button').removeClass('active');
        } else {
            qtx.switchActiveLanguage(lang);
        }
    };

    this.toggleCopyFrom = function () {
        $('.qtranxs-lang-switch-wrap').toggleClass('copying');
        $('.qtranxs-lang-copy .button').toggleClass('active');
        // store or restore original title according to current mode (copy or switch)
        if ($('.qtranxs-lang-switch-wrap').hasClass('copying')) {
            $('.qtranxs-lang-switch').each(function () {
                $(this).attr('orig-title', $(this).attr('title'));
                if ($(this).attr('lang') === qTranslateConfig.activeLanguage)
                    $(this).attr('title', qTranslateConfig.strings.CopyFromAlt);
                else
                    $(this).attr('title', qTranslateConfig.strings.CopyFrom + ' [:' + $(this).attr('lang') + ']');
            });
        } else {
            $('.qtranxs-lang-switch').each(function () {
                $(this).attr('title', $(this).attr('orig-title'));
            });
        }
    };

    this.copyContentFrom = function (langFrom) {
        const lang = qTranslateConfig.activeLanguage;
        let changed = false;
        for (const key in contentHooks) {
            const hook = contentHooks[key];
            const mce = hook.mce && !hook.mce.hidden;
            let value = mce ? hook.mce.getContent({format: 'html'}) : hook.contentField.value;
            if (value)
                continue; // do not overwrite existent content
            value = hook.fields[langFrom].value;
            if (!value)
                continue;
            hook.contentField.value = value;
            if (mce)
                updateTinyMCE(hook);
            changed = true;
        }
        if (changed)
            qtx.onLoadLanguage(lang, langFrom);
    };

    /**
     * @since 3.3.2
     */
    this.createSetOfLSBwith = function (lsb_style_extra_wrap_classes) {
        const langSwitchWrap = qtranxj_ce('ul', {className: 'qtranxs-lang-switch-wrap ' + lsb_style_extra_wrap_classes});
        const langs = qTranslateConfig.language_config;
        if (!qTranslateConfig.tabSwitches)
            qTranslateConfig.tabSwitches = {};
        for (const lang in langs) {
            const lang_conf = langs[lang];
            const flag_location = qTranslateConfig.flag_location;
            const li_title = qTranslateConfig.strings.ShowIn + lang_conf.admin_name + ' [:' + lang + ']';
            const tabSwitch = qtranxj_ce('li', {
                lang: lang,
                className: 'qtranxs-lang-switch qtranxs-lang-switch-' + lang,
                title: li_title,
                onclick: qtx.clickSwitchLanguage
            }, langSwitchWrap);
            let tabItem = tabSwitch;
            if (qTranslateConfig.lsb_style_subitem === 'button') {
                // reuse WordPress secondary button
                tabItem = qtranxj_ce('button', {className: 'button button-secondary', type: 'button'}, tabSwitch);
            }
            qtranxj_ce('img', {src: flag_location + lang_conf.flag}, tabItem);
            qtranxj_ce('span', {innerHTML: lang_conf.name}, tabItem);
            if (qTranslateConfig.activeLanguage === lang) {
                tabSwitch.classList.add(qTranslateConfig.lsb_style_active_class);
                $(tabSwitch).find('.button').addClass('active');
            }
            if (!qTranslateConfig.tabSwitches[lang])
                qTranslateConfig.tabSwitches[lang] = [];
            qTranslateConfig.tabSwitches[lang].push(tabSwitch);
        }
        if (!qTranslateConfig.hide_lsb_copy_content) {
            const tab = qtranxj_ce('li', {className: 'qtranxs-lang-copy'}, langSwitchWrap);
            const btn = qtranxj_ce('button', {
                className: 'button button-secondary',
                type: 'button',
                title: qTranslateConfig.strings.CopyFromAlt,
                onclick: qtx.toggleCopyFrom
            }, tab);
            qtranxj_ce('span', {innerHTML: qTranslateConfig.strings.CopyFrom}, btn);
        }
        return langSwitchWrap;
    };

    /**
     * @since 3.4.8
     */
    this.createSetOfLSB = function () {
        return qtx.createSetOfLSBwith(qTranslateConfig.lsb_style_wrap_class + ' widefat');
    };

    const setupMetaBoxLSB = function () {
        const metaBox = document.getElementById('qtranxs-meta-box-lsb');
        if (!metaBox)
            return;

        const insideElems = metaBox.getElementsByClassName('inside');
        if (!insideElems.length)
            return; // consistency check in case WP did some changes

        metaBox.className += ' closed';
        $(metaBox).find('.hndle').remove(); // original h3 element is replaced with span below

        const span = document.createElement('span');
        metaBox.insertBefore(span, insideElems[0]);
        span.className = 'hndle ui-sortable-handle';

        const langSwitchWrap = qtx.createSetOfLSBwith(qTranslateConfig.lsb_style_wrap_class);
        span.appendChild(langSwitchWrap);
        $('#qtranxs-meta-box-lsb .hndle').unbind('click.postboxes');
    };

    if (qTranslateConfig.LSB) {
        // additional initialization
        this.addContentHooksTinyMCE();
        setupMetaBoxLSB();

        // create sets of LSB
        const anchors = [];
        if (qTranslateConfig.page_config && qTranslateConfig.page_config.anchors) {
            for (const id in qTranslateConfig.page_config.anchors) {
                const anchor = qTranslateConfig.page_config.anchors[id];
                const target = document.getElementById(id);
                if (target) {
                    anchors.push({target: target, where: anchor.where});
                } else if (anchor.jquery) {
                    const targets = $(anchor.jquery);
                    for (let i = 0; i < targets.length; ++i) {
                        const target = targets[i];
                        anchors.push({target: target, where: anchor.where});
                    }
                }
            }
        }
        if (!anchors.length) {
            let target = pg.langSwitchWrapAnchor;
            if (!target) {
                target = getWrapForm();
            }
            if (target) anchors.push({target: target, where: 'before'});
        }
        for (let i = 0; i < anchors.length; ++i) {
            const anchor = anchors[i];
            if (!anchor.where || anchor.where.indexOf('before') >= 0) {
                const langSwitchWrap = qtx.createSetOfLSB();
                anchor.target.parentNode.insertBefore(langSwitchWrap, anchor.target);
            }
            if (anchor.where && anchor.where.indexOf('after') >= 0) {
                const langSwitchWrap = qtx.createSetOfLSB();
                anchor.target.parentNode.insertBefore(langSwitchWrap, anchor.target.nextSibling);
            }
            if (anchor.where && anchor.where.indexOf('first') >= 0) {
                const langSwitchWrap = qtx.createSetOfLSB();
                anchor.target.insertBefore(langSwitchWrap, anchor.target.firstChild);
            }
            if (anchor.where && anchor.where.indexOf('last') >= 0) {
                const langSwitchWrap = qtx.createSetOfLSB();
                anchor.target.insertBefore(langSwitchWrap, null);
            }
        }

        /**
         * @since 3.2.4 Synchronization of multiple sets of Language Switching Buttons
         */
        this.addLanguageSwitchListener(onTabSwitch);
        if (pg.onTabSwitch) {
            this.addLanguageSwitchListener(pg.onTabSwitch);
        }
    }
};

/**
 * Designed as interface for other plugin integration. The documentation is available at
 * https://github.com/qtranslate/qtranslate-xt/wiki/Integration-Guide
 *
 * qTranslateX instance is saved in global variable qTranslateConfig.qtx,
 * which can be used by theme or plugins to dynamically change content hooks.
 *
 * Note: be sure to enqueue this script before using it in other plugin (!)
 *
 * @since 3.4
 */
qTranslateConfig.js.get_qtx = function () {
    if (!qTranslateConfig.qtx)
        qTranslateConfig.qtx = new qTranslateX(qTranslateConfig.js);
    return qTranslateConfig.qtx;
};

// With jQuery3 ready handlers fire asynchronously and may be fired after load.
// See: https://github.com/jquery/jquery/issues/3194
$(window).on('load', function () {
    // qtx may already be initialized (see 'wp_tiny_mce_init' for the Classic Editor)
    const qtx = qTranslateConfig.js.get_qtx();
    // Setup hooks for additional TinyMCE editors initialized dynamically
    qtx.loadAdditionalTinyMceHooks();
});
