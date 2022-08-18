/**
 * NURBS utils
 * See NURBSCurve and NURBSSurface.
 *
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-19
 */

/**
 * Find a knot vector span.
 *
 * @param {number} p : degree
 * @param {*} u : parametric value
 * @param {Array} U : knot vector
 *
 * @return the span
 */
function findSpan(p, u, U) {
    const n = U.length - p - 1

    if (u >= U[n]) return n - 1
    if (u <= U[p]) return p

    let low = p
    let high = n
    let mid = Math.floor((low + high) / 2)

    while (u < U[mid] || u >= U[mid + 1]) {
        u < U[mid] ? high = mid : low = mid
        mid = Math.floor((low + high) / 2)
    }

    return mid
}

/**
 * Calculate basis functions. See The NURBS Book, page 70, algorithm A2.2
 *
 * @param {*} span: span in which u lies
 * @param {*} u: parametric point
 * @param {number} p: degree
 * @param {Array} U: knot vector
 *
 * @return array[p+1] with basis functions values.
 */
function calcBasisFunctions(span, u, p, U) {
    const N = []
    const left = []
    const right = []
    N[0] = 1.0

    for (let j = 1; j <= p; ++j) {
        left[j] = u - U[span + 1 - j]
        right[j] = U[span + j] - u

        let saved = 0.0

        for (let r = 0; r < j; ++r) {
            const rv = right[r + 1]
            const lv = left[j - r]
            const temp = N[r] / (rv + lv)
            N[r] = saved + rv * temp
            saved = lv * temp
        }

        N[j] = saved
    }

    return N
}

/**
 * Calculate B-Spline curve points. See The NURBS Book, page 82, algorithm A3.1.
 *
 * @param {NURBSCurve.degree|number} p: degree of B-Spline
 * @param {Array} U: knot vector
 * @param {*} P : control points (x, y, z, w)
 * @param {*} u : parametric point
 *
 * @return point for given u
 */
function calcBSplinePoint(p, U, P, u) {
    const span = findSpan(p, u, U)
    const N = calcBasisFunctions(span, u, p, U)
    const C = new THREE.Vector4(0, 0, 0, 0)

    for (let j = 0; j <= p; ++j) {
        const point = P[span - p + j]
        const Nj = N[j]
        const wNj = point.w * Nj
        C.x += point.x * wNj
        C.y += point.y * wNj
        C.z += point.z * wNj
        C.w += point.w * Nj
    }

    return C
}

/**
 *Calculate basis functions derivatives. See The NURBS Book, page 72, algorithm A2.3.
 *
 * @param {*} span: span in which u lies
 * @param {*} u: parametric point
 * @param {number} p: degree
 * @param {*} n: number of derivatives to calculate
 * @param {Array} U: knot vector
 *
 * @return array[n+1][p+1] with basis functions derivatives
 */
function calcBasisFunctionDerivatives(span, u, p, n, U) {

    const zeroArr = []
    for (let i = 0; i <= p; ++i) zeroArr[i] = 0.0

    const ders = []
    for (let i = 0; i <= n; ++i) ders[i] = zeroArr.slice(0)

    const ndu = []
    for (let i = 0; i <= p; ++i) ndu[i] = zeroArr.slice(0)

    ndu[0][0] = 1.0

    const left = zeroArr.slice(0)
    const right = zeroArr.slice(0)

    for (let j = 1; j <= p; ++j) {
        left[j] = u - U[span + 1 - j]
        right[j] = U[span + j] - u

        let saved = 0.0

        for (let r = 0; r < j; ++r) {
            const rv = right[r + 1]
            const lv = left[j - r]
            ndu[j][r] = rv + lv

            const temp = ndu[r][j - 1] / ndu[j][r]
            ndu[r][j] = saved + rv * temp
            saved = lv * temp
        }

        ndu[j][j] = saved
    }

    for (let j = 0; j <= p; ++j) {
        ders[0][j] = ndu[j][p]
    }

    for (let r = 0; r <= p; ++r) {
        let s1 = 0
        let s2 = 1

        const a = []
        for (let i = 0; i <= p; ++i) {
            a[i] = zeroArr.slice(0)
        }

        a[0][0] = 1.0

        for (let k = 1; k <= n; ++k) {
            let d = 0.0
            const rk = r - k
            const pk = p - k

            if (r >= k) {
                a[s2][0] = a[s1][0] / ndu[pk + 1][rk]
                d = a[s2][0] * ndu[rk][pk]
            }

            const j1 = (rk >= -1) ? 1 : -rk
            const j2 = (r - 1 <= pk) ? k - 1 : p - r

            for (let j = j1; j <= j2; ++j) {
                a[s2][j] = (a[s1][j] - a[s1][j - 1]) / ndu[pk + 1][rk + j]
                d += a[s2][j] * ndu[rk + j][pk]
            }

            if (r <= pk) {
                a[s2][k] = -a[s1][k - 1] / ndu[pk + 1][r]
                d += a[s2][k] * ndu[r][pk]
            }

            ders[k][r] = d

            const j = s1
            s1 = s2
            s2 = j
        }
    }

    let r = p
    for (let k = 1; k <= n; ++k) {
        for (let j = 0; j <= p; ++j) {
            ders[k][j] *= r
        }

        r *= p - k
    }

    return ders
}

