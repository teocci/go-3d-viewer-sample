/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-20
 */

const ch2 = {}
let durl = c => URL.createObjectURL(new Blob([c], {type: 'text/javascript'}))
let cwk = u => new Worker(u)
try {
    URL.revokeObjectURL(durl(''))
} catch (e) {
    // We're in Deno or a very old browser
    durl = c => 'data:application/javascript;charset=UTF-8,' + encodeURI(c)
    // If Deno, this is necessary; if not, this changes nothing
    cwk = u => new Worker(u, {type: 'module'})
}

const wk = (c, id, msg, transfer, cb) => {
    const w = cwk(ch2[id] || (ch2[id] = durl(c)))
    w.onerror = e => cb(e.error, null)
    w.onmessage = e => cb(null, e.data)
    w.postMessage(msg, transfer)

    return w
}

// Aliases for shorter compressed code (most minifers don't do this)
const u8 = Uint8Array, u16 = Uint16Array, u32 = Uint32Array

// Fixed length extra bits
const fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0])

// Fixed distance extra bits
// See fleb note
const fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0])

// Code length index map
const clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15])

/**
 * Get base, reverse index map from extra bits
 *
 * @param eb
 * @param start
 * @returns {[Uint16Array,Uint32Array]}
 */
const freb = (eb, start) => {
    const b = new u16(31)
    for (let i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1]
    }
    // numbers here are at max 18 bits
    const r = new u32(b[30])
    for (let i = 1; i < 30; ++i) {
        for (let j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i
        }
    }

    return [b, r]
}

const _a = freb(fleb, 2), fl = _a[0], revfl = _a[1]

// Ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258
revfl[258] = 28
const _b = freb(fdeb, 0), fd = _b[0], revfd = _b[1]

// Map of value to reverse (assuming 16 bits)
const rev = new u16(32768)
for (let i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    let x = ((i & 0xAAAA) >>> 1) | ((i & 0x5555) << 1)
    x = ((x & 0xCCCC) >>> 2) | ((x & 0x3333) << 2)
    x = ((x & 0xF0F0) >>> 4) | ((x & 0x0F0F) << 4)
    rev[i] = (((x & 0xFF00) >>> 8) | ((x & 0x00FF) << 8)) >>> 1
}

/**
 * Create huffman tree from u8 "map": index -> code length for code index
 * mb (max bits) must be at most 15
 * TODO: optimize/split up?
 *
 * @param cd
 * @param mb: max bits
 * @param r
 * @returns {Uint16Array}
 */
const hMap = (cd, mb, r) => {
    const s = cd.length // length of cd must be 288 (total # of codes)
    const l = new u16(mb) // u16 "map": index -> # of codes with bit length = index
    let i = 0
    for (; i < s; ++i) ++l[cd[i] - 1]

    const le = new u16(mb) // u16 "map": index -> minimum code for bit length = index
    for (i = 0; i < mb; ++i) le[i] = (le[i - 1] + l[i - 1]) << 1

    let co
    if (r) {
        co = new u16(1 << mb) // u16 "map": index -> number of actual bits, symbol for code
        const rvb = 15 - mb // bits to remove for reverser
        for (i = 0; i < s; ++i) {
            if (cd[i]) { // ignore 0 lengths
                const sv = (i << 4) | cd[i] // num encoding both symbol and bits read
                const r_1 = mb - cd[i] // free bits

                let v = le[cd[i] - 1]++ << r_1 // start value
                for (let m = v | ((1 << r_1) - 1); v <= m; ++v) { // m is end value
                    // every 16 bit value starting with the code yields the same result
                    co[rev[v] >>> rvb] = sv
                }
            }
        }
    } else {
        co = new u16(s)
        for (i = 0; i < s; ++i) if (cd[i]) co[i] = rev[le[cd[i] - 1]++] >>> (15 - cd[i])
    }

    return co
}

// fixed length tree
const flt = new u8(288)
for (let i = 0; i < 144; ++i) flt[i] = 8
for (let i = 144; i < 256; ++i) flt[i] = 9
for (let i = 256; i < 280; ++i) flt[i] = 7
for (let i = 280; i < 288; ++i) flt[i] = 8

// fixed distance tree
const fdt = new u8(32)
for (let i = 0; i < 32; ++i) fdt[i] = 5

// fixed length map
const flm = hMap(flt, 9, 0), flrm = hMap(flt, 9, 1)

// fixed distance map
const fdm = hMap(fdt, 5, 0), fdrm = hMap(fdt, 5, 1)

// find max of array
const max = function (a) {
    let m = a[0]
    for (let i = 1; i < a.length; ++i) {
        if (a[i] > m) m = a[i]
    }

    return m
}

// read d, starting at bit p and mask with m
const bits = (d, p, m) => {
    const o = (p / 8) | 0
    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m
}

// read d, starting at bit p continuing for at least 16 bits
const bits16 = (d, p) => {
    const o = (p / 8) | 0
    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7))
}

// get end of byte
const shft = p => ((p / 8) | 0) + (p & 7 && 1)

// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
const slc = (v, s, e) => {
    if (s == null || s < 0) s = 0
    if (e == null || e > v.length) e = v.length

    // can't use .constructor in case user-supplied
    const n = new (v instanceof u16 ? u16 : v instanceof u32 ? u32 : u8)(e - s)
    n.set(v.subarray(s, e))

    return n
}

/**
 * expands raw DEFLATE data
 *
 * @param {Uint8Array} dat
 * @param {Uint8Array} buf
 * @param st
 * @returns {Uint8Array|Uint16Array|Uint8Array}
 */
const inflt = (dat, buf, st) => {
    // source length
    const sl = dat.length
    if (!sl || (st && !st.l && sl < 5)) return buf || new u8(0)

    const noBuf = !buf || st // have to estimate size
    const noSt = !st || st.i // no state
    if (!st) st = {}
    if (!buf) buf = new u8(sl * 3) // Assumes roughly 33% compression ratio average

    // ensure buffer can fit at least l elements
    const cbuf = l => {
        const bl = buf.length
        if (l > bl) { // need to increase size to fit
            // Double or set to necessary, whichever is greater
            const nbuf = new u8(Math.max(bl * 2, l))
            nbuf.set(buf)
            buf = nbuf
        }
    }

    //  last chunk         bitpos           bytes
    let final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n
    const tbts = sl * 8 // total bits
    do {
        if (!lm) {
            st.f = final = bits(dat, pos, 1) // BFINAL - this is only 1 when last chunk is next
            // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
            const type = bits(dat, pos + 1, 3)
            pos += 3
            if (!type) {
                // Go to end of byte boundary
                const s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l
                if (t > sl) {
                    if (noSt) throw 'unexpected EOF'
                    break
                }
                // ensure size
                if (noBuf) cbuf(bt + l)
                // Copy over uncompressed data
                buf.set(dat.subarray(s, t), bt)
                // Get new bitpos, update byte count
                st.b = bt += l
                st.p = pos = t * 8

                continue
            } else if (type === 1) {
                lm = flrm
                dm = fdrm
                lbt = 9
                dbt = 5
            } else if (type === 2) {
                //  literal                            lengths
                const hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4
                const tl = hLit + bits(dat, pos + 5, 31) + 1
                pos += 14
                const ldt = new u8(tl) // length+distance tree

                const clt = new u8(19) // code length tree
                for (let i = 0; i < hcLen; ++i) {
                    // use index map to get real code
                    clt[clim[i]] = bits(dat, pos + i * 3, 7)
                }
                pos += hcLen * 3
                // code lengths bits
                const clb = max(clt), clbmsk = (1 << clb) - 1
                // code lengths map
                const clm = hMap(clt, clb, 1)
                for (let i = 0; i < tl;) {
                    const r = clm[bits(dat, pos, clbmsk)]
                    // bits read
                    pos += r & 15
                    // symbol
                    const s = r >>> 4
                    // code length to copy
                    if (s < 16) {
                        ldt[i++] = s
                    } else {
                        //  copy   count
                        let c = 0, n = 0
                        if (s === 16) {
                            n = 3 + bits(dat, pos, 3)
                            pos += 2
                            c = ldt[i - 1]
                        } else if (s === 17) {
                            n = 3 + bits(dat, pos, 7)
                            pos += 3
                        } else if (s === 18) {
                            n = 11 + bits(dat, pos, 127)
                            pos += 7
                        }

                        while (n--) ldt[i++] = c
                    }
                }

                //         length tree                 distance tree
                const lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit)
                // max length bits
                lbt = max(lt)
                // max dist bits
                dbt = max(dt)
                lm = hMap(lt, lbt, 1)
                dm = hMap(dt, dbt, 1)
            } else throw 'invalid block type'

            if (pos > tbts) {
                if (noSt) throw 'unexpected EOF'
                break
            }
        }

        // Make sure the buffer can hold this + the largest possible addition
        // Maximum chunk size (practically, theoretically infinite) is 2^17;
        if (noBuf) cbuf(bt + 131072)
        const lms = (1 << lbt) - 1, dms = (1 << dbt) - 1
        let lpos = pos
        for (; ; lpos = pos) {
            // bits read, code
            const c = lm[bits16(dat, pos) & lms], sym = c >>> 4
            pos += c & 15
            if (pos > tbts) {
                if (noSt) throw 'unexpected EOF'
                break
            }

            if (!c) throw 'invalid length/literal'
            if (sym < 256) buf[bt++] = sym
            else if (sym === 256) {
                lpos = pos
                lm = null
                break
            } else {
                let add = sym - 254
                // no extra bits needed if less
                if (sym > 264) {
                    const i = sym - 257, b = fleb[i]
                    add = bits(dat, pos, (1 << b) - 1) + fl[i]
                    pos += b
                }

                const d = dm[bits16(dat, pos) & dms], dsym = d >>> 4 // dist
                if (!d) throw 'invalid distance'

                pos += d & 15
                let dt = fd[dsym]
                if (dsym > 3) {
                    const b = fdeb[dsym]
                    dt += bits16(dat, pos) & ((1 << b) - 1)
                    pos += b
                }
                if (pos > tbts) {
                    if (noSt) throw 'unexpected EOF'
                    break
                }
                if (noBuf) cbuf(bt + 131072)

                const end = bt + add
                for (; bt < end; bt += 4) {
                    buf[bt] = buf[bt - dt]
                    buf[bt + 1] = buf[bt + 1 - dt]
                    buf[bt + 2] = buf[bt + 2 - dt]
                    buf[bt + 3] = buf[bt + 3 - dt]
                }
                bt = end
            }
        }

        st.l = lm
        st.p = lpos
        st.b = bt
        if (lm) {
            final = 1
            st.m = lbt
            st.d = dm
            st.n = dbt
        }
    } while (!final)

    return bt === buf.length ? buf : slc(buf, 0, bt)
}

