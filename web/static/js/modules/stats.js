/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-12
 */

export default class Stats {
    static CURRENT_REVISION = 16

    constructor() {
        this.mode = 0
        this.container = null

        this.start = performance.now()
        this.prevDuration = this.start
        this.frames = 0

        // Backwards Compatibility
        this.domElement = this.container
        this.setMode = this.showPanel

        this.initElement()
        this.initPanels()

        this.initListener()

        this.showPanel(0)
    }

    get revision() {
        return Stats.CURRENT_REVISION
    }

    get dom() {
        return this.container
    }

    initElement() {
        const container = document.createElement('div')
        container.style.cssText = 'position:absolute;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000'

        this.container = container
    }

    initListener() {
        this.container.onclick = e => { this.onClick(e) }
    }

    initPanels() {
        this.fpsPanel = this.addPanel(Stats.Panel('FPS', '#0ff', '#002'))
        this.msPanel = this.addPanel(Stats.Panel('MS', '#0f0', '#020'))

        if (performance && performance.memory) {
            this.memPanel = this.addPanel(Stats.Panel('MB', '#f08', '#201'))
        }
    }

    onClick(event) {
        event.preventDefault()
        this.showPanel(++this.mode % this.container.children.length)
    }

    addPanel(panel) {
        this.container.appendChild(panel.dom)

        return panel
    }

    showPanel(id) {
        const children = this.container.children
        for (let i = 0; i < children.length; i++) {
            children[i].style.display = i === id ? 'block' : 'none'
        }

        this.mode = id
    }

    begin () {
        this.start = performance.now()
    }

    end () {
        this.frames++

        const duration = performance.now()

        this.msPanel.update(duration - this.start, 200)

        if (duration >= this.prevDuration + 1e3) {
            this.fpsPanel.update((this.frames * 1e3) / (duration - this.prevDuration), 100)

            this.prevDuration = duration
            this.frames = 0

            if (this.memPanel) {
                const memUsed = performance.memory.usedJSHeapSize / 1048576
                const memLimit = performance.memory.jsHeapSizeLimit / 1048576
                this.memPanel.update(memUsed, memLimit)
            }
        }

        return duration
    }

    update () {
        this.start = this.end()
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
        context.font = 'bold ' + (9 * PR) + 'px Helvetica,Arial,sans-serif'
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
            update: (value, maxValue) =>  {
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
