/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-22
 */
import BaseListener from './base-listener.js'

export default class BaseComponent extends BaseListener {
    static CHAR_UNDERSCORE = '_'
    static CHAR_HYPHEN = '-'

    static EMPTY_VALUE = BaseComponent.CHAR_HYPHEN

    static replaceUnderscoreToHyphen(tag) {
        return tag.replaceAll(BaseComponent.CHAR_UNDERSCORE, BaseComponent.CHAR_HYPHEN)
    }

    static replaceHyphenToUnderscore(tag) {
        return tag.replaceAll(BaseComponent.CHAR_HYPHEN, BaseComponent.CHAR_UNDERSCORE)
    }

    constructor(element) {
        super()

        this.placeholder = element
    }

    get placeholder() {
        return this.element
    }

    set placeholder(element) {
        this.element = element
    }

    toggle(val) {
        const element = this.dom
        element.classList.toggle('hidden', val)
    }

    show() {
        const element = this.dom
        element.classList.remove('hidden')
    }

    hide() {
        const element = this.dom
        element.classList.add('hidden')
    }

    destroyChildren(element) {
        element = element ?? this.dom
        while (element.firstChild) {
            const lastChild = element.lastChild ?? false
            if (lastChild) element.removeChild(lastChild)
        }
    }

    get dom() {
        return this.placeholder
    }
}