/**
 * Starting at p, write the minimum number of bits that can hold v to d
 *
 * @param d
 * @param p
 * @param v
 */
const wbits = (d, p, v) => {
    v <<= p & 7

    const o = (p / 8) | 0
    d[o] |= v
    d[o + 1] |= v >>> 8
}

/**
 * Starting at p, write the minimum number of bits (>8) that can hold v to d
 *
 * @param d
 * @param p
 * @param v
 */
const wbits16 = (d, p, v) => {
    v <<= p & 7

    const o = (p / 8) | 0
    d[o] |= v
    d[o + 1] |= v >>> 8
    d[o + 2] |= v >>> 16
}

/**
 * Creates code lengths from a frequency table
 *
 * @param d
 * @param mb
 * @returns {[Uint8Array,number]}
 */
const hTree = (d, mb) => {
    // Need extra info to make a tree
    const t = []
    for (let i = 0; i < d.length; ++i) {
        if (d[i]) t.push({s: i, f: d[i]})
    }

    const t2 = t.slice()
    const s = t.length
    if (!s) return [et, 0]

    if (s === 1) {
        const v = new u8(t[0].s + 1)
        v[t[0].s] = 1

        return [v, 1]
    }

    t.sort((a, b) => a.f - b.f)
    // after i2 reaches last ind, will be stopped
    // freq must be greater than the largest possible number of symbols
    t.push({s: -1, f: 25001})

    let l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2
    t[0] = {s: -1, f: l.f + r.f, l: l, r: r}

    // Efficient algorithm from UZIP.js
    // i0 is lookbehind, i2 is lookahead - after processing two low-freq
    // symbols that combined have high freq, will start processing i2
    // (high-freq, non-composite) symbols instead
    // see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/
    while (i1 !== s - 1) {
        l = t[t[i0].f < t[i2].f ? i0++ : i2++]
        r = t[i0 !== i1 && t[i0].f < t[i2].f ? i0++ : i2++]
        t[i1++] = {s: -1, f: l.f + r.f, l: l, r: r}
    }

    let maxSym = t2[0].s
    for (let i = 1; i < s; ++i) {
        if (t2[i].s > maxSym)
            maxSym = t2[i].s
    }

    const tr = new u16(maxSym + 1) // code lengths
    let mbt = ln(t[i1 - 1], tr, 0) // max bits in tree
    if (mbt > mb) {
        // more algorithms from UZIP.js
        // TODO: find out how this code works (debt)
        //    ind    debt
        const left = mbt - mb, cost = 1 << left
        let i = 0, dt = 0
        t2.sort((a, b) => tr[b.s] - tr[a.s] || a.f - b.f)
        for (; i < s; ++i) {
            const i2_1 = t2[i].s
            if (tr[i2_1] > mb) {
                dt += cost - (1 << (mbt - tr[i2_1]))
                tr[i2_1] = mb
            } else break
        }

        dt >>>= left
        while (dt > 0) {
            const i2_2 = t2[i].s
            if (tr[i2_2] < mb) dt -= 1 << (mb - tr[i2_2]++ - 1)
            else ++i
        }

        for (; i >= 0 && dt; --i) {
            const i2_3 = t2[i].s
            if (tr[i2_3] === mb) {
                --tr[i2_3]
                ++dt
            }
        }
        mbt = mb
    }

    return [new u8(tr), mbt]
}

/**
 * Get the max length and assign length codes
 *
 * @param n: HuffNode
 * @param {Uint16Array} l
 * @param {number} d
 * @returns {number}
 */
const ln = (n, l, d) => n.s === -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : (l[n.s] = d)

/**
 * Length codes generation
 *
 * @param c
 * @returns {[Uint16Array,*]}
 */
const lc = c => {
    let s = c.length
    // Note that the semicolon was intentional
    while (s && !c[--s]) {
    }

    const cl = new u16(++s)
    //  ind      streak
    let cli = 0, cls = 1, cln = c[0]
    const w = v => {
        cl[cli++] = v
    }

    for (let i = 1; i <= s; ++i) {
        if (c[i] === cln && i !== s) ++cls
        else {
            if (!cln && cls > 2) {
                for (; cls > 138; cls -= 138) w(32754)
                if (cls > 2) {
                    w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305)
                    cls = 0
                }
            } else if (cls > 3) {
                w(cln)
                --cls
                for (; cls > 6; cls -= 6) w(8304)
                if (cls > 2) {
                    w(((cls - 3) << 5) | 8208)
                    cls = 0
                }
            }
            while (cls--) w(cln)

            cls = 1
            cln = c[i]
        }
    }
    return [cl.subarray(0, cli), s]
}
/**
 * Calculate the length of output from tree, code lengths
 *
 * @param {Uint16Array} cf
 * @param {Uint8Array} cl
 * @returns {number}
 */
const clen = (cf, cl) => {
    let l = 0
    for (let i = 0; i < cl.length; ++i) l += cf[i] * cl[i]

    return l
}

/**
 * Writes a fixed block
 *
 * @param {Uint8Array} out
 * @param {number} pos
 * @param {Uint8Array} dat
 * @returns {number} the new bit pos
 */
const wfblk = (out, pos, dat) => {
    const s = dat.length // no need to write 00 as type: TypedArray defaults to 0
    const o = shft(pos + 2)
    out[o] = s & 255
    out[o + 1] = s >>> 8
    out[o + 2] = out[o] ^ 255
    out[o + 3] = out[o + 1] ^ 255
    for (let i = 0; i < s; ++i) out[o + i + 4] = dat[i]

    return (o + 4 + s) * 8
}

/**
 * Writes a block
 *
 * @param {Uint8Array} dat
 * @param {Uint8Array} out
 * @param {number} final
 * @param {Uint32Array} syms
 * @param {Uint16Array} lf
 * @param {Uint16Array} df
 * @param {number} eb
 * @param {number} li
 * @param {number} bs
 * @param {number} bl
 * @param {number} p
 * @returns {number}
 */
const wblk = (dat, out, final, syms, lf, df, eb, li, bs, bl, p) => {
    wbits(out, p++, final)
    ++lf[256]
    const [dlt, mlb] = hTree(lf, 15)
    const [ddt, mdb] = hTree(df, 15)
    const [lclt, nlc] = lc(dlt)
    const [lcdt, ndc] = lc(ddt)
    const lcfreq = new u16(19)
    for (let i = 0; i < lclt.length; ++i) lcfreq[lclt[i] & 31]++
    for (let i = 0; i < lcdt.length; ++i) lcfreq[lcdt[i] & 31]++

    const [lct, mlcb] = hTree(lcfreq, 7)
    let nlcc = 19
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc) {
    }

    const flen = (bl + 5) << 3
    const ftlen = clen(lf, flt) + clen(df, fdt) + eb
    const dtlen = clen(lf, dlt) +
        clen(df, ddt) + eb + 14 + 3 * nlcc +
        clen(lcfreq, lct) + (2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18])
    if (flen <= ftlen && flen <= dtlen) return wfblk(out, p, dat.subarray(bs, bs + bl))

    let lm, ll, dm, dl
    wbits(out, p, 1 + (dtlen < ftlen))
    p += 2
    if (dtlen < ftlen) {
        lm = hMap(dlt, mlb, 0)
        ll = dlt
        dm = hMap(ddt, mdb, 0)
        dl = ddt

        const llm = hMap(lct, mlcb, 0)
        wbits(out, p, nlc - 257)
        wbits(out, p + 5, ndc - 1)
        wbits(out, p + 10, nlcc - 4)
        p += 14
        for (let i = 0; i < nlcc; ++i) wbits(out, p + 3 * i, lct[clim[i]])

        p += 3 * nlcc
        const lcts = [lclt, lcdt]
        for (let it = 0; it < 2; ++it) {
            const clct = lcts[it]
            for (let i = 0; i < clct.length; ++i) {
                const len = clct[i] & 31
                wbits(out, p, llm[len])
                p += lct[len]
                if (len > 15) {
                    wbits(out, p, (clct[i] >>> 5) & 127)
                    p += clct[i] >>> 12
                }
            }
        }
    } else {
        lm = flm
        ll = flt
        dm = fdm
        dl = fdt
    }

    for (let i = 0; i < li; ++i) {
        if (syms[i] > 255) {
            const len = (syms[i] >>> 18) & 31
            wbits16(out, p, lm[len + 257])
            p += ll[len + 257]
            if (len > 7) {
                wbits(out, p, (syms[i] >>> 23) & 31)
                p += fleb[len]
            }

            const dst = syms[i] & 31
            wbits16(out, p, dm[dst])
            p += dl[dst]
            if (dst > 3) {
                wbits16(out, p, (syms[i] >>> 5) & 8191)
                p += fdeb[dst]
            }
        } else {
            wbits16(out, p, lm[syms[i]])
            p += ll[syms[i]]
        }
    }

    wbits16(out, p, lm[256])

    return p + ll[256]
}