/**
 * Calculate derivatives of a B-Spline. See The NURBS Book, page 93, algorithm A3.2.
 *
 * @param {NURBSCurve.degree|number} p: the degree of the curve
 * @param {Array} U: knot vector
 * @param {Array} P : control points (x, y, z, w)
 * @param {*} u: parametric point
 * @param {number} nd: number of derivatives to calculate
 *
 * @return array[d+1] with derivatives
 */
function calcBSplineDerivatives(p, U, P, u, nd) {
    const du = nd < p ? nd : p
    const CK = []
    const span = findSpan(p, u, U)
    const ND = calcBasisFunctionDerivatives(span, u, p, du, U)
    const PW = []

    for (let i = 0; i < P.length; ++i) {
        const point = P[i].clone()
        const w = point.w

        point.x *= w
        point.y *= w
        point.z *= w

        PW[i] = point
    }

    for (let k = 0; k <= du; ++k) {
        const point = PW[span - p].clone().multiplyScalar(ND[k][0])

        for (let j = 1; j <= p; ++j) {
            point.add(PW[span - p + j].clone().multiplyScalar(ND[k][j]))
        }

        CK[k] = point
    }

    for (let k = du + 1; k <= nd + 1; ++k) {
        CK[k] = new THREE.Vector4(0, 0, 0)
    }

    return CK
}

/**
 * Calculate "K over I"
 *
 * @param {number} k
 * @param {number} i
 *
 * @return k!/(i!(k-i)!)
 */
function calcKoverI(k, i) {
    let nom = 1, denom = 1

    for (let j = 2; j <= k; ++j) nom *= j
    for (let j = 2; j <= i; ++j) denom *= j

    for (let j = 2; j <= k - i; ++j) denom *= j

    return nom / denom
}

/**
 * Calculate derivatives (0-nd) of rational curve. See The NURBS Book, page 127, algorithm A4.2.
 *
 * @param {Array} pwDers: result of function calcBSplineDerivatives
 *
 * @return array with derivatives for rational curve.
 */
function calcRationalCurveDerivatives(pwDers) {
    const n = pwDers.length
    const pDers = []
    const wDers = []

    for (let i = 0; i < n; ++i) {
        const point = pwDers[i]
        pDers[i] = new THREE.Vector3(point.x, point.y, point.z)
        wDers[i] = point.w
    }

    const CK = []
    for (let k = 0; k < n; ++k) {
        const v = pDers[k].clone()
        for (let i = 1; i <= k; ++i) {
            v.sub(CK[k - i].clone().multiplyScalar(calcKoverI(k, i) * wDers[i]))
        }

        CK[k] = v.divideScalar(wDers[0])
    }

    return CK
}

/**
 * Calculate NURBS curve derivatives. See The NURBS Book, page 127, algorithm A4.2.
 *
 * @param {NURBSCurve.degree|number} p: degree
 * @param {Array} U: knot vector
 * @param {HTMLLabelElement.control} P: control points in homogeneous space
 * @param {*} u: parametric points
 * @param {number} nd: number of derivatives
 *
 * @return array with derivatives.
 */
function calcNURBSDerivatives(p, U, P, u, nd) {
    const D = calcBSplineDerivatives(p, U, P, u, nd)
    return calcRationalCurveDerivatives(D)
}

/**
 * Calculate rational B-Spline surface point. See The NURBS Book, page 134, algorithm A4.3.
 *
 * @param {NURBSCurve.degree|number} p: degree of B-Spline surface
 * @param {NURBSCurve.degree|number} q: degree of B-Spline surface
 * @param {Array} U: knot vectors
 * @param {Array} V: knot vectors
 * @param {Array} P: control points (x, y, z, w)
 * @param {*} u: parametric values
 * @param {*} v: parametric values
 * @param target
 *
 * @return point for given (u, v)
 */
function calcSurfacePoint(p, q, U, V, P, u, v, target) {
    const uspan = findSpan(p, u, U)
    const vspan = findSpan(q, v, V)
    const Nu = calcBasisFunctions(uspan, u, p, U)
    const Nv = calcBasisFunctions(vspan, v, q, V)
    const temp = []

    for (let l = 0; l <= q; ++l) {
        temp[l] = new THREE.Vector4(0, 0, 0, 0)
        for (let k = 0; k <= p; ++k) {
            const point = P[uspan - p + k][vspan - q + l].clone()
            const w = point.w
            point.x *= w
            point.y *= w
            point.z *= w
            temp[l].add(point.multiplyScalar(Nu[k]))
        }
    }

    const Sw = new THREE.Vector4(0, 0, 0, 0)
    for (let l = 0; l <= q; ++l) {
        Sw.add(temp[l].multiplyScalar(Nv[l]))
    }

    Sw.divideScalar(Sw.w)
    target.set(Sw.x, Sw.y, Sw.z)
}

export {
    findSpan,
    calcBasisFunctions,
    calcBSplinePoint,
    calcBasisFunctionDerivatives,
    calcBSplineDerivatives,
    calcKoverI,
    calcRationalCurveDerivatives,
    calcNURBSDerivatives,
    calcSurfacePoint,
}