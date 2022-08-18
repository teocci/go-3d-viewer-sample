/**
 * Parse an FBX file in ASCII format
 *
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-18
 */
import FBXTree from './fbx-tree.js'

export default class TextParser {
    getPrevNode() {
        return this.nodeStack[this.currentIndent - 2]
    }

    getCurrentNode() {
        return this.nodeStack[this.currentIndent - 1]
    }

    getCurrentProp() {
        return this.currentProp
    }

    pushStack(node) {
        this.nodeStack.push(node)
        this.currentIndent += 1
    }

    popStack() {
        this.nodeStack.pop()
        this.currentIndent -= 1
    }

    setCurrentProp(val, name) {
        this.currentProp = val
        this.currentPropName = name
    }

    parse(text) {
        this.currentIndent = 0
        this.allNodes = new FBXTree()
        this.nodeStack = []
        this.currentProp = []
        this.currentPropName = ''

        const scope = this
        const split = text.split(/[\r\n]+/)

        split.forEach(function (line, i) {
            const matchComment = line.match(/^[\s\t]*;/)
            const matchEmpty = line.match(/^[\s\t]*$/)

            if (matchComment || matchEmpty) return

            const matchBeginning = line.match('^\\t{' + scope.currentIndent + '}(\\w+):(.*){', '')
            const matchProperty = line.match('^\\t{' + (scope.currentIndent) + '}(\\w+):[\\s\\t\\r\\n](.*)')
            const matchEnd = line.match('^\\t{' + (scope.currentIndent - 1) + '}}')

            if (matchBeginning) {
                scope.parseNodeBegin(line, matchBeginning)
            } else if (matchProperty) {
                scope.parseNodeProperty(line, matchProperty, split[++i])
            } else if (matchEnd) {
                scope.popStack()
            } else if (line.match(/^[^\s\t}]/)) {
                // large arrays are split over multiple lines terminated with a ',' character
                // if this is encountered the line needs to be joined to the previous line
                scope.parseNodePropertyContinued(line)

            }
        })

        return this.allNodes
    }

    parseNodeBegin(line, property) {
        const nodeName = property[1].trim().replace(/^"/, '').replace(/"$/, '')
        const nodeAttrs = property[2].split(',').map(attr => attr.trim().replace(/^"/, '').replace(/"$/, ''))

        const node = {name: nodeName}
        const attrs = this.parseNodeAttr(nodeAttrs)

        const currentNode = this.getCurrentNode()

        // a top node
        if (this.currentIndent === 0) {
            this.allNodes.add(nodeName, node)
        } else { // a subnode
            // if the subnode already exists, append it
            if (nodeName in currentNode) {
                // special case Pose needs PoseNodes as an array
                if (nodeName === 'PoseNode') {
                    currentNode.PoseNode.push(node)
                } else if (currentNode[nodeName].id !== undefined) {
                    currentNode[nodeName] = {}
                    currentNode[nodeName][currentNode[nodeName].id] = currentNode[nodeName]
                }

                if (attrs.id !== '') currentNode[nodeName][attrs.id] = node
            } else if (typeof attrs.id === 'number') {
                currentNode[nodeName] = {}
                currentNode[nodeName][attrs.id] = node
            } else if (nodeName !== 'Properties70') {
                if (nodeName === 'PoseNode') currentNode[nodeName] = [node]
                else currentNode[nodeName] = node
            }
        }

        if (typeof attrs.id === 'number') node.id = attrs.id
        if (attrs.name !== '') node.attrName = attrs.name
        if (attrs.type !== '') node.attrType = attrs.type

        this.pushStack(node)

    }

    parseNodeAttr(attrs) {
        let id = attrs[0]
        if (attrs[0] !== '') {
            id = parseInt(attrs[0])
            if (isNaN(id)) id = attrs[0]
        }

        let name = '', type = ''
        if (attrs.length > 1) {
            name = attrs[1].replace(/^(\w+)::/, '')
            type = attrs[2]
        }

        return {id: id, name: name, type: type}
    }

    parseNodeProperty(line, property, contentLine) {
        let propName = property[1].replace(/^"/, '').replace(/"$/, '').trim()
        let propValue = property[2].replace(/^"/, '').replace(/"$/, '').trim()

        // for special case: base64 image data follows "Content: ," line
        //	Content: ,
        //	 "/9j/4RDaRXhpZgAATU0A..."
        if (propName === 'Content' && propValue === ',') {
            propValue = contentLine.replace(/"/g, '').replace(/,$/, '').trim()
        }

        const currentNode = this.getCurrentNode()
        const parentName = currentNode.name
        if (parentName === 'Properties70') {
            this.parseNodeSpecialProperty(line, propName, propValue)
            return
        }

        // Connections
        if (propName === 'C') {
            const connProps = propValue.split(',').slice(1)
            const from = parseInt(connProps[0])
            const to = parseInt(connProps[1])

            let rest = propValue.split(',').slice(3)
            rest = rest.map(elem => elem.trim().replace(/^"/, ''))

            propName = 'connections'
            propValue = [from, to]
            append(propValue, rest)

            if (currentNode[propName] === undefined) currentNode[propName] = []
        }

        // Node
        if (propName === 'Node') currentNode.id = propValue

        // connections
        if (propName in currentNode && Array.isArray(currentNode[propName])) {
            currentNode[propName].push(propValue)
        } else {
            if (propName !== 'a') currentNode[propName] = propValue
            else currentNode.a = propValue
        }

        this.setCurrentProp(currentNode, propName)

        // convert string to array, unless it ends in ',' in which case more will be added to it
        if (propName === 'a' && propValue.slice(-1) !== ',') {
            currentNode.a = parseNumberArray(propValue)
        }
    }

    parseNodePropertyContinued(line) {
        const currentNode = this.getCurrentNode()
        currentNode.a += line

        // if the line doesn't end in ',' we have reached the end of the property value
        // so convert the string to an array
        if (line.slice(-1) !== ',') {
            currentNode.a = parseNumberArray(currentNode.a)
        }
    }

    // parse "Property70"
    parseNodeSpecialProperty(line, propName, propValue) {
        // split this
        // P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
        // into array like below
        // ["Lcl Scaling", "Lcl Scaling", "", "A", "1,1,1" ]
        const props = propValue.split('",').map(function (prop) {
            return prop.trim().replace(/^\"/, '').replace(/\s/, '_')

        })

        const innerPropName = props[0]
        const innerPropType1 = props[1]
        const innerPropType2 = props[2]
        const innerPropFlag = props[3]
        let innerPropValue = props[4]

        // cast values where needed, otherwise leave as strings
        switch (innerPropType1) {
            case 'int':
            case 'enum':
            case 'bool':
            case 'ULongLong':
            case 'double':
            case 'Number':
            case 'FieldOfView':
                innerPropValue = parseFloat(innerPropValue)
                break

            case 'Color':
            case 'ColorRGB':
            case 'Vector3D':
            case 'Lcl_Translation':
            case 'Lcl_Rotation':
            case 'Lcl_Scaling':
                innerPropValue = parseNumberArray(innerPropValue)
                break

        }

        // CAUTION: these props must append to parent's parent
        this.getPrevNode()[innerPropName] = {
            'type': innerPropType1,
            'type2': innerPropType2,
            'flag': innerPropFlag,
            'value': innerPropValue,
        }

        this.setCurrentProp(this.getPrevNode(), innerPropName)
    }
}