const deo = new u32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]) // deflate options (nice << 13) | chain
const et = new u8(0) // empty

/**
 * Compresses data into a raw DEFLATE buffer
 *
 * @param {Uint8Array} dat
 * @param {number} lvl
 * @param {number} plvl
 * @param {number} pre
 * @param {number} post
 * @param {0|1} lst
 * @returns {Uint16Array}
 */
const dflt = (dat, lvl, plvl, pre, post, lst) => {
    const s = dat.length
    const o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post)

    // writing to this writes to the output buffer
    const w = o.subarray(pre, o.length - post)
    let pos = 0
    if (!lvl || s < 8) {
        for (let i = 0; i <= s; i += 65535) {
            const e = i + 65535 // end
            if (e < s) {
                pos = wfblk(w, pos, dat.subarray(i, e)) // write full block
            } else {
                w[i] = lst
                pos = wfblk(w, pos, dat.subarray(i, s)) // write final block
            }
        }
    } else {
        const opt = deo[lvl - 1]
        const n = opt >>> 13, c = opt & 8191
        const msk = (1 << plvl) - 1
        //    prev 2-byte val map    curr 2-byte val map
        const prev = new u16(32768), head = new u16(msk + 1)
        const bs1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1
        const hsh = i => (dat[i] ^ (dat[i + 1] << bs1) ^ (dat[i + 2] << bs2_1)) & msk

        // 24576 is an arbitrary number of maximum symbols per block
        // 424 buffer for last block
        const syms = new u32(25000)
        const lf = new u16(288), df = new u16(32) // length/literal freq   distance freq
        //  l/lcnt    exbits        l/lind   waitdx  bitpos
        let lc = 0, eb = 0, i = 0, li = 0, wi = 0, bs = 0
        for (; i < s; ++i) {
            // hash value
            // deopt when i > s - 3 - at end, deopt acceptable
            const hv = hsh(i)
            let imod = i & 32767, pimod = head[hv] // index mod 32768 | previous index mod
            prev[imod] = pimod
            head[hv] = imod
            // We always should modify head and prev, but only add symbols if
            // this data is not yet processed ("wait" for wait index)
            if (wi <= i) {
                const rem = s - i // bytes remaining
                if ((lc > 7000 || li > 24576) && rem > 423) {
                    pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos)
                    li = lc = eb = 0
                    bs = i
                    for (let j = 0; j < 286; ++j) lf[j] = 0
                    for (let j = 0; j < 30; ++j) df[j] = 0
                }

                //  len    dist   chain
                let l = 2, d = 0, ch = c, dif = (imod - pimod) & 32767
                if (rem > 2 && hv === hsh(i - dif)) {
                    const maxn = Math.min(n, rem) - 1
                    const maxd = Math.min(32767, i)
                    // max possible length
                    // not capped at dif because decompressors implement "rolling" index population
                    const ml = Math.min(258, rem)
                    while (dif <= maxd && --ch && imod !== pimod) {
                        if (dat[i + l] === dat[i + l - dif]) {
                            let nl = 0
                            for (; nl < ml && dat[i + nl] === dat[i + nl - dif]; ++nl) {}
                            if (nl > l) {
                                l = nl
                                d = dif
                                // break out early when we reach "nice" (we are satisfied enough)
                                if (nl > maxn) break
                                // now, find the rarest 2-byte sequence within this
                                // length of literals and search for that instead.
                                // Much faster than just using the start
                                const mmd = Math.min(dif, nl - 2)
                                let md = 0
                                for (let j = 0; j < mmd; ++j) {
                                    const ti = (i - dif + j + 32768) & 32767
                                    const pti = prev[ti]
                                    const cd = (ti - pti + 32768) & 32767
                                    if (cd > md) {
                                        md = cd
                                        pimod = ti
                                    }
                                }
                            }
                        }
                        // check the previous match
                        imod = pimod
                        pimod = prev[imod]
                        dif += (imod - pimod + 32768) & 32767
                    }
                }
                // d will be nonzero only when a match was found
                if (d) {
                    // store both dist and len data in one Uint32
                    // Make sure this is recognized as a len/dist with 28th bit (2^28)
                    syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d]

                    const lin = revfl[l] & 31, din = revfd[d] & 31
                    eb += fleb[lin] + fdeb[din]
                    ++lf[257 + lin]
                    ++df[din]
                    wi = i + l
                    ++lc
                } else {
                    syms[li++] = dat[i]
                    ++lf[dat[i]]
                }
            }
        }
        pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos)

        // this is the easiest way to avoid needing to maintain state
        if (!lst && (pos & 7)) pos = wfblk(w, pos + 1, et)
    }

    return slc(o, 0, pre + shft(pos) + post)
}

/**
 * CRC32 table
 *
 * @type {Uint32Array}
 */
const crct = (() => {
    const t = new u32(256)
    for (let i = 0; i < 256; ++i) {
        let c = i, k = 9
        while (--k) c = ((c & 1) && 0xEDB88320) ^ (c >>> 1)
        t[i] = c
    }

    return t
})()

/**
 * CRC32
 *
 * @returns {{p(d: Uint8Array): void, d(): number}}
 */
const crc = () => {
    let c = -1
    return {
        p(d) {
            // closures have awful performance
            let cr = c
            for (let i = 0; i < d.length; ++i) cr = crct[(cr & 255) ^ d[i]] ^ (cr >>> 8)
            c = cr
        },
        d() {
            return ~c
        },
    }
}

/**
 * Alder32
 *
 * @returns {{p(d: Uint8Array): void, d(): number}}
 */
const adler = () => {
    let a = 1, b = 0
    return {
        p(d) {
            // closures have awful performance
            let n = a, m = b
            const l = d.length
            for (let i = 0; i !== l;) {
                const e = Math.min(i + 2655, l)
                for (; i < e; ++i) m += n += d[i]

                n = (n & 65535) + 15 * (n >> 16)
                m = (m & 65535) + 15 * (m >> 16)
            }
            a = n
            b = m
        },
        d() {
            a %= 65521
            b %= 65521
            return (a & 255) << 24 | (a >>> 8) << 16 | (b & 255) << 8 | (b >>> 8)
        },
    }
}

const defMen = (mem, dat) => mem == null ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 12 + mem

/**
 * deflate with opts
 *
 * @param dat
 * @param opt
 * @param pre
 * @param post
 * @param st
 * @returns {Uint16Array}
 */
const dopt = (dat, opt, pre, post, st) => dflt(dat, opt.level ?? 6, defMen(opt.mem, dat), pre, post, !st)

// Walmart object spread
const mrg = function (a, b) {
    const o = {}
    for (let k in a) o[k] = a[k]
    for (let k in b) o[k] = b[k]

    return o
}

/**
 * Worker Clone
 *
 * This is possibly the craziest part of the entire codebase, despite how simple it may seem.
 * The only parameter to this function is a closure that returns an array of variables outside the function scope.
 * We're going to try to figure out the variable names used in the closure as strings because that is crucial for
 * workerization.
 *
 * We will return an object mapping of true variable name to value (basically, the current scope as a JS object).
 * The reason we can't just use the original variable names is minifiers mangling the toplevel scope.
 * This took me three weeks to figure out how to do.
 *
 * @param fn
 * @param fnStr
 * @param td
 * @returns {[string,unknown]} worker clone
 */
const wcln = (fn, fnStr, td) => {
    const dt = fn()
    const st = fn.toString()
    const ks = st.slice(st.indexOf('[') + 1, st.lastIndexOf(']')).replace(/ /g, '').split(',')

    for (let i = 0; i < dt.length; ++i) {
        const v = dt[i], k = ks[i]
        if (typeof v == 'function') {
            fnStr += `;${k}=`
            const st_1 = v.toString()
            if (v.prototype) {
                // for global objects
                if (st_1.indexOf('[native code]') !== -1) {
                    const spInd = st_1.indexOf(' ', 8) + 1
                    fnStr += st_1.slice(spInd, st_1.indexOf('(', spInd))
                } else {
                    fnStr += st_1
                    for (let t in v.prototype)
                        fnStr += `;${k}.${prototype}.${t}=${v.prototype[t].toString()}`
                }
            } else fnStr += st_1
        } else td[k] = v
    }

    return [fnStr, td]
}

const ch = []

/**
 * Clone Buffers
 *
 * @param v
 * @returns {*[]}
 */
const cbfs = v => {
    const tl = []
    for (let k in v) {
        if (v[k] instanceof u8 || v[k] instanceof u16 || v[k] instanceof u32) tl.push((v[k] = new v[k].constructor(v[k])).buffer)
    }

    return tl
}

/**
 * Use a worker to execute code
 *
 * @param fns
 * @param init
 * @param id
 * @param cb
 * @returns {Worker}
 */
const wrkr = function (fns, init, id, cb) {
    let _a
    if (!ch[id]) {
        let fnStr = '', td_1 = {}
        const m = fns.length - 1
        for (let i = 0; i < m; ++i) {
            _a = wcln(fns[i], fnStr, td_1)
            fnStr = _a[0]
            td_1 = _a[1]
        }

        ch[id] = wcln(fns[m], fnStr, td_1)
    }

    const td = mrg({}, ch[id][1])
    return wk(`${ch[id][0]};onmessage=e=>{for(let k in e.data)self[k]=e.data[k];onmessage=${init.toString()}}`, id, td, cbfs(td), cb)
}

/**
 * base async inflate fn
 *
 * @returns {(Uint8ArrayConstructor|Uint16ArrayConstructor|Uint32ArrayConstructor|Uint8Array)[]}
 */
const bInflt = () => [
    u8, u16, u32, fleb, fdeb, clim, fl, fd, flrm, fdrm, rev,
    hMap, max, bits, bits16, shft, slc, inflt, inflateSync, pbf, gu8,
]

