/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-12
 */

export default class Stats {
    static CURRENT_REVISION = 16

    static MODE_BASIC = 0
    static MODE_PANEL = 1

    static PANEL_TYPE_BASIC = 'basic'
    static PANEL_TYPE_FPS = 'fps'
    static PANEL_TYPE_MS = 'ms'
    static PANEL_TYPE_MB = 'mb'

    static PANEL_TYPES = {
        [Stats.PANEL_TYPE_BASIC]: {
            type: Stats.PANEL_TYPE_BASIC,
            name: 'FPS',
        },
        [Stats.PANEL_TYPE_FPS]: {
            type: Stats.PANEL_TYPE_FPS,
            name: 'FPS',
            fg: '#0ff',
            bg: '#002',
        },
        [Stats.PANEL_TYPE_MS]: {
            type: Stats.PANEL_TYPE_MS,
            name: 'MS',
            fg: '#0f0',
            bg: '#020',
        },
        [Stats.PANEL_TYPE_MB]: {
            type: Stats.PANEL_TYPE_MB,
            name: 'MB',
            fg: '#f08',
            bg: '#201',
        },
    }

    constructor() {
        this.enablePanelMode = false
        this.panelType = Stats.PANEL_TYPE_FPS
        this.panelIndex = 0

        this.container = null
        this.panels = new Map()

        this.start = performance.now()
        this.prevDuration = this.start
        this.frames = 0

        // Backwards Compatibility
        this.domElement = this.container
        this.setMode = this.showPanelByIndex

        this.initElement()
        this.initPanels()

        this.initListener()

        if (this.enablePanelMode) this.showPanel(Stats.PANEL_TYPE_FPS)
        else {
            this.hidePanels()
            this.showPanel(Stats.PANEL_TYPE_BASIC)
        }
    }

    get revision() {
        return Stats.CURRENT_REVISION
    }

    get dom() {
        return this.container
    }

    initElement() {
        const container = document.createElement('div')
        container.classList.add('stats')
        // container.style.cssText = 'position:absolute;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000'

        this.container = container
    }

    initListener() {
        this.container.onclick = e => { this.onClick(e) }
    }

    initPanels() {
        if (!this.enablePanelMode) this.addPanel(this.createBasicPanel(), Stats.PANEL_TYPE_BASIC)

        this.addPanel(this.createPanel(Stats.PANEL_TYPE_FPS), Stats.PANEL_TYPE_FPS)
        this.addPanel(this.createPanel(Stats.PANEL_TYPE_MS), Stats.PANEL_TYPE_MS)

        if (performance && performance.memory) {
            this.addPanel(this.createPanel(Stats.PANEL_TYPE_MB), Stats.PANEL_TYPE_MB)
        }
    }

    createPanel(type) {
        let panel
        switch (type) {
            case Stats.PANEL_TYPE_FPS:
                panel = Stats.PANEL_TYPES[type]

                break
            case Stats.PANEL_TYPE_MS:
                panel = Stats.PANEL_TYPES[type]

                break
            case Stats.PANEL_TYPE_MB:
                panel = Stats.PANEL_TYPES[type]

                break
            default:
                return null
        }

        if (panel != null) return Stats.Panel(panel.name, panel.fg, panel.bg)
    }

    onClick(event) {
        event.preventDefault()
        if (this.enablePanelMode) {
            this.hidePanels()
            this.showPanelByIndex(++this.panelIndex % this.container.children.length)
        }
    }

    addPanel(panel, type) {
        this.container.appendChild(panel.dom)
        this.panels.set(type, panel)
    }

    showPanelByIndex(index) {
        if (!this.enablePanelMode) return

        const panels = this.container.children
        for (let i = 0; i < panels.length; i++) {
            panels[i].style.display = i === index ? 'block' : 'none'
        }

        this.panelIndex = index
    }

    showPanel(type) {
        this.hidePanels()

        const panel = this.panels.get(type)
        panel.dom.style.display = 'block'
    }

