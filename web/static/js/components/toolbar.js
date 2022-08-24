/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-8월-23
 */
import BaseComponent from '../base/base-component.js'

export default class Toolbar extends BaseComponent {
    static TAG = 'toolbar'

    static LISTENER_CAMERA_CONTROL_EVENT = 'on-cc-event'
    static LISTENER_FILE_CONTROL_OPEN_EVENT = 'on-open-event'

    static CAMERA_CONTROL_ROTATE = 'rotate'
    static CAMERA_CONTROL_PAN = 'pan'
    static CAMERA_CONTROL_ZOOM = 'zoom'
    static CAMERA_CONTROL_RESET = 'reset'
    static FILE_CONTROL_OPEN = 'open'

    static CAMERA_CONTROLS = [
        {
            id: Toolbar.CAMERA_CONTROL_ROTATE,
            name: 'Rotate',
            icon: 'fa-arrows-rotate',
        },
        {
            id: Toolbar.CAMERA_CONTROL_PAN,
            name: 'Pan',
            icon: 'fa-arrow-right-arrow-left',
        },
        {
            id: Toolbar.CAMERA_CONTROL_ZOOM,
            name: 'Zoom',
            icon: 'fa-magnifying-glass',
        },
        {
            id: Toolbar.CAMERA_CONTROL_RESET,
            name: 'Reset Camera',
            icon: 'fa-clock-rotate-left',
        },
        {
            id: Toolbar.FILE_CONTROL_OPEN,
            name: 'Open Model',
            icon: 'fa-folder-open',
        },
    ]

    constructor(placeholder) {
        super(placeholder)
        this.placeholder = placeholder

        this.controls = new Map()

        this.initElements()
        this.initListeners()
    }

    initElements() {
        this.placeholder.classList.add(Toolbar.TAG)

        const camControls = document.createElement('div')
        camControls.classList.add('camera-controls')

        const list = document.createElement('ul')
        list.classList.add('list-unstyled')

        for (const control of Toolbar.CAMERA_CONTROLS) {
            const li = document.createElement('li')
            const icon = document.createElement('i')
            icon.classList.add('fa-solid', control.icon, 'fa-fw')
            icon.dataset.cooltip = control.name

            li.appendChild(icon)
            list.appendChild(li)

            this.controls.set(control.id, icon)
        }

        camControls.appendChild(list)
        this.placeholder.appendChild(camControls)

        this.activateControlByKey(Toolbar.CAMERA_CONTROL_ROTATE)
    }

    initListeners() {
        for (const [key, control] of this.controls.entries()) {
            control.onclick = (e) => {
                if (key === Toolbar.FILE_CONTROL_OPEN) {
                    this.callListener(Toolbar.LISTENER_FILE_CONTROL_OPEN_EVENT, e)
                } else this.updateControl(e, key)
            }
        }
    }

    updateControl(e, key) {
        const control = e.target
        if (this.isControlActive(control)) return

        this.deactivateControls()
        this.activateControlByKey(key === Toolbar.CAMERA_CONTROL_RESET ? Toolbar.CAMERA_CONTROL_ROTATE : key)

        this.callListener(Toolbar.LISTENER_CAMERA_CONTROL_EVENT, e, key)
    }

    activateControlByKey(key) {
        const control = this.controls.get(key)
        this.activateControl(control)
    }

    activateControl(control) {
        control.classList.add('active')
    }

    deactivateControlByKey(key) {
        const control = this.controls.get(key)
        this.deactivateControl(control)
    }

    deactivateControl(control) {
        control.classList.remove('active')
    }

    deactivateControls() {
        this.controls.forEach(control => {
            this.deactivateControl(control)
        })
    }

    isControlActive(control) {
        return control.classList.contains('active')
    }
}