/**
 * Base async deflate fn
 *
 * @returns {(Uint8ArrayConstructor|Uint16ArrayConstructor|Uint32ArrayConstructor|Uint8Array)[]}
 */
const bDflt = () => [
    u8, u16, u32, fleb, fdeb, clim, revfl, revfd, flm, flt, fdm, fdt, rev, deo, et,
    hMap, wbits, wbits16, hTree, ln, lc, clen, wfblk, wblk, shft, slc, dflt, dopt, deflateSync, pbf,
]

/**
 * gzip extra
 *
 * @returns {[gzh,(function(*)),wbytes,(function(): {p: function(*): void, d: function(): *}),Uint32Array]}
 */
const gze = () => [gzh, gzhl, wbytes, crc, crct]

/**
 * gunzip extra
 *
 * @returns {[(function(*)),(function(*))]}
 */
const guze = () => [gzs, gzl]

/**
 * zlib extra
 *
 * @returns {[zlh,wbytes,(function(): {p(*): void, d(): *})]}
 */
const zle = () => [zlh, wbytes, adler]

/**
 * unzlib extra
 *
 * @returns {[zlv]}
 */
const zule = () => [zlv]

/**
 * post buf
 *
 * @param msg
 */
const pbf = msg => postMessage(msg, [msg.buffer])

/**
 * get u8
 *
 * @param o
 * @returns {Uint8Array}
 */
const gu8 = o => o && o.size && new u8(o.size)

/**
 * Async helper
 *
 * @param dat
 * @param opts
 * @param fns
 * @param init
 * @param id
 * @param cb
 * @returns {function(): void}
 */
const cbify = (dat, opts, fns, init, id, cb) => {
    const w = wrkr(fns, init, id, (err, dat) => {
        w.terminate()
        cb(err, dat)
    })
    w.postMessage([dat, opts], opts.consume ? [dat.buffer] : [])

    return () => w.terminate()
}

/**
 * auto stream
 *
 * @param strm
 * @returns {function(*): *}
 */
const astrm = strm => {
    strm.ondata = (dat, final) => postMessage([dat, final], [dat.buffer])

    return ev => strm.push(ev.data[0], ev.data[1])
}

/**
 * Async stream attach
 *
 * @param fns
 * @param strm
 * @param opts
 * @param init
 * @param id
 */
const astrmify = (fns, strm, opts, init, id) => {
    let t
    const w = wrkr(fns, init, id, (err, dat) => {
        if (err) {
            w.terminate()
            strm.ondata.call(strm, err)
        } else {
            if (dat[1]) w.terminate()
            strm.ondata.call(strm, err, dat[0], dat[1])
        }
    })
    w.postMessage(opts)

    strm.push = (d, f) => {
        if (t) throw 'stream finished'
        if (!strm.ondata) throw 'no stream handler'

        w.postMessage([d, t = f], [d.buffer])
    }
    strm.terminate = () => w.terminate()
}

/**
 * read 2 bytes
 *
 * @param {Uint8Array} d: data buffer
 * @param {number} b: bit position
 * @returns {number}
 */
const b2 = (d, b) => d[b] | (d[b + 1] << 8)

/**
 * read 4 bytes
 *
 * @param {Uint8Array} d: data buffer
 * @param {number} b: bit position
 * @returns {number}
 */
const b4 = (d, b) => (d[b] | (d[b + 1] << 8) | (d[b + 2] << 16) | (d[b + 3] << 24)) >>> 0

/**
 * read 8 bytes
 *
 * @param {Uint8Array} d: data buffer
 * @param {number} b: bit position
 * @returns {number}
 */
const b8 = (d, b) => b4(d, b) + (b4(d, b + 4) * 4294967296)

/**
 * write bytes
 *
 * @param {Uint8Array} d: data buffer
 * @param {number} b: bit position
 * @param {number} v: value
 */
const wbytes = (d, b, v) => {
    for (; v; ++b) {
        d[b] = v
        v >>>= 8
    }
}

/**
 * gzip header
 *
 * @param {Uint8Array} c: data buffer
 * @param {*} o: options
 */
const gzh = (c, o) => {
    const fn = o.filename
    c[0] = 31
    c[1] = 139
    c[2] = 8
    c[8] = o.level < 2 ? 4 : o.level === 9 ? 2 : 0
    c[9] = 3 // assume Unix
    if (o.mtime !== 0) wbytes(c, 4, Math.floor(new Date(o.mtime || Date.now()) / 1e3))

    if (fn) {
        c[3] = 8
        for (let i = 0; i <= fn.length; ++i) c[i + 10] = fn.charCodeAt(i)
    }
}

/**
 * gzip footer: -8 to -4 = CRC, -4 to -0 is length
 * gzip start
 *
 * @param d
 * @returns {number}
 */
const gzs = d => {
    if (isGunzip(d)) throw 'invalid gzip data'

    const flg = d[3]
    let st = 10
    if (flg & 4) st += d[10] | (d[11] << 8) + 2
    for (let zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++]) {
    }

    return st + (flg & 2)
}

/**
 * gzip length
 *
 * @param d
 * @returns {number}
 */
const gzl = d => {
    const l = d.length
    return ((d[l - 4] | d[l - 3] << 8 | d[l - 2] << 16) | (d[l - 1] << 24)) >>> 0
}

/**
 * gzip header length
 *
 * @param o
 * @returns {*}
 */
const gzhl = o => 10 + ((o.filename && (o.filename.length + 1)) || 0)

/**
 * zlib header
 *
 * @param c
 * @param o
 */
const zlh = function (c, o) {
    const lv = o.level, fl = lv === 0 ? 0 : lv < 6 ? 1 : lv === 9 ? 3 : 2

    c[0] = 120
    c[1] = (fl << 6) | fl ? (32 - 2 * fl) : 1
}

/**
 * zlib valid
 *
 * @param d
 */
const zlv = d => {
    if ((d[0] & 15) !== 8 || (d[0] >>> 4) > 7 || ((d[0] << 8 | d[1]) % 31)) throw 'invalid zlib data'
    if (d[1] & 32) throw 'invalid zlib data: preset dictionaries not supported'
}

/**
 *
 * @param opts
 * @param cb
 * @returns {{}}
 * @constructor
 */
function AsyncCmpStrm(opts, cb) {
    if (!cb && typeof opts == 'function') {
        cb = opts
        opts = {}
    }
    this.ondata = cb

    return opts
}

/**
 * Streaming DEFLATE compression
 * zlib footer: -4 to -0 is Adler32
 */
class Deflate {
    constructor(opts, cb) {
        if (!cb && typeof opts == 'function') {
            cb = opts
            opts = {}
        }

        this.ondata = cb
        this.o = opts || {}
    }

    p = (c, f) => {
        this.ondata(dopt(c, this.o, 0, 0, !f), f)
    }

    /**
     * Pushes a chunk to be deflated
     *
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    push(chunk, final) {
        if (this.d) throw 'stream finished'
        if (!this.ondata) throw 'no stream handler'

        this.d = final
        this.p(chunk, final || false)
    }
}

export {Deflate}

/**
 * Asynchronous streaming DEFLATE compression
 *
 * @type {AsyncDeflate}
 */
class AsyncDeflate {
    constructor(opts, cb) {
        astrmify([
            bDflt,
            () => [astrm, Deflate],
        ], this, AsyncCmpStrm.call(this, opts, cb), ev => {
            const strm = new Deflate(ev.data)
            onmessage = astrm(strm)
        }, 6)
    }
}

export {AsyncDeflate}

export function deflate(data, opts, cb) {
    if (!cb) {
        cb = opts
        opts = {}
    }
    if (typeof cb != 'function') throw 'no callback'

    return cbify(data, opts, [
        bDflt,
    ], ev => pbf(deflateSync(ev.data[0], ev.data[1])), 0, cb)
}

/**
 * Compresses data with DEFLATE without any wrapper
 *
 * @param data The data to compress
 * @param opts The compression options
 *
 * @returns The deflated version of the data
 */
export const deflateSync = (data, opts) => dopt(data, opts ?? {}, 0, 0)

/**
 * Streaming DEFLATE decompression
 *
 * @type {Inflate}
 */
class Inflate {
    /**
     * Creates an inflation stream
     *
     * @param cb The callback to call whenever data is inflated
     */
    constructor(cb) {
        this.s = {}
        this.p = new u8(0)
        this.ondata = cb
    }

    e(c) {
        if (this.d) throw 'stream finished'
        if (!this.ondata) throw 'no stream handler'

        const l = this.p.length
        const n = new u8(l + c.length)
        n.set(this.p)
        n.set(c, l)

        this.p = n
    }

    c(final) {
        this.d = this.s.i = final || false

        const bts = this.s.b
        const dt = inflt(this.p, this.o, this.s)
        this.ondata(slc(dt, bts, this.s.b), this.d)

        this.o = slc(dt, this.s.b - 32768)
        this.s.b = this.o.length

        this.p = slc(this.p, (this.s.p / 8) | 0)
        this.s.p &= 7
    }

    /**
     * Pushes a chunk to be
     *
     * @param chunk The chunk to push
     * @param final Whether this is the final chunk
     */
    push(chunk, final) {
        this.e(chunk)
        this.c(final)
    }
}

export {Inflate}

/**
 * Asynchronous streaming DEFLATE decompression
 */
class AsyncInflate {
    /**
     * Creates an asynchronous inflation stream
     *
     * @param cb The callback to call whenever data is deflated
     */
    constructor(cb) {
        this.ondata = cb
        astrmify([
            bInflt,
            () => [astrm, Inflate],
        ], this, 0, () => {
            const strm = new Inflate()
            onmessage = astrm(strm)
        }, 7)
    }
}

export {AsyncInflate}

/**
 *
 * @param data
 * @param opts
 * @param cb
 * @returns {function(): void}
 */
export function inflate(data, opts, cb) {
    if (!cb) {
        cb = opts
        opts = {}
    }
    if (typeof cb != 'function') throw 'no callback'

    return cbify(data, opts, [
        bInflt,
    ], ev => pbf(inflateSync(ev.data[0], gu8(ev.data[1]))), 1, cb)
}

/**
 * Expands DEFLATE data with no wrapper
 *
 * @param data The data to decompress
 * @param out Where to write the data. Saves memory if you know the decompressed size and provide an output buffer of that length.
 * @returns The decompressed version of the data
 */
export function inflateSync(data, out) {
    return inflt(data, out)
}

/**
 * Streaming GZIP compression
 */
class Gzip extends Deflate {
    constructor(opts, cb) {
        super(opts, cb)
        this.c = crc()
        this.l = 0
        this.v = 1
    }

