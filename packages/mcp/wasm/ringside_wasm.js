/* @ts-self-types="./ringside_wasm.d.ts" */

/**
 * Scripted fighter usable from TypeScript bots.
 */
class ScriptedBot {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ScriptedBotFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_scriptedbot_free(ptr, 0);
    }
    /**
     * @param {Uint8Array | number[]} state_bytes
     * @param {number} me
     * @returns {number}
     */
    act(state_bytes, me) {
        const val2 = +me;
        const ptr0 = passArray8ToWasm0(state_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.scriptedbot_act(this.__wbg_ptr, ptr0, len0, val2);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * policy: 0 aggressive, 1 kiting, 2 defensive, 3 random. skill: 0..=1000.
     * @param {number} policy
     * @param {number} skill
     * @param {bigint} seed
     */
    constructor(policy, skill, seed) {
        const ret = wasm.scriptedbot_new(policy, skill, seed);
        this.__wbg_ptr = ret;
        ScriptedBotFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) ScriptedBot.prototype[Symbol.dispose] = ScriptedBot.prototype.free;
exports.ScriptedBot = ScriptedBot;

/**
 * Discrete policy action (0..72) → input bits for fighter `me`.
 * @param {Uint8Array | number[]} state_bytes
 * @param {number} me
 * @param {number} action
 * @returns {number}
 */
function actionToInput(state_bytes, me, action) {
    const val2 = +me;
    const val3 = +action;
    const ptr0 = passArray8ToWasm0(state_bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.actionToInput(ptr0, len0, val2, val3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}
exports.actionToInput = actionToInput;

/**
 * Direction index (0..16) toward (dx, dy).
 * @param {number} dx
 * @param {number} dy
 * @returns {number}
 */
function aimAt(dx, dy) {
    const ret = wasm.aimAt(dx, dy);
    return ret;
}
exports.aimAt = aimAt;

/**
 * Final hash of determinism episode `episode` (same generator as native and Python).
 * @param {bigint} episode
 * @returns {Uint8Array}
 */
function determinismEpisodeHash(episode) {
    const ret = wasm.determinismEpisodeHash(episode);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}
exports.determinismEpisodeHash = determinismEpisodeHash;

/**
 * Packs an input.
 * @param {number} mv
 * @param {boolean} fire
 * @param {boolean} dash
 * @param {boolean} shield
 * @param {number} aim
 * @returns {number}
 */
function encodeInput(mv, fire, dash, shield, aim) {
    const ret = wasm.encodeInput(mv, fire, dash, shield, aim);
    return ret;
}
exports.encodeInput = encodeInput;

/**
 * The 16 Q32.32 pricing features.
 * @param {Uint8Array | number[]} state_bytes
 * @returns {BigInt64Array}
 */
function features(state_bytes) {
    const ptr0 = passArray8ToWasm0(state_bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.features(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayI64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v2;
}
exports.features = features;

/**
 * Genesis hash of a state.
 * @param {Uint8Array | number[]} state_bytes
 * @returns {Uint8Array}
 */
function genesisHash(state_bytes) {
    const ptr0 = passArray8ToWasm0(state_bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.genesisHash(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}
exports.genesisHash = genesisHash;

/**
 * One hash-chain link.
 * @param {Uint8Array | number[]} prev
 * @param {bigint} tick
 * @param {Uint8Array | number[]} state_bytes
 * @returns {Uint8Array}
 */
function hashLink(prev, tick, state_bytes) {
    const val3 = BigInt.asIntN(64, tick);
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArray8ToWasm0(prev, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(state_bytes, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.hashLink(ptr0, len0, val3, ptr1, len1);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v4;
}
exports.hashLink = hashLink;

/**
 * Initial state bytes for a match.
 * @param {number} dt_ms
 * @param {Uint8Array | number[]} seed
 * @returns {Uint8Array}
 */
function newState(dt_ms, seed) {
    const val2 = +dt_ms;
    const ptr0 = passArray8ToWasm0(seed, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.newState(val2, ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}
exports.newState = newState;

/**
 * Policy observation (22 floats) for fighter `me`, identical to training.
 * @param {Uint8Array | number[]} state_bytes
 * @param {number} me
 * @returns {Float32Array}
 */
function observe(state_bytes, me) {
    const val2 = +me;
    const ptr0 = passArray8ToWasm0(state_bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.observe(ptr0, len0, val2);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v3 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v3;
}
exports.observe = observe;

/**
 * Calibrated P(A wins) ×2^32 from model params bytes and a state.
 * @param {Uint8Array | number[]} params
 * @param {Uint8Array | number[]} state_bytes
 * @returns {number}
 */
function predict(params, state_bytes) {
    let ptr0, len0, ptr1, len1;
    try {
        ptr0 = passArray8ToWasm0(params, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray8ToWasm0(state_bytes, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.predict(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0] >>> 0;
}
exports.predict = predict;

/**
 * Quotes [mid, bidA, askA, bidB, askB, spread] in micro-USDC.
 * @param {number} p
 * @param {bigint} vol
 * @param {bigint} time_left_ms
 * @param {bigint} inv_a
 * @param {bigint} inv_b
 * @param {bigint} cap
 * @param {bigint} s_base
 * @param {bigint} s_vol_bps
 * @param {bigint} s_time
 * @param {bigint} k_skew
 * @returns {BigUint64Array}
 */
function quotes(p, vol, time_left_ms, inv_a, inv_b, cap, s_base, s_vol_bps, s_time, k_skew) {
    const ret = wasm.quotes(p, vol, time_left_ms, inv_a, inv_b, cap, s_base, s_vol_bps, s_time, k_skew);
    var v1 = getArrayU64FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
    return v1;
}
exports.quotes = quotes;

/**
 * Replays a match. `inputs` is a flat [a0, b0, a1, b1, …] array; `seed_events` holds 36-byte
 * records (u32 LE apply-at tick, 32-byte seed). Returns 32 bytes per tick (the hash chain).
 * @param {Uint8Array | number[]} initial_state
 * @param {Uint16Array | number[]} inputs
 * @param {Uint8Array | number[]} seed_events
 * @returns {Uint8Array}
 */
function replay(initial_state, inputs, seed_events) {
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passArray8ToWasm0(initial_state, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray16ToWasm0(inputs, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray8ToWasm0(seed_events, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 2, 2); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.replay(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v4;
}
exports.replay = replay;

/**
 * Final state bytes after a replay (same arguments as `replay`).
 * @param {Uint8Array | number[]} initial_state
 * @param {Uint16Array | number[]} inputs
 * @param {Uint8Array | number[]} seed_events
 * @returns {Uint8Array}
 */
function replayFinalState(initial_state, inputs, seed_events) {
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passArray8ToWasm0(initial_state, wasm.__wbindgen_malloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = passArray16ToWasm0(inputs, wasm.__wbindgen_malloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = passArray8ToWasm0(seed_events, wasm.__wbindgen_malloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 2, 2); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.replayFinalState(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v4;
}
exports.replayFinalState = replayFinalState;

/**
 * Default sigmoid LUT (1024 × u32), built with the integer exp.
 * @returns {Uint32Array}
 */
function sigmoidLut() {
    const ret = wasm.sigmoidLut();
    var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
    return v1;
}
exports.sigmoidLut = sigmoidLut;

/**
 * Size of the canonical state encoding.
 * @returns {number}
 */
function simBytes() {
    const ret = wasm.simBytes();
    return ret >>> 0;
}
exports.simBytes = simBytes;

/**
 * JSON view of a state for rendering.
 * @param {Uint8Array | number[]} state_bytes
 * @returns {string}
 */
function stateJson(state_bytes) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passArray8ToWasm0(state_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.stateJson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
exports.stateJson = stateJson;

/**
 * Steps a state; returns the new state bytes followed by 4 bytes of event flags (LE) and
 * 4 bytes of [dmgA, dmgB, pickupA, pickupB].
 * @param {Uint8Array | number[]} state_bytes
 * @param {number} input_a
 * @param {number} input_b
 * @returns {Uint8Array}
 */
function step(state_bytes, input_a, input_b) {
    const val2 = +input_a;
    const val3 = +input_b;
    const ptr0 = passArray8ToWasm0(state_bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.step(ptr0, len0, val2, val3);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v4;
}
exports.step = step;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./ringside_wasm_bg.js": import0,
    };
}

const ScriptedBotFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_scriptedbot_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayI64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getBigInt64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getBigUint64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedBigInt64ArrayMemory0 = null;
function getBigInt64ArrayMemory0() {
    if (cachedBigInt64ArrayMemory0 === null || cachedBigInt64ArrayMemory0.byteLength === 0) {
        cachedBigInt64ArrayMemory0 = new BigInt64Array(wasm.memory.buffer);
    }
    return cachedBigInt64ArrayMemory0;
}

let cachedBigUint64ArrayMemory0 = null;
function getBigUint64ArrayMemory0() {
    if (cachedBigUint64ArrayMemory0 === null || cachedBigUint64ArrayMemory0.byteLength === 0) {
        cachedBigUint64ArrayMemory0 = new BigUint64Array(wasm.memory.buffer);
    }
    return cachedBigUint64ArrayMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray16ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 2, 2) >>> 0;
    getUint16ArrayMemory0().set(arg, ptr / 2);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
function decodeText(bytes) {
    return cachedTextDecoder.decode(bytes);
}

let WASM_VECTOR_LEN = 0;

const wasmPath = `${__dirname}/ringside_wasm_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
const wasmModule = new WebAssembly.Module(wasmBytes);
let wasmInstance = new WebAssembly.Instance(wasmModule, __wbg_get_imports());
let wasm = wasmInstance.exports;
wasm.__wbindgen_start();
