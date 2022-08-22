/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-22
 */
import BaseComponent from '../base/base-component.js'

export default class Spinner extends BaseComponent {
    static TAG = 'spinner'

    constructor(placeholder) {
        super(placeholder)
        this.placeholder = placeholder

        this.initElements()
    }

    initElements() {
        this.placeholder.classList.add(Spinner.TAG)
        this.hide()
    }
}