    p(c, f) {
        this.c.p(c)
        this.l += c.length

        const raw = dopt(c, this.o, this.v && gzhl(this.o), f && 8, !f)
        if (this.v) {
            gzh(raw, this.o)
            this.v = 0
        }
        if (f) {
            wbytes(raw, raw.length - 8, this.c.d())
            wbytes(raw, raw.length - 4, this.l)
        }

        this.ondata(raw, f)
    }
}

export {Gzip}

/**
 * Asynchronous streaming GZIP compression
 */
class AsyncGzip {
    constructor(opts, cb) {
        astrmify([
            bDflt,
            gze,
            () => [astrm, Deflate, Gzip],
        ], this, AsyncCmpStrm.call(this, opts, cb), ev => {
            const strm = new Gzip(ev.data)
            onmessage = astrm(strm)
        }, 8)
    }
}

export {AsyncGzip}

export function gzip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {}
    if (typeof cb != 'function') throw 'no callback'
    return cbify(data, opts, [
        bDflt,
        gze,
        () => [gzipSync],
    ], ev => pbf(gzipSync(ev.data[0], ev.data[1])), 2, cb)
}

/**
 * Compresses data with GZIP
 *
 * @param data The data to compress
 * @param opts The compression options
 * @returns The gzipped version of the data
 */
export function gzipSync(data, opts) {
    if (!opts) opts = {}
    const c = crc(), l = data.length
    c.p(data)
    const d = dopt(data, opts, gzhl(opts), 8), s = d.length

    return gzh(d, opts), wbytes(d, s - 8, c.d()), wbytes(d, s - 4, l), d
}

/**
 * Streaming GZIP decompression
 */
class Gunzip extends Inflate {
    /**
     * Creates a GUNZIP stream
     * @param cb The callback to call whenever data is inflated
     */
    constructor(cb) {
        super(cb)
        this.v = 1
    }

    /**
     * Pushes a chunk to be GUNZIPped
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    push(chunk, final) {
        super.e(this, chunk)

        if (this.v) {
            const s = this.p.length > 3 ? gzs(this.p) : 4
            if (s >= this.p.length && !final) return

            this.p = this.p.subarray(s)
            this.v = 0
        }
        if (final) {
            if (this.p.length < 8) throw 'invalid gzip stream'
            this.p = this.p.subarray(0, -8)
        }
        // necessary to prevent TS from using the closure value
        // This allows for workerization to function correctly
        super.c.call(final)
    }
}

export {Gunzip}

/**
 * Asynchronous streaming GZIP decompression
 */
class AsyncGunzip {
    /**
     * Creates an asynchronous GUNZIP stream
     *
     * @param cb The callback to call whenever data is deflated
     */
    constructor(cb) {
        this.ondata = cb
        astrmify([
            bInflt,
            guze,
            () => [astrm, Inflate, Gunzip],
        ], this, 0, () => {
            const strm = new Gunzip()
            onmessage = astrm(strm)
        }, 9)
    }
}

export {AsyncGunzip}

export function gunzip(data, opts, cb) {
    if (!cb) {
        cb = opts
        opts = {}
    }
    if (typeof cb != 'function') throw 'no callback'

    return cbify(data, opts, [
        bInflt,
        guze,
        () => [gunzipSync],
    ], ev => pbf(gunzipSync(ev.data[0])), 3, cb)
}

/**
 * Expands GZIP data
 *
 * @param data The data to decompress
 * @param out Where to write the data. GZIP already encodes the output size, so providing this doesn't save memory.
 * @returns The decompressed version of the data
 */
export const gunzipSync = (data, out) => inflt(data.subarray(gzs(data), -8), out || new u8(gzl(data)))

/**
 * Streaming Zlib compression
 */
class Zlib extends Deflate {
    constructor(opts, cb) {
        super(opts, cb)

        this.c = adler()
        this.v = 1
    }

    p(c, f) {
        this.c.p(c)

        const raw = dopt(c, this.o, this.v && 2, f && 4, !f)
        if (this.v) {
            zlh(raw, this.o)
            this.v = 0
        }

        if (f) wbytes(raw, raw.length - 4, this.c.d())

        this.ondata(raw, f)
    }
}

export {Zlib}

/**
 * Asynchronous streaming Zlib compression
 */
class AsyncZlib {
    constructor(opts, cb) {
        astrmify([
            bDflt,
            zle,
            () => [astrm, Deflate, Zlib],
        ], this, AsyncCmpStrm.call(this, opts, cb), ev => {
            const strm = new Zlib(ev.data)
            onmessage = astrm(strm)
        }, 10)
    }
}

export {AsyncZlib}

export function zlib(data, opts, cb) {
    if (!cb) {
        cb = opts
        opts = {}
    }
    if (typeof cb != 'function') throw 'no callback'

    return cbify(data, opts, [
        bDflt,
        zle,
        () => [zlibSync],
    ], ev => pbf(zlibSync(ev.data[0], ev.data[1])), 4, cb)
}

/**
 * Compress data with Zlib
 * @param data The data to compress
 * @param opts The compression options
 *
 * @returns The zlib-compressed version of the data
 */
export function zlibSync(data, opts) {
    if (!opts) opts = {}
    const a = adler()
    a.p(data)

    const d = dopt(data, opts, 2, 4)

    return zlh(d, opts), wbytes(d, d.length - 4, a.d()), d
}

/**
 * Streaming Zlib decompression
 */
class Unzlib extends Inflate {
    /**
     * Creates a Zlib decompression stream
     * @param cb The callback to call whenever data is inflated
     */
    constructor(cb) {
        super(cb)

        this.v = 1
    }

    /**
     * Pushes a chunk to be unzlibbed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    push(chunk, final) {
        super.e(chunk)

        if (this.v) {
            if (this.p.length < 2 && !final) return

            this.p = this.p.subarray(2)
            this.v = 0
        }

        if (final) {
            if (this.p.length < 4) throw 'invalid zlib stream'

            this.p = this.p.subarray(0, -4)
        }

        // necessary to prevent TS from using the closure value
        // This allows for workerization to function correctly
        super.c(final)
    }
}

export {Unzlib}

/**
 * Asynchronous streaming Zlib decompression
 */
class AsyncUnzlib {
    /**
     * Creates an asynchronous Zlib decompression stream
     *
     * @param cb The callback to call whenever data is deflated
     */
    constructor(cb) {
        this.ondata = cb
        astrmify([
            bInflt,
            zule,
            () => [astrm, Inflate, Unzlib],
        ], this, 0, () => {
            const strm = new Unzlib()
            onmessage = astrm(strm)
        }, 11)
    }
}

export {AsyncUnzlib}

export function unzlib(data, opts, cb) {
    if (!cb) {
        cb = opts
        opts = {}
    }

    if (typeof cb != 'function') throw 'no callback'

    return cbify(data, opts, [
        bInflt,
        zule,
        () => [unzlibSync],
    ], ev => pbf(unzlibSync(ev.data[0], gu8(ev.data[1]))), 5, cb)
}

/**
 * If is Gunzip
 *
 * @param d
 * @returns {boolean}
 */
const isGunzip = d => d[0] === 31 && d[1] === 139 && d[2] === 8

/**
 * If is Inflate
 * @param d
 * @returns {boolean}
 */
// ((data[0] & 15) !== 8 || (data[0] >> 4) > 7 || ((data[0] << 8 | data[1]) % 31))
const isInflate = d => (d[0] & 15) !== 8 || (d[0] >> 4) > 7 || ((d[0] << 8 | d[1]) % 31)

/**
 * Expands Zlib data
 *
 * @param data The data to decompress
 * @param out Where to write the data. Saves memory if you know the decompressed size and provide an output buffer of that length.
 * @returns The decompressed version of the data
 */
export const unzlibSync = (data, out) => inflt((zlv(data), data.subarray(2, -4)), out)

// Default algorithm for compression (used because having a known output size allows faster decompression)
export {gzip as compress, AsyncGzip as AsyncCompress}

// Default algorithm for compression (used because having a known output size allows faster decompression)
export {gzipSync as compressSync, Gzip as Compress}

/**
 * Streaming GZIP, Zlib, or raw DEFLATE decompression
 */
class Decompress {
    /**
     * Creates a decompression stream
     * @param cb The callback to call whenever data is decompressed
     */
    constructor(cb) {
        this.ondata = cb

        this.G = Gunzip
        this.I = Inflate
        this.Z = Unzlib
    }

    /**
     * Pushes a chunk to be decompressed
     *
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    push(chunk, final) {
        if (!this.ondata) throw 'no stream handler'

        if (!this.s) {
            if (this.p && this.p.length) {
                const n = new u8(this.p.length + chunk.length)
                n.set(this.p)
                n.set(chunk, this.p.length)
            } else this.p = chunk

            if (this.p.length > 2) {
                const ctx = this
                const cb = () => {
                    ctx.ondata.apply(ctx, arguments)
                }

                this.s = isGunzip(this.p) ? new this.G(cb) : isInflate(this.p) ? new this.I(cb) : new this.Z(cb)
                this.s.push(this.p, final)
                this.p = null
            }
        } else this.s.push(chunk, final)
    }
}

export {Decompress}

/**
 * Asynchronous streaming GZIP, Zlib, or raw DEFLATE decompression
 */
class AsyncDecompress extends Decompress {
    /**
     * Creates an asynchronous decompression stream
     * @param cb The callback to call whenever data is decompressed
     */
    constructor(cb) {
        super(cb)

        this.G = AsyncGunzip
        this.I = AsyncInflate
        this.Z = AsyncUnzlib
    }
}

export {AsyncDecompress}

export function decompress(data, opts, cb) {
    if (!cb) {
        cb = opts
        opts = {}
    }

    if (typeof cb != 'function') throw 'no callback'

    return isGunzip(data) ?
        gunzip(data, opts, cb) : isInflate(data) ?
            inflate(data, opts, cb) : unzlib(data, opts, cb)
}

/**
 * Expands compressed GZIP, Zlib, or raw DEFLATE data, automatically detecting the format
 * @param data The data to decompress
 * @param out Where to write the data. Saves memory if you know the decompressed size and provide an output buffer of that length.
 * @returns The decompressed version of the data
 */
export const decompressSync = (data, out) => isGunzip(data) ?
    gunzipSync(data, out) : isInflate(data) ?
        inflateSync(data, out) : unzlibSync(data, out)

// flatten a directory structure
const fltn = (d, p, t, o) => {
    for (let k in d) {
        const val = d[k], n = p + k
        if (val instanceof u8) t[n] = [val, o]
        else if (Array.isArray(val)) t[n] = [val[0], mrg(o, val[1])]
        else fltn(val, n + '/', t, o)
    }
}

// text encoder
const te = typeof TextEncoder != 'undefined' && new TextEncoder()

// text decoder
const td = typeof TextDecoder != 'undefined' && new TextDecoder()

// text decoder stream
let tds = 0
try {
    td.decode(et, {stream: true})
    tds = 1
} catch (e) {
}

// decode UTF8
const dutf8 = d => {
    for (let r = '', i = 0; ;) {
        let c = d[i++]
        const eb = (c > 127) + (c > 223) + (c > 239)
        if (i + eb > d.length) return [r, slc(d, i - 1)]

        if (!eb) r += String.fromCharCode(c)
        else if (eb === 3) {
            c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | (d[i++] & 63)) - 65536
            r += String.fromCharCode(55296 | (c >> 10), 56320 | (c & 1023))
        } else if (eb & 1) r += String.fromCharCode((c & 31) << 6 | (d[i++] & 63))
        else r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | (d[i++] & 63))
    }
}

/**
 * Streaming UTF-8 decoding
 */
class DecodeUTF8 {
    /**
     * Creates a UTF-8 decoding stream
     *
     * @param cb The callback to call whenever data is decoded
     */
    constructor(cb) {
        this.ondata = cb

        if (tds) this.t = new TextDecoder()
        else this.p = et
    }

    /**
     * Pushes a chunk to be decoded from UTF-8 binary
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    push(chunk, final) {
        if (!this.ondata) throw 'no callback'

        final = !!final
        if (this.t) {
            this.ondata(this.t.decode(chunk, {stream: true}), final)
            if (final) {
                if (this.t.decode().length) throw 'invalid utf-8 data'
                this.t = null
            }

            return
        }

        if (!this.p) throw 'stream finished'

        const dat = new u8(this.p.length + chunk.length)
        dat.set(this.p)
        dat.set(chunk, this.p.length)

        const _a = dutf8(dat), ch = _a[0], np = _a[1]
        if (final) {
            if (np.length) throw 'invalid utf-8 data'
            this.p = null
        } else this.p = np

        this.ondata(ch, final)
    }
}

export {DecodeUTF8}

/**
 * Streaming UTF-8 encoding
 */
class EncodeUTF8 {
    /**
     * Creates a UTF-8 decoding stream
     *
     * @param cb The callback to call whenever data is encoded
     */
    constructor(cb) {
        this.ondata = cb
    }

    /**
     * Pushes a chunk to be encoded to UTF-8
     *
     * @param chunk The string data to push
     * @param final Whether this is the last chunk
     */
    push(chunk, final) {
        if (!this.ondata) throw 'no callback'
        if (this.d) throw 'stream finished'

        this.ondata(strToU8(chunk), this.d = final || false)
    }
}

export {EncodeUTF8}

/**
 * Converts a string into a Uint8Array for use with compression/decompression methods
 *
 * @param str The string to encode
 * @param latin1 Whether or not to interpret the data as Latin-1. This should
 *               not need to be true unless decoding a binary string.
 *
 * @returns The string encoded in UTF-8/Latin-1 binary
 */
export const strToU8 = (str, latin1) => {
    const l = str.length
    if (latin1) {
        const a = new u8(l)
        for (let i = 0; i < l; ++i) a[i] = str.charCodeAt(i)

        return a
    }

    if (te) return te.encode(str)

    let ar = new u8(l + (l >> 1))
    let ai = 0
    const w = v => ar[ai++] = v

    for (let i = 0; i < l; ++i) {
        if (ai + 5 > ar.length) {
            const n = new u8(ai + 8 + ((l - i) << 1))
            n.set(ar)
            ar = n
        }

        let c = str.charCodeAt(i)
        if (c < 128 || latin1) w(c)
        else if (c < 2048) {
            w(192 | (c >> 6))
            w(128 | (c & 63))
        } else if (c > 55295 && c < 57344) {
            c = 65536 + (c & 1023 << 10) | (str.charCodeAt(++i) & 1023)
            w(240 | (c >> 18))
            w(128 | ((c >> 12) & 63))
            w(128 | ((c >> 6) & 63))
            w(128 | (c & 63))
        } else {
            w(224 | (c >> 12))
            w(128 | ((c >> 6) & 63))
            w(128 | (c & 63))
        }
    }

    return slc(ar, 0, ai)
}

/**
 * Converts a Uint8Array to a string
 *
 * @param dat The data to decode to string
 * @param latin1 Whether or not to interpret the data as Latin-1. This should
 *               not need to be true unless encoding to binary string.
 *
 * @returns The original UTF-8/Latin-1 string
 */
export const strFromU8 = (dat, latin1) => {
    if (latin1) {
        let r = ''
        for (let i = 0; i < dat.length; i += 16384) r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384))

        return r
    } else if (td) return td.decode(dat)
    else {
        const _a = dutf8(dat), out = _a[0], ext = _a[1]
        if (ext.length) throw 'invalid utf-8 data'

        return out
    }
}

/**
 * deflate bit flag
 *
 * @param l
 * @returns {number}
 */
const dbf = l => l === 1 ? 3 : l < 6 ? 2 : l === 9 ? 1 : 0

/**
 * skip local zip header
 *
 * @param d
 * @param b
 * @returns {*}
 */
const slzh = (d, b) => b + 30 + b2(d, b + 26) + b2(d, b + 28)

/**
 * read zip header
 *
 * @param d
 * @param b
 * @param z
 * @returns {(*|string)[]}
 */
const zh = function (d, b, z) {
    const fnl = b2(d, b + 28)
    const fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048))
    const es = b + 46 + fnl, bs = b4(d, b + 20)

    const _a = z && bs === 4294967295 ? z64e(d, es) : [bs, b4(d, b + 24), b4(d, b + 42)]
    const sc = _a[0], su = _a[1], off = _a[2]

    return [b2(d, b + 10), sc, su, fn, es + b2(d, b + 30) + b2(d, b + 32), off]
}

/**
 * Read zip64 extra field
 *
 * @param d
 * @param b
 * @returns {[*,*,*]}
 */
const z64e = function (d, b) {
    for (; b2(d, b) !== 1; b += 4 + b2(d, b + 2)) {
    }

    return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)]
}

/**
 * Extra field length
 *
 * @param ex
 * @returns {number}
 */
const exfl = (ex) => {
    let le = 0
    if (ex) {
        for (let k in ex) {
            const l = ex[k].length
            if (l > 65535) throw 'extra field too long'

            le += l + 4
        }
    }

    return le
}

/**
 *
 * @param d {Date}
 * @returns {number}
 */
const hdate = d => (y << 25) |
    (d.getMonth() + 1) << 21 |
    (d.getDate() << 16) |
    (d.getHours() << 11) |
    (d.getMinutes() << 5) |
    (d.getSeconds() >>> 1)

/**
 * write zip header
 *
 * @param d
 * @param b
 * @param f
 * @param fn
 * @param u
 * @param c
 * @param ce
 * @param co
 * @returns {*}
 */
const wzh = function (d, b, f, fn, u, c, ce, co) {
    const fl = fn.length, ex = f.extra, col = co && co.length
    const exl = exfl(ex)

    wbytes(d, b, ce != null ? 0x2014B50 : 0x4034B50)
    b += 4

    if (ce != null) {
        d[b++] = 20
        d[b++] = f.os
    }

    d[b] = 20
    b += 2 // spec compliance? what's that?

    d[b++] = (f.flag << 1) | (c == null && 8)
    d[b++] = u && 8
    d[b++] = f.compression & 255
    d[b++] = f.compression >> 8

    const dt = new Date(f.mtime ?? Date.now()), y = dt.getFullYear() - 1980
    if (y < 0 || y > 119) throw 'date not in range 1980-2099'

    wbytes(d, b, hdate(dt))
    b += 4

    if (c != null) {
        wbytes(d, b, f.crc)
        wbytes(d, b + 4, c)
        wbytes(d, b + 8, f.size)
    }

    wbytes(d, b + 12, fl)
    wbytes(d, b + 14, exl)
    b += 16

    if (ce != null) {
        wbytes(d, b, col)
        wbytes(d, b + 6, f.attrs)
        wbytes(d, b + 10, ce)
        b += 14
    }

    d.set(fn, b)
    b += fl
    if (exl) {
        for (let k in ex) {
            const exf = ex[k], l = exf.length
            wbytes(d, b, +k)
            wbytes(d, b + 2, l)
            d.set(exf, b + 4)
            b += 4 + l
        }
    }

    if (col) {
        d.set(co, b)
        b += col
    }

    return b
}

/**
 * write zip footer (end of central directory)
 *
 * @param o {Uint8Array}
 * @param b {number}
 * @param c {number}
 * @param d {number}
 * @param e {number}
 */
const wzf = function (o, b, c, d, e) {
    wbytes(o, b, 0x6054B50) // skip disk
    wbytes(o, b + 8, c)
    wbytes(o, b + 10, c)
    wbytes(o, b + 12, d)
    wbytes(o, b + 16, e)
}

/**
 * A pass-through stream to keep data uncompressed in a ZIP archive.
 */
class ZipPassThrough {
    /**
     * Creates a pass-through stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     */
    constructor(filename) {
        this.filename = filename
        this.c = crc()
        this.size = 0
        this.compression = 0
    }

    /**
     * Processes a chunk and pushes to the output stream. You can override this
     * method in a subclass for custom behavior, but by default this passes
     * the data through. You must call this.ondata(err, chunk, final) at some
     * point in this method.
     *
     * @param chunk The chunk to process
     * @param final Whether this is the last chunk
     */
    process(chunk, final) {
        this.ondata(null, chunk, final)
    }

    /**
     * Pushes a chunk to be added. If you are subclassing this with a custom
     * compression algorithm, note that you must push data from the source
     * file only, pre-compression.
     *
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    push(chunk, final) {
        if (!this.ondata) throw 'no callback - add to ZIP archive before pushing'
        this.c.p(chunk)
        this.size += chunk.length
        if (final) this.crc = this.c.d()
        this.process(chunk, final || false)
    }
}

export {ZipPassThrough}

// I don't extend because TypeScript extension adds 1kB of runtime bloat
/**
 * Streaming DEFLATE compression for ZIP archives. Prefer using AsyncZipDeflate
 * for better performance
 */
class ZipDeflate extends ZipPassThrough {
    /**
     * Creates a DEFLATE stream that can be added to ZIP archives
     *
     * @param filename The filename to associate with this data stream
     * @param opts The compression options
     */
    constructor(filename, opts) {
        super(filename)

        const ctx = this
        if (!opts) opts = {}

        this.d = new Deflate(opts, (dat, final) => ctx.ondata(null, dat, final))
        this.compression = 8
        this.flag = dbf(opts.level)
    }

    process = function (chunk, final) {
        try {
            this.d.push(chunk, final)
        } catch (e) {
            this.ondata(e, null, final)
        }
    }
}

export {ZipDeflate}

/**
 * Asynchronous streaming DEFLATE compression for ZIP archives
 */
class AsyncZipDeflate extends ZipPassThrough {
    /**
     * Creates a DEFLATE stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     * @param opts The compression options
     */
    constructor(filename, opts) {
        super(filename)

        const ctx = this
        if (!opts) opts = {}

        this.d = new AsyncDeflate(opts, (err, dat, final) => ctx.ondata(err, dat, final))
        this.compression = 8
        this.flag = dbf(opts.level)
        this.terminate = this.d.terminate
    }

    process(chunk, final) {
        this.d.push(chunk, final)
    }
}

export {AsyncZipDeflate}

// TODO: Better tree shaking
/**
 * A zippable archive to which files can incrementally be added
 */
class Zip {
    /**
     * Creates an empty ZIP archive to which files can be added
     *
     * @param cb The callback to call whenever data for the generated ZIP archive
     *           is available
     */
    constructor(cb) {
        this.ondata = cb
        this.u = []
        this.d = 1
    }

    /**
     * Adds a file to the ZIP archive
     *
     * @param file The file stream to add
     */
    add(file) {
        if (this.d & 2) throw 'stream finished'

        const ctx = this
        const f = strToU8(file.filename), fl = f.length
        const com = file.comment, o = com && strToU8(com)
        const u = fl !== file.filename.length || (o && (com.length !== o.length))
        const hl = fl + exfl(file.extra) + 30
        if (fl > 65535) throw 'filename too long'

        const header = new u8(hl)
        wzh(header, 0, file, f, u)

        let chks = [header]
        const pAll = () => {
            for (const chk of chks) ctx.ondata(null, chk, false)
            chks = []
        }

        let tr = this.d
        this.d = 0

        const ind = this.u.length
        const uf = mrg(file, {
            f,
            u,
            o,
            t: () => {
                if (file.terminate) file.terminate()
            },
            r: () => {
                pAll()
                if (tr) {
                    const nxt = ctx.u[ind + 1]
                    nxt ? nxt.r() : ctx.d = 1
                }
                tr = 1
            },
        })

        let cl = 0
        file.ondata = (err, dat, final) => {
            if (err) {
                ctx.ondata(err, dat, final)
                ctx.terminate()
            } else {
                cl += dat.length
                chks.push(dat)
                if (final) {
                    const dd = new u8(16)
                    wbytes(dd, 0, 0x8074B50)
                    wbytes(dd, 4, file.crc)
                    wbytes(dd, 8, cl)
                    wbytes(dd, 12, file.size)
                    chks.push(dd)

                    uf.c = cl
                    uf.b = hl + cl + 16
                    uf.crc = file.crc
                    uf.size = file.size

                    if (tr) uf.r()

                    tr = 1
                } else if (tr) pAll()
            }
        }

        this.u.push(uf)
    }

    /**
     * Ends the process of adding files and prepares to emit the final chunks.
     * This *must* be called after adding all desired files for the resulting
     * ZIP file to work properly.
     */
    end() {
        const ctx = this
        if (this.d & 2) {
            if (this.d & 1) throw 'stream finishing'
            throw 'stream finished'
        }
        if (this.d) this.e()
        else this.u.push({
            r: () => {
                if (!(ctx.d & 1))
                    return
                ctx.u.splice(-1, 1)
                ctx.e()
            },
            t: () => {
            },
        })

        this.d = 3
    }

    e() {
        let bt = 0, l = 0, tl = 0
        for (const f of this.u) tl += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0)

        const out = new u8(tl + 22)
        for (const f of this.u) {
            wzh(out, bt, f, f.f, f.u, f.c, l, f.o)
            bt += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0)
            l += f.b
        }
        wzf(out, bt, this.u.length, tl, l)
        this.ondata(null, out, true)
        this.d = 2
    }

    /**
     * A method to terminate any internal workers used by the stream. Subsequent
     * calls to add() will fail.
     */
    terminate() {
        for (const f of this.u) f.t()
        this.d = 2
    }
}

export {Zip}

export function zip(data, opts, cb) {
    if (!cb) cb = opts, opts = {}

    if (typeof cb != 'function') throw 'no callback'

    const r = {}
    fltn(data, '', r, opts)
    const k = Object.keys(r)

    let lft = k.length, o = 0, tot = 0
    const slft = lft, files = new Array(lft)
    const term = []

    const tAll = () => {
        for (let i = 0; i < term.length; ++i) term[i]()
    }

    const cbf = () => {
        const out = new u8(tot + 22), oe = o, cdl = tot - o
        tot = 0
        for (let i = 0; i < slft; ++i) {
            const f = files[i]
            try {
                const l = f.c.length
                wzh(out, tot, f, f.f, f.u, l)

                const badd = 30 + f.f.length + exfl(f.extra)
                const loc = tot + badd
                out.set(f.c, loc)
                wzh(out, o, f, f.f, f.u, l, tot, f.m), o += 16 + badd + (f.m ? f.m.length : 0)
                tot = loc + l
            } catch (e) {
                return cb(e, null)
            }
        }
        wzf(out, o, files.length, cdl, oe)
        cb(null, out)
    }

    if (!lft) cbf()
    // Cannot use lft because it can decrease
    for (let i = 0; i < slft; ++i) {
        const fn = k[i]
        const [file, p] = r[fn]
        const c = crc(), size = file.length
        c.p(file)

        const f = strToU8(fn), s = f.length
        const com = p.comment, m = com && strToU8(com), ms = m && m.length
        const exl = exfl(p.extra)
        const compression = p.level === 0 ? 0 : 8
        const cbl = (e, d) => {
            if (e) {
                tAll()
                cb(e, null)
            } else {
                const l = d.length
                files[i] = mrg(p, {
                    size: size,
                    crc: c.d(),
                    c: d,
                    f,
                    m,
                    u: s !== fn.length || (m && (com.length !== ms)),
                    compression,
                })
                o += 30 + s + exl + l
                tot += 76 + 2 * (s + exl) + (ms || 0) + l
                if (!--lft) cbf()
            }
        }

        if (s > 65535) cbl('filename too long', null)
        if (!compression) cbl(null, file)
        else if (size < 160000) {
            try {
                cbl(null, deflateSync(file, p))
            } catch (e) {
                cbl(e, null)
            }
        } else term.push(deflate(file, p, cbl))
    }

    return tAll
}

/**
 * Synchronously creates a ZIP file. Prefer using `zip` for better performance
 * with more than one file.
 *
 * @param data The directory structure for the ZIP archive
 * @param opts The main options, merged with per-file options
 * @returns The generated ZIP archive
 */