    hidePanels() {
        this.panels.forEach(panel => {
            panel.dom.style.display = 'none'
        })
    }

    begin() {
        this.start = performance.now()
    }

    end() {
        this.frames++

        const basicPanel = this.panels.get(Stats.PANEL_TYPE_BASIC) ?? null
        const fpsPanel = this.panels.get(Stats.PANEL_TYPE_FPS)
        const msPanel = this.panels.get(Stats.PANEL_TYPE_MS)
        const memPanel = this.panels.get(Stats.PANEL_TYPE_MB) ?? null

        const duration = performance.now()
        msPanel.update(duration - this.start, 200)
        if (duration >= this.prevDuration + 1e3) {
            fpsPanel.update((this.frames * 1e3) / (duration - this.prevDuration), 100)

            if (basicPanel) {
                basicPanel.update(this.frames * 1e3 / (duration - this.prevDuration))
            }

            this.frames = 0
            this.prevDuration = duration

            if (memPanel) {
                const memUsed = performance.memory.usedJSHeapSize / 1048576
                const memLimit = performance.memory.jsHeapSizeLimit / 1048576
                memPanel.update(memUsed, memLimit)
            }
        }

        return duration
    }

    update() {
        this.start = this.end()
    }

    createBasicPanel() {
        const panel = document.createElement('div')
        const span = document.createElement('span')
        span.textContent = '--'

        panel.appendChild(span)
        panel.innerHTML += ' fps'

        return {
            dom: panel,
            update: val => {
                const el = this.dom.querySelector('span')
                el.textContent = truncate(val, 0)
            },
        }
    }

    static Panel(name, fg, bg) {
        let min = Infinity, max = 0, round = Math.round
        const PR = round(window.devicePixelRatio ?? 1)

        const WIDTH = 80 * PR, HEIGHT = 48 * PR,
            TEXT_X = 3 * PR, TEXT_Y = 2 * PR,
            GRAPH_X = 3 * PR, GRAPH_Y = 15 * PR,
            GRAPH_WIDTH = 74 * PR, GRAPH_HEIGHT = 30 * PR

        const canvas = document.createElement('canvas')
        canvas.width = WIDTH
        canvas.height = HEIGHT
        canvas.style.cssText = 'width:80px;height:48px'

        const context = canvas.getContext('2d')
        context.font = `bold ${(9 * PR)}px Helvetica,Arial,sans-serif`
        context.textBaseline = 'top'

        context.fillStyle = bg
        context.fillRect(0, 0, WIDTH, HEIGHT)

        context.fillStyle = fg
        context.fillText(name, TEXT_X, TEXT_Y)
        context.fillRect(GRAPH_X, GRAPH_Y, GRAPH_WIDTH, GRAPH_HEIGHT)

        context.fillStyle = bg
        context.globalAlpha = 0.9
        context.fillRect(GRAPH_X, GRAPH_Y, GRAPH_WIDTH, GRAPH_HEIGHT)

        return {
            dom: canvas,
            update: (value, maxValue) => {
                min = Math.min(min, value)
                max = Math.max(max, value)

                context.fillStyle = bg
                context.globalAlpha = 1
                context.fillRect(0, 0, WIDTH, GRAPH_Y)

                context.fillStyle = fg
                context.fillText(`${round(value)} ${name} (${round(min)}-${round(max)})`, TEXT_X, TEXT_Y)
                context.drawImage(canvas, GRAPH_X + PR, GRAPH_Y, GRAPH_WIDTH - PR, GRAPH_HEIGHT, GRAPH_X, GRAPH_Y, GRAPH_WIDTH - PR, GRAPH_HEIGHT)
                context.fillRect(GRAPH_X + GRAPH_WIDTH - PR, GRAPH_Y, PR, GRAPH_HEIGHT)

                context.fillStyle = bg
                context.globalAlpha = 0.9
                context.fillRect(GRAPH_X + GRAPH_WIDTH - PR, GRAPH_Y, PR, round((1 - (value / maxValue)) * GRAPH_HEIGHT))
            },
        }
    }
}
