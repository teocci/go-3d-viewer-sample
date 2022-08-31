/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-22
 */
import BaseComponent from '../base/base-component.js'

export default class Notifier extends BaseComponent {
    static TYPE_SUCCESS = 'success'
    static TYPE_FAILURE = 'failure'

    static DEFAULT_TRANSITIONS = {
        WebkitTransition: 'webkitTransitionEnd',
        MozTransition: 'transitionend',
        OTransition: 'otransitionend',
        transition: 'transitionend',
    }

    static DEFAULT_DURATION = 2000

    constructor(placeholder) {
        super(placeholder)
        this.queue = []
        this.logsElement = null
    }

    /**
     * Return the proper transitionend event
     * @return {Object}    Transition type string
     */
    transitionEvent() {
        const el = document.createElement('fakeelement')
        const transitions = Notifier.DEFAULT_TRANSITIONS

        let t, type, supported = false
        for (t in transitions) {
            if (el.style[t] !== undefined) {
                type = transitions[t]
                supported = true
                break
            }
        }

        return {
            type: type,
            supported: supported,
        }
    }

    /**
     * Bind events to elements
     *
     * @param  {Object}   el       HTML Object
     * @param  {Event}    event    Event to attach to element
     * @param  {Function} fn       Callback function
     *
     * @return {undefined}
     */
    bind(el, event, fn) {
        if (typeof el.addEventListener === 'function') {
            el.addEventListener(event, fn, false)
        } else if (el.attachEvent) {
            el.attachEvent('on' + event, fn)
        }
    }

    /**
     * Unbind events to elements
     *
     * @param  {Object}   el       HTML Object
     * @param  {Event}    event    Event to detach to element
     * @param  {Function} fn       Callback function
     *
     * @return {undefined}
     */
    unbind(el, event, fn) {
        if (typeof el.removeEventListener === 'function') {
            el.removeEventListener(event, fn, false)
        } else if (el.detachEvent) {
            el.detachEvent('on' + event, fn)
        }
    }

    createLogs() {
        if (this.logsElement == null) {
            const logs = document.createElement('section')
            logs.id = 'notifier-logs'
            logs.classList.add('notices', 'hidden')
            this.placeholder.appendChild(logs)
            this.logsElement = logs
        }

        // set transition type
        this.transition = this.transitionEvent()
    }

    createNotice(type, msg) {
        const div = document.createElement('div')
        div.classList.add(type, 'notice')
        div.textContent = msg

        this.placeholder.appendChild(div)
        return div
    }

    /**
     * Show a new log message box
     *
     * @param  {String} message    The message passed from the callee
     * @param  {String} type       [Optional] Optional type of log message
     * @param  {Number} wait       [Optional] Time (in ms) to wait before auto-hiding the log
     *
     * @return {Object}
     */
    log(message, type, wait) {
        // check to ensure the alertify dialog element
        // has been successfully created
        const check = () => {
            const logs = this.logsElement
            const config = {
                childList: true,
            }
            const observer = new MutationObserver(mutation => {
                if (mutation.type === 'childList') {
                    console.log({logs})
                }
            })

            observer.observe(logs, config)
            observer.disconnect()
            // if (!this.logsElement || this.logsElement.scrollTop === null) check()
        }
        console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

        // initialize alertify if it hasn't already been done
        this.createLogs()
        check()

        this.logsElement.classList.remove('hidden')

        this.notify(message, type, wait)

        return this
    }

    /**
     * Add new log message
     * If a type is passed, a class name "alertify-log-{type}" will get added.
     * This allows for custom look and feel for various types of notifications.
     *
     * @param  {String} message    The message passed from the callee
     * @param  {String} type       [Optional] Type of log message
     * @param  {Number} wait       [Optional] Time (in ms) to wait before auto-hiding
     *
     * @return {undefined}
     */
    notify(message, type, wait) {
        const notice = document.createElement('article')
        notice.classList.add('notice')
        notice.textContent = message
        if (typeof type === 'string' && type !== '') {
            notice.classList.add(type)
        }
        this.logsElement.appendChild(notice)

        // triggers the CSS animation
        setTimeout(() => {
            notice.classList.add('active')
        }, 50)

        this.close(notice, wait)
    }

    /**
     * Close the log messages
     *
     * @param  {Object} elem    HTML Element of log message to close
     * @param  {Number} wait    [optional] Time (in ms) to wait before automatically hiding the message, if 0 never hide
     *
     * @return {undefined}
     */
    close(elem, wait) {
        const logs = this.logsElement

        // Unary Plus: +"2" === 2
        const timer = wait && !isNaN(wait) ? +wait : Notifier.DEFAULT_DURATION
        const self = this

        let hideElement, transitionDone

        // set click event on log messages
        // this.bind(elem, 'click', () => {
        //     hideElement(elem)
        // })
        elem.onclick = () => {
            hideElement(elem)
        }

        // Hide the dialog box after transition
        // This ensures it doesn't block any element from being clicked
        transitionDone = event => {
            event.stopPropagation()
            // unbind event so function only gets called once
            self.unbind(this, self.transition.type, transitionDone)
            // remove log message
            logs.removeChild(this)
            if (!logs.hasChildNodes()) logs.classList.add('hidden')
        }

        // this sets the hide class to transition out
        // or removes the child if css transitions aren't supported
        hideElement = el => {
            // ensure element exists
            if (typeof el !== 'undefined' && el.parentNode === logs) {
                // whether CSS transition exists
                if (self.transition.supported) {
                    self.bind(el, self.transition.type, transitionDone)
                    el.classList.add('hidden')
                    el.classList.remove('active')
                } else {
                    logs.removeChild(el)
                    if (!logs.hasChildNodes()) logs.classList.add('hidden')
                }
            }
        }
        // never close (until click) if wait is set to 0
        if (wait === 0) return
        // set timeout to auto close the log message
        setTimeout(() => {
            hideElement(elem)
        }, timer)
    }

    // /**
    //  * Show a new log message box
    //  *
    //  * @param  {String} message    The message passed from the callee
    //  * @param  {String} type       [Optional] Optional type of log message
    //  * @param  {Number} wait       [Optional] Time (in ms) to wait before auto-hiding the log
    //  *
    //  * @return {Object}
    //  */
    // notify(message, type, wait) {
    //     const ctx = this
    //     type = type ?? Notifier.TYPE_SUCCESS
    //     const notice = this.createNotice(type, message)
    //     this.show(notice)
    //
    //     setTimeout(() => {
    //         ctx.clear(notice)
    //     })
    // }

    success(msg, wait) {
        wait = wait ?? Notifier.DEFAULT_DURATION
        this.log(msg, Notifier.TYPE_SUCCESS, wait)
    }

    failure(msg, wait) {
        this.log(msg, Notifier.TYPE_FAILURE, wait)
    }
}