export function zipSync(data, opts) {
    if (!opts) opts = {}

    const r = {}
    const files = []
    fltn(data, '', r, opts)

    let o = 0, tot = 0
    for (let fn in r) {
        const [file, p] = r[fn]
        const compression = p.level === 0 ? 0 : 8
        const f = strToU8(fn)
        const com = p.comment, m = com && strToU8(com), ms = m && m.length
        const exl = exfl(p.extra)
        const s = f.length
        if (s > 65535) throw 'filename too long'

        const d = compression ? deflateSync(file, p) : file, l = d.length
        const c = crc()
        c.p(file)
        files.push(mrg(p, {
            size: file.length,
            crc: c.d(),
            c: d,
            f,
            m,
            u: s !== fn.length || (m && (com.length !== ms)),
            o: o,
            compression,
        }))

        o += 30 + s + exl + l
        tot += 76 + 2 * (s + exl) + (ms || 0) + l
    }

    const out = new u8(tot + 22), oe = o, cdl = tot - o
    for (let i = 0; i < files.length; ++i) {
        const f = files[i]
        wzh(out, f.o, f, f.f, f.u, f.c.length)

        const badd = 30 + f.f.length + exfl(f.extra)
        out.set(f.c, f.o + badd)
        wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0)
    }

    wzf(out, o, files.length, cdl, oe)

    return out
}

/**
 * Streaming pass-through decompression for ZIP archives
 */
class UnzipPassThrough {
    compression = 0

    push = function (data, final) {
        this.ondata(null, data, final)
    }
}

export {UnzipPassThrough}

/**
 * Streaming DEFLATE decompression for ZIP archives. Prefer AsyncZipInflate for
 * better performance.
 */
class UnzipInflate {
    static compression = 8

    /**
     * Creates a DEFLATE decompression that can be used in ZIP archives
     */
    constructor() {
        const ctx = this
        this.i = new Inflate((dat, final) => ctx.ondata(null, dat, final))
    }

    /**
     *
     * @param err
     * @param {Uint8Array} data
     * @param {boolean} final
     */
    ondata(err = null, data, final) {
    }

    push(data, final) {
        try {
            this.i.push(data, final)
        } catch (e) {
            this.ondata(e, data, final)
        }
    }
}

export {UnzipInflate}

/**
 * Asynchronous streaming DEFLATE decompression for ZIP archives
 */
class AsyncUnzipInflate {
    static compression = 8

    /**
     * Creates a DEFLATE decompression that can be used in ZIP archives
     *
     * @param {string} _
     * @param {number} sz
     */
    constructor(_, sz) {
        const ctx = this
        if (sz < 320000) {
            this.i = new Inflate((dat, final) => {
                ctx.ondata(null, dat, final)
            })
        } else {
            this.i = new AsyncInflate((err, dat, final) => {
                ctx.ondata(err, dat, final)
            })
            this.terminate = this.i.terminate
        }
    }

    /**
     *
     * @param err
     * @param {Uint8Array} data
     * @param {boolean} final
     */
    ondata(err = null, data, final) {
    }

    push(data, final) {
        if (this.i.terminate) data = slc(data, 0)
        this.i.push(data, final)
    }
}

export {AsyncUnzipInflate}

/**
 * A ZIP archive decompression stream that emits files as they are discovered
 */
class Unzip {
    /**
     * Creates a ZIP decompression stream
     * @param cb The callback to call whenever a file in the ZIP archive is found
     */
    constructor(cb) {
        this.onfile = cb
        this.k = []
        this.o = {
            0: UnzipPassThrough,
        }
        this.p = et
    }

    /**
     * Pushes a chunk to be unzipped
     * @param {Uint8Array} chunk The chunk to push
     * @param {boolean} final Whether this is the last chunk
     */
    push(chunk, final) {
        if (!this.onfile) throw 'no callback'
        if (!this.p) throw 'stream finished'

        const ctx = this
        if (this.c > 0) {
            const len = Math.min(this.c, chunk.length)
            const toAdd = chunk.subarray(0, len)
            this.c -= len
            if (this.d) this.d.push(toAdd, !this.c)
            else this.k[0].push(toAdd)

            chunk = chunk.subarray(len)
            if (chunk.length) return this.push(chunk, final)
        } else {
            let f = 0, i = 0, is, buf
            if (!this.p.length) buf = chunk
            else if (!chunk.length) buf = this.p
            else {
                buf = new u8(this.p.length + chunk.length)
                buf.set(this.p)
                buf.set(chunk, this.p.length)
            }

            const l = buf.length, oc = this.c, add = oc && this.d

            for (; i < l - 4; ++i) {
                const sig = b4(buf, i)
                if (sig === 0x4034B50) {
                    f = 1
                    is = i
                    this.d = null
                    this.c = 0
                    const bf = b2(buf, i + 6), cmp = b2(buf, i + 8), fnl = b2(buf, i + 26), es = b2(buf, i + 28)
                    const u = bf & 2048, dd = bf & 8
                    if (l > i + 30 + fnl + es) {
                        const chks = []
                        this.k.unshift(chks)
                        f = 2
                        let sc = b4(buf, i + 18), su = b4(buf, i + 22)
                        const fn = strFromU8(buf.subarray(i + 30, i += 30 + fnl), !u)
                        if (sc === 4294967295) {
                            [sc, su] = dd ? [-2] : z64e(buf, i)
                        } else if (dd) sc = -1

                        i += es
                        this.c = sc
                        let d
                        const file = {
                            name: fn,
                            compression: cmp,
                            start: () => {
                                if (!file.ondata) throw 'no callback'
                                if (!sc) file.ondata(null, et, true)
                                else {
                                    const ctr = ctx.o[cmp]
                                    if (!ctr) throw `unknown compression type ${cmp}`

                                    d = sc < 0 ? new ctr(fn) : new ctr(fn, sc, su)
                                    d.ondata = (err, dat, final) => {
                                        file.ondata(err, dat, final)
                                    }
                                    for (const dat of chks) d.push(dat, false)

                                    if (ctx.k[0] === chks && ctx.c) ctx.d = d
                                    else d.push(et, true)
                                }
                            },
                            terminate: () => {
                                if (d && d.terminate) d.terminate()
                            },
                        }
                        if (sc >= 0) {
                            file.size = sc
                            file.originalSize = su
                        }

                        this.onfile(file)
                    }

                    break
                } else if (oc) {
                    if (sig === 0x8074B50) {
                        is = i += 12 + (oc === -2 && 8)
                        f = 3
                        this.c = 0

                        break
                    } else if (sig === 0x2014B50) {
                        is = i -= 4
                        f = 3
                        this.c = 0

                        break
                    }
                }

                if (state_1 === 'break') break
            }

            this.p = et
            if (oc < 0) {
                const dat = f ?
                    buf.subarray(0, is - 12 - (oc === -2 && 8) - (b4(buf, is - 16) === 0x8074B50 && 4)) : buf.subarray(0, i)
                if (add) add.push(dat, !!f)
                else this.k[+(f === 2)].push(dat)
            }

            if (f & 2) return this.push(buf.subarray(i), final)

            this.p = buf.subarray(i)
        }

        if (final) {
            if (this.c) throw 'invalid zip file'
            this.p = null
        }
    }

    /**
     * Registers a decoder with the stream, allowing for files compressed with
     * the compression type provided to be expanded correctly
     *
     * @param decoder The decoder constructor
     */
    register(decoder) {
        this.o[decoder.compression] = decoder
    }

    /**
     * The handler to call whenever a file is discovered
     */
    onfile(file) {}
}

export {Unzip}

/**
 * Asynchronously decompresses a ZIP archive
 *
 * @param data The raw compressed ZIP file
 * @param cb The callback to call with the decompressed files
 * @returns A function that can be used to immediately terminate the unzipping
 */
export function unzip(data, cb) {
    if (typeof cb != 'function') throw 'no callback'

    const term = []
    const tAll = () => {
        for (let i = 0; i < term.length; ++i) term[i]()
    }

    const files = {}
    let e = data.length - 22
    for (; b4(data, e) !== 0x6054B50; --e) {
        if (!e || data.length - e > 65558) {
            cb('invalid zip file', null)
            return
        }
    }

    let lft = b2(data, e + 8)
    if (!lft) cb(null, {})

    let c = lft, o = b4(data, e + 16), z = o === 4294967295
    if (z) {
        e = b4(data, e - 12)
        if (b4(data, e) !== 0x6064B50) {
            cb('invalid zip file', null)
            return
        }

        c = lft = b4(data, e + 32)
        o = b4(data, e + 48)
    }

    for (let i = 0; i < c; ++i) {
        const [type, sc, su, fn, no, off] = zh(data, o, z)
        const b = slzh(data, off)
        o = no

        const cbl = (e, d) => {
            if (e) {
                tAll()
                cb(e, null)
            } else {
                if (d) files[fn] = d
                if (!--lft) cb(null, files)
            }
        }
        if (!type) cbl(null, slc(data, b, b + sc))
        else if (type === 8) {
            const infl = data.subarray(b, b + sc)
            if (sc < 320000) {
                try {
                    cbl(null, inflateSync(infl, new u8(su)))
                } catch (e) {
                    cbl(e, null)
                }
            } else term.push(inflate(infl, {size: su}, cbl))
        } else cbl('unknown compression type ' + type, null)
    }

    return tAll
}

/**
 * Synchronously decompresses a ZIP archive. Prefer using `unzip` for better
 * performance with more than one file.
 *
 * @param data The raw compressed ZIP file
 * @returns The decompressed files
 */
export function unzipSync(data) {
    const files = {}

    let e = data.length - 22
    for (; b4(data, e) !== 0x6054B50; --e) {
        if (!e || data.length - e > 65558) throw 'invalid zip file'
    }

    let c = b2(data, e + 8)
    if (!c) return {}

    let o = b4(data, e + 16)
    const z = o === 4294967295
    if (z) {
        e = b4(data, e - 12)
        if (b4(data, e) !== 0x6064B50)
            throw 'invalid zip file'
        c = b4(data, e + 32)
        o = b4(data, e + 48)
    }
    for (let i = 0; i < c; ++i) {
        const [type, sc, su, fn, no, off] = zh(data, o, z)
        const b = slzh(data, off)
        o = no

        if (!type) files[fn] = slc(data, b, b + sc)
        else if (type === 8) files[fn] = inflateSync(data.subarray(b, b + sc), new u8(su))
        else throw `unknown compression type ${type}`
    }

    return files
}