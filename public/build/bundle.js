
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function get_store_value(store) {
        let value;
        subscribe(store, _ => value = _)();
        return value;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function init_binding_group(group) {
        let _inputs;
        return {
            /* push */ p(...inputs) {
                _inputs = inputs;
                _inputs.forEach(input => group.push(input));
            },
            /* remove */ r() {
                _inputs.forEach(input => group.splice(group.indexOf(input), 1));
            }
        };
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        if (value == null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * Creates an event dispatcher that can be used to dispatch [component events](/docs#template-syntax-component-directives-on-eventname).
     * Event dispatchers are functions that can take two arguments: `name` and `detail`.
     *
     * Component events created with `createEventDispatcher` create a
     * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
     * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
     * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
     * property and can contain any type of data.
     *
     * https://svelte.dev/docs#run-time-svelte-createeventdispatcher
     */
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail, { cancelable = false } = {}) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail, { cancelable });
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
                return !event.defaultPrevented;
            }
            return true;
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    function getBrowser() {
        // @ts-ignore
        if (typeof browser !== "undefined") {
            // @ts-ignore
            return browser;
            // @ts-ignore
        }
        else if (typeof chrome !== "undefined") {
            // @ts-ignore
            return chrome;
        }
        return null;
    }
    let web = getBrowser();
    function domainToUrl(url) {
        return url.split("/")[2];
    }
    // function that return remaining time from data display day only if it's more than 1 day and minute, complete with zero if one character
    function remainingTime(datetime) {
        let now = new Date();
        let diff = datetime.getTime() - now.getTime();
        let days = Math.floor(diff / (1000 * 60 * 60 * 24));
        let hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        let minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        let seconds = Math.floor((diff % (1000 * 60)) / 1000);
        let _hours = hours.toString();
        let _minutes = minutes.toString();
        let _seconds = seconds.toString();
        if (seconds < 10) {
            _seconds = "0" + seconds;
        }
        if (minutes < 10) {
            _minutes = "0" + minutes;
        }
        if (hours < 10) {
            _hours = "0" + hours;
        }
        if (days > 0) {
            return days + " days" + " " + _hours + " hours";
        }
        return _hours + ":" + _minutes + ":" + _seconds + "";
    }
    function getDuration(choice) {
        let duration = new Date();
        switch (choice) {
            case 0:
                return new Date();
            case 1:
                return new Date(duration.getTime() + 100 * 365 * 24 * 60 * 60 * 1000);
            case 2:
                return new Date(duration.getTime() + 5 * 60 * 1000);
            case 3:
                return new Date(duration.getTime() + 60 * 60 * 1000);
            case 4:
                return new Date(duration.getTime() + 5 * 60 * 60 * 1000);
            case 5:
                return new Date(duration.getTime() + 5 * 24 * 60 * 60 * 1000);
        }
    }
    function reverseArray(arr) {
        var newArray = [];
        for (var i = arr.length - 1; i >= 0; i--) {
            newArray.push(arr[i]);
        }
        return newArray;
    }
    function timeAgo(date) {
        let now = new Date();
        let diff = now.getTime() - date.getTime();
        let days = Math.floor(diff / (1000 * 60 * 60 * 24));
        let hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        let minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        let seconds = Math.floor((diff % (1000 * 60)) / 1000);
        if (days > 0) {
            return days + " days ago";
        }
        else if (hours > 0) {
            return hours + " hours ago";
        }
        else if (minutes > 0) {
            return minutes + " minutes ago";
        }
        else if (seconds > 0) {
            return seconds + " seconds ago";
        }
        return "now";
    }
    const defaultWebNotificationSettings = [
        {
            name: "signEvent",
            description: "Sign Event",
            state: false,
        },
        {
            name: "permission",
            description: "Authentifcation",
            state: false,
        },
        {
            name: "nip04",
            description: "Message",
            state: false,
        },
        {
            name: "getPublicKey",
            description: "Get Public Key",
            state: false,
        },
        {
            name: "getRelays",
            description: "Get Relays",
            state: false,
        },
    ];
    function tr(name) {
        switch (name) {
            case "signEvent":
                return "Sign Event";
            case "permission":
                return "Get Permission";
            case "nip04":
                return "Message Encryption/Decription";
            case "nip04.encrypt":
                return "Message Encryption/Decription";
            case "nip04.decrypt":
                return "Message Encryption/Decription";
            case "getPublicKey":
                return "Get Public Key";
            case "getRelays":
                return "Get Relays";
            default:
                return name;
        }
    }

    function number$1(n) {
        if (!Number.isSafeInteger(n) || n < 0)
            throw new Error(`Wrong positive integer: ${n}`);
    }
    function bool$1(b) {
        if (typeof b !== 'boolean')
            throw new Error(`Expected boolean, not ${b}`);
    }
    function bytes$1(b, ...lengths) {
        if (!(b instanceof Uint8Array))
            throw new TypeError('Expected Uint8Array');
        if (lengths.length > 0 && !lengths.includes(b.length))
            throw new TypeError(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
    }
    function hash$1(hash) {
        if (typeof hash !== 'function' || typeof hash.create !== 'function')
            throw new Error('Hash should be wrapped by utils.wrapConstructor');
        number$1(hash.outputLen);
        number$1(hash.blockLen);
    }
    function exists$1(instance, checkFinished = true) {
        if (instance.destroyed)
            throw new Error('Hash instance has been destroyed');
        if (checkFinished && instance.finished)
            throw new Error('Hash#digest() has already been called');
    }
    function output$1(out, instance) {
        bytes$1(out);
        const min = instance.outputLen;
        if (out.length < min) {
            throw new Error(`digestInto() expects output buffer of length at least ${min}`);
        }
    }
    const assert$1 = {
        number: number$1,
        bool: bool$1,
        bytes: bytes$1,
        hash: hash$1,
        exists: exists$1,
        output: output$1,
    };

    const crypto$2 = typeof globalThis === 'object' && 'crypto' in globalThis ? globalThis.crypto : undefined;

    /*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // We use `globalThis.crypto`, but node.js versions earlier than v19 don't
    // declare it in global scope. For node.js, package.json#exports field mapping
    // rewrites import from `crypto` to `cryptoNode`, which imports native module.
    // Makes the utils un-importable in browsers without a bundler.
    // Once node.js 18 is deprecated, we can just drop the import.
    // Cast array to view
    const createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    // The rotate right (circular right shift) operation for uint32
    const rotr = (word, shift) => (word << (32 - shift)) | (word >>> shift);
    // big-endian hardware is rare. Just in case someone still decides to run hashes:
    // early-throw an error because we don't support BE yet.
    const isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
    if (!isLE)
        throw new Error('Non little-endian hardware is not supported');
    const hexes$1 = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
    /**
     * @example bytesToHex(Uint8Array.from([0xde, 0xad, 0xbe, 0xef])) // 'deadbeef'
     */
    function bytesToHex$1(uint8a) {
        // pre-caching improves the speed 6x
        if (!(uint8a instanceof Uint8Array))
            throw new Error('Uint8Array expected');
        let hex = '';
        for (let i = 0; i < uint8a.length; i++) {
            hex += hexes$1[uint8a[i]];
        }
        return hex;
    }
    /**
     * @example hexToBytes('deadbeef') // Uint8Array.from([0xde, 0xad, 0xbe, 0xef])
     */
    function hexToBytes$1(hex) {
        if (typeof hex !== 'string') {
            throw new TypeError('hexToBytes: expected string, got ' + typeof hex);
        }
        if (hex.length % 2)
            throw new Error('hexToBytes: received invalid unpadded hex');
        const array = new Uint8Array(hex.length / 2);
        for (let i = 0; i < array.length; i++) {
            const j = i * 2;
            const hexByte = hex.slice(j, j + 2);
            const byte = Number.parseInt(hexByte, 16);
            if (Number.isNaN(byte) || byte < 0)
                throw new Error('Invalid byte sequence');
            array[i] = byte;
        }
        return array;
    }
    function utf8ToBytes$1(str) {
        if (typeof str !== 'string') {
            throw new TypeError(`utf8ToBytes expected string, got ${typeof str}`);
        }
        return new TextEncoder().encode(str);
    }
    function toBytes(data) {
        if (typeof data === 'string')
            data = utf8ToBytes$1(data);
        if (!(data instanceof Uint8Array))
            throw new TypeError(`Expected input type is Uint8Array (got ${typeof data})`);
        return data;
    }
    /**
     * Concats Uint8Array-s into one; like `Buffer.concat([buf1, buf2])`
     * @example concatBytes(buf1, buf2)
     */
    function concatBytes$1(...arrays) {
        if (!arrays.every((a) => a instanceof Uint8Array))
            throw new Error('Uint8Array list expected');
        if (arrays.length === 1)
            return arrays[0];
        const length = arrays.reduce((a, arr) => a + arr.length, 0);
        const result = new Uint8Array(length);
        for (let i = 0, pad = 0; i < arrays.length; i++) {
            const arr = arrays[i];
            result.set(arr, pad);
            pad += arr.length;
        }
        return result;
    }
    // For runtime check if class implements interface
    class Hash {
        // Safe version that clones internal state
        clone() {
            return this._cloneInto();
        }
    }
    function wrapConstructor(hashConstructor) {
        const hashC = (message) => hashConstructor().update(toBytes(message)).digest();
        const tmp = hashConstructor();
        hashC.outputLen = tmp.outputLen;
        hashC.blockLen = tmp.blockLen;
        hashC.create = () => hashConstructor();
        return hashC;
    }
    /**
     * Secure PRNG. Uses `globalThis.crypto` or node.js crypto module.
     */
    function randomBytes(bytesLength = 32) {
        if (crypto$2 && typeof crypto$2.getRandomValues === 'function') {
            return crypto$2.getRandomValues(new Uint8Array(bytesLength));
        }
        throw new Error('crypto.getRandomValues must be defined');
    }

    // Polyfill for Safari 14
    function setBigUint64$1(view, byteOffset, value, isLE) {
        if (typeof view.setBigUint64 === 'function')
            return view.setBigUint64(byteOffset, value, isLE);
        const _32n = BigInt(32);
        const _u32_max = BigInt(0xffffffff);
        const wh = Number((value >> _32n) & _u32_max);
        const wl = Number(value & _u32_max);
        const h = isLE ? 4 : 0;
        const l = isLE ? 0 : 4;
        view.setUint32(byteOffset + h, wh, isLE);
        view.setUint32(byteOffset + l, wl, isLE);
    }
    // Base SHA2 class (RFC 6234)
    let SHA2$1 = class SHA2 extends Hash {
        constructor(blockLen, outputLen, padOffset, isLE) {
            super();
            this.blockLen = blockLen;
            this.outputLen = outputLen;
            this.padOffset = padOffset;
            this.isLE = isLE;
            this.finished = false;
            this.length = 0;
            this.pos = 0;
            this.destroyed = false;
            this.buffer = new Uint8Array(blockLen);
            this.view = createView(this.buffer);
        }
        update(data) {
            assert$1.exists(this);
            const { view, buffer, blockLen } = this;
            data = toBytes(data);
            const len = data.length;
            for (let pos = 0; pos < len;) {
                const take = Math.min(blockLen - this.pos, len - pos);
                // Fast path: we have at least one block in input, cast it to view and process
                if (take === blockLen) {
                    const dataView = createView(data);
                    for (; blockLen <= len - pos; pos += blockLen)
                        this.process(dataView, pos);
                    continue;
                }
                buffer.set(data.subarray(pos, pos + take), this.pos);
                this.pos += take;
                pos += take;
                if (this.pos === blockLen) {
                    this.process(view, 0);
                    this.pos = 0;
                }
            }
            this.length += data.length;
            this.roundClean();
            return this;
        }
        digestInto(out) {
            assert$1.exists(this);
            assert$1.output(out, this);
            this.finished = true;
            // Padding
            // We can avoid allocation of buffer for padding completely if it
            // was previously not allocated here. But it won't change performance.
            const { buffer, view, blockLen, isLE } = this;
            let { pos } = this;
            // append the bit '1' to the message
            buffer[pos++] = 0b10000000;
            this.buffer.subarray(pos).fill(0);
            // we have less than padOffset left in buffer, so we cannot put length in current block, need process it and pad again
            if (this.padOffset > blockLen - pos) {
                this.process(view, 0);
                pos = 0;
            }
            // Pad until full block byte with zeros
            for (let i = pos; i < blockLen; i++)
                buffer[i] = 0;
            // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
            // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
            // So we just write lowest 64 bits of that value.
            setBigUint64$1(view, blockLen - 8, BigInt(this.length * 8), isLE);
            this.process(view, 0);
            const oview = createView(out);
            const len = this.outputLen;
            // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
            if (len % 4)
                throw new Error('_sha2: outputLen should be aligned to 32bit');
            const outLen = len / 4;
            const state = this.get();
            if (outLen > state.length)
                throw new Error('_sha2: outputLen bigger than state');
            for (let i = 0; i < outLen; i++)
                oview.setUint32(4 * i, state[i], isLE);
        }
        digest() {
            const { buffer, outputLen } = this;
            this.digestInto(buffer);
            const res = buffer.slice(0, outputLen);
            this.destroy();
            return res;
        }
        _cloneInto(to) {
            to || (to = new this.constructor());
            to.set(...this.get());
            const { blockLen, buffer, length, finished, destroyed, pos } = this;
            to.length = length;
            to.pos = pos;
            to.finished = finished;
            to.destroyed = destroyed;
            if (length % blockLen)
                to.buffer.set(buffer);
            return to;
        }
    };

    // Choice: a ? b : c
    const Chi$1 = (a, b, c) => (a & b) ^ (~a & c);
    // Majority function, true if any two inpust is true
    const Maj$1 = (a, b, c) => (a & b) ^ (a & c) ^ (b & c);
    // Round constants:
    // first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
    // prettier-ignore
    const SHA256_K$1 = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    // Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
    // prettier-ignore
    const IV$1 = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    // Temporary buffer, not used to store anything between runs
    // Named this way because it matches specification.
    const SHA256_W$1 = new Uint32Array(64);
    let SHA256$1 = class SHA256 extends SHA2$1 {
        constructor() {
            super(64, 32, 8, false);
            // We cannot use array here since array allows indexing by variable
            // which means optimizer/compiler cannot use registers.
            this.A = IV$1[0] | 0;
            this.B = IV$1[1] | 0;
            this.C = IV$1[2] | 0;
            this.D = IV$1[3] | 0;
            this.E = IV$1[4] | 0;
            this.F = IV$1[5] | 0;
            this.G = IV$1[6] | 0;
            this.H = IV$1[7] | 0;
        }
        get() {
            const { A, B, C, D, E, F, G, H } = this;
            return [A, B, C, D, E, F, G, H];
        }
        // prettier-ignore
        set(A, B, C, D, E, F, G, H) {
            this.A = A | 0;
            this.B = B | 0;
            this.C = C | 0;
            this.D = D | 0;
            this.E = E | 0;
            this.F = F | 0;
            this.G = G | 0;
            this.H = H | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4)
                SHA256_W$1[i] = view.getUint32(offset, false);
            for (let i = 16; i < 64; i++) {
                const W15 = SHA256_W$1[i - 15];
                const W2 = SHA256_W$1[i - 2];
                const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ (W15 >>> 3);
                const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ (W2 >>> 10);
                SHA256_W$1[i] = (s1 + SHA256_W$1[i - 7] + s0 + SHA256_W$1[i - 16]) | 0;
            }
            // Compression function main loop, 64 rounds
            let { A, B, C, D, E, F, G, H } = this;
            for (let i = 0; i < 64; i++) {
                const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
                const T1 = (H + sigma1 + Chi$1(E, F, G) + SHA256_K$1[i] + SHA256_W$1[i]) | 0;
                const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
                const T2 = (sigma0 + Maj$1(A, B, C)) | 0;
                H = G;
                G = F;
                F = E;
                E = (D + T1) | 0;
                D = C;
                C = B;
                B = A;
                A = (T1 + T2) | 0;
            }
            // Add the compressed chunk to the current hash value
            A = (A + this.A) | 0;
            B = (B + this.B) | 0;
            C = (C + this.C) | 0;
            D = (D + this.D) | 0;
            E = (E + this.E) | 0;
            F = (F + this.F) | 0;
            G = (G + this.G) | 0;
            H = (H + this.H) | 0;
            this.set(A, B, C, D, E, F, G, H);
        }
        roundClean() {
            SHA256_W$1.fill(0);
        }
        destroy() {
            this.set(0, 0, 0, 0, 0, 0, 0, 0);
            this.buffer.fill(0);
        }
    };
    // Constants from https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
    let SHA224$1 = class SHA224 extends SHA256$1 {
        constructor() {
            super();
            this.A = 0xc1059ed8 | 0;
            this.B = 0x367cd507 | 0;
            this.C = 0x3070dd17 | 0;
            this.D = 0xf70e5939 | 0;
            this.E = 0xffc00b31 | 0;
            this.F = 0x68581511 | 0;
            this.G = 0x64f98fa7 | 0;
            this.H = 0xbefa4fa4 | 0;
            this.outputLen = 28;
        }
    };
    /**
     * SHA2-256 hash function
     * @param message - data that would be hashed
     */
    const sha256$1 = wrapConstructor(() => new SHA256$1());
    wrapConstructor(() => new SHA224$1());

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    const _0n$4 = BigInt(0);
    const _1n$4 = BigInt(1);
    const _2n$3 = BigInt(2);
    const u8a = (a) => a instanceof Uint8Array;
    const hexes = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
    function bytesToHex(bytes) {
        if (!u8a(bytes))
            throw new Error('Uint8Array expected');
        // pre-caching improves the speed 6x
        let hex = '';
        for (let i = 0; i < bytes.length; i++) {
            hex += hexes[bytes[i]];
        }
        return hex;
    }
    function numberToHexUnpadded(num) {
        const hex = num.toString(16);
        return hex.length & 1 ? `0${hex}` : hex;
    }
    function hexToNumber(hex) {
        if (typeof hex !== 'string')
            throw new Error('hex string expected, got ' + typeof hex);
        // Big Endian
        return BigInt(hex === '' ? '0' : `0x${hex}`);
    }
    // Caching slows it down 2-3x
    function hexToBytes(hex) {
        if (typeof hex !== 'string')
            throw new Error('hex string expected, got ' + typeof hex);
        if (hex.length % 2)
            throw new Error('hex string is invalid: unpadded ' + hex.length);
        const array = new Uint8Array(hex.length / 2);
        for (let i = 0; i < array.length; i++) {
            const j = i * 2;
            const hexByte = hex.slice(j, j + 2);
            const byte = Number.parseInt(hexByte, 16);
            if (Number.isNaN(byte) || byte < 0)
                throw new Error('invalid byte sequence');
            array[i] = byte;
        }
        return array;
    }
    // Big Endian
    function bytesToNumberBE(bytes) {
        return hexToNumber(bytesToHex(bytes));
    }
    function bytesToNumberLE(bytes) {
        if (!u8a(bytes))
            throw new Error('Uint8Array expected');
        return hexToNumber(bytesToHex(Uint8Array.from(bytes).reverse()));
    }
    const numberToBytesBE = (n, len) => hexToBytes(n.toString(16).padStart(len * 2, '0'));
    const numberToBytesLE = (n, len) => numberToBytesBE(n, len).reverse();
    // Returns variable number bytes (minimal bigint encoding?)
    const numberToVarBytesBE = (n) => hexToBytes(numberToHexUnpadded(n));
    function ensureBytes(title, hex, expectedLength) {
        let res;
        if (typeof hex === 'string') {
            try {
                res = hexToBytes(hex);
            }
            catch (e) {
                throw new Error(`${title} must be valid hex string, got "${hex}". Cause: ${e}`);
            }
        }
        else if (u8a(hex)) {
            // Uint8Array.from() instead of hash.slice() because node.js Buffer
            // is instance of Uint8Array, and its slice() creates **mutable** copy
            res = Uint8Array.from(hex);
        }
        else {
            throw new Error(`${title} must be hex string or Uint8Array`);
        }
        const len = res.length;
        if (typeof expectedLength === 'number' && len !== expectedLength)
            throw new Error(`${title} expected ${expectedLength} bytes, got ${len}`);
        return res;
    }
    // Copies several Uint8Arrays into one.
    function concatBytes(...arrs) {
        const r = new Uint8Array(arrs.reduce((sum, a) => sum + a.length, 0));
        let pad = 0; // walk through each item, ensure they have proper type
        arrs.forEach((a) => {
            if (!u8a(a))
                throw new Error('Uint8Array expected');
            r.set(a, pad);
            pad += a.length;
        });
        return r;
    }
    function equalBytes(b1, b2) {
        // We don't care about timing attacks here
        if (b1.length !== b2.length)
            return false;
        for (let i = 0; i < b1.length; i++)
            if (b1[i] !== b2[i])
                return false;
        return true;
    }
    function utf8ToBytes(str) {
        if (typeof str !== 'string') {
            throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
        }
        return new TextEncoder().encode(str);
    }
    // Bit operations
    // Amount of bits inside bigint (Same as n.toString(2).length)
    function bitLen(n) {
        let len;
        for (len = 0; n > _0n$4; n >>= _1n$4, len += 1)
            ;
        return len;
    }
    // Gets single bit at position. NOTE: first bit position is 0 (same as arrays)
    // Same as !!+Array.from(n.toString(2)).reverse()[pos]
    const bitGet = (n, pos) => (n >> BigInt(pos)) & _1n$4;
    // Sets single bit at position
    const bitSet = (n, pos, value) => n | ((value ? _1n$4 : _0n$4) << BigInt(pos));
    // Return mask for N bits (Same as BigInt(`0b${Array(i).fill('1').join('')}`))
    // Not using ** operator with bigints for old engines.
    const bitMask = (n) => (_2n$3 << BigInt(n - 1)) - _1n$4;
    // DRBG
    const u8n = (data) => new Uint8Array(data); // creates Uint8Array
    const u8fr = (arr) => Uint8Array.from(arr); // another shortcut
    /**
     * Minimal HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
     * @returns function that will call DRBG until 2nd arg returns something meaningful
     * @example
     *   const drbg = createHmacDRBG<Key>(32, 32, hmac);
     *   drbg(seed, bytesToKey); // bytesToKey must return Key or undefined
     */
    function createHmacDrbg(hashLen, qByteLen, hmacFn) {
        if (typeof hashLen !== 'number' || hashLen < 2)
            throw new Error('hashLen must be a number');
        if (typeof qByteLen !== 'number' || qByteLen < 2)
            throw new Error('qByteLen must be a number');
        if (typeof hmacFn !== 'function')
            throw new Error('hmacFn must be a function');
        // Step B, Step C: set hashLen to 8*ceil(hlen/8)
        let v = u8n(hashLen); // Minimal non-full-spec HMAC-DRBG from NIST 800-90 for RFC6979 sigs.
        let k = u8n(hashLen); // Steps B and C of RFC6979 3.2: set hashLen, in our case always same
        let i = 0; // Iterations counter, will throw when over 1000
        const reset = () => {
            v.fill(1);
            k.fill(0);
            i = 0;
        };
        const h = (...b) => hmacFn(k, v, ...b); // hmac(k)(v, ...values)
        const reseed = (seed = u8n()) => {
            // HMAC-DRBG reseed() function. Steps D-G
            k = h(u8fr([0x00]), seed); // k = hmac(k || v || 0x00 || seed)
            v = h(); // v = hmac(k || v)
            if (seed.length === 0)
                return;
            k = h(u8fr([0x01]), seed); // k = hmac(k || v || 0x01 || seed)
            v = h(); // v = hmac(k || v)
        };
        const gen = () => {
            // HMAC-DRBG generate() function
            if (i++ >= 1000)
                throw new Error('drbg: tried 1000 values');
            let len = 0;
            const out = [];
            while (len < qByteLen) {
                v = h();
                const sl = v.slice();
                out.push(sl);
                len += v.length;
            }
            return concatBytes(...out);
        };
        const genUntil = (seed, pred) => {
            reset();
            reseed(seed); // Steps D-G
            let res = undefined; // Step H: grind until k is in [1..n-1]
            while (!(res = pred(gen())))
                reseed();
            reset();
            return res;
        };
        return genUntil;
    }
    // Validating curves and fields
    const validatorFns = {
        bigint: (val) => typeof val === 'bigint',
        function: (val) => typeof val === 'function',
        boolean: (val) => typeof val === 'boolean',
        string: (val) => typeof val === 'string',
        isSafeInteger: (val) => Number.isSafeInteger(val),
        array: (val) => Array.isArray(val),
        field: (val, object) => object.Fp.isValid(val),
        hash: (val) => typeof val === 'function' && Number.isSafeInteger(val.outputLen),
    };
    // type Record<K extends string | number | symbol, T> = { [P in K]: T; }
    function validateObject(object, validators, optValidators = {}) {
        const checkField = (fieldName, type, isOptional) => {
            const checkVal = validatorFns[type];
            if (typeof checkVal !== 'function')
                throw new Error(`Invalid validator "${type}", expected function`);
            const val = object[fieldName];
            if (isOptional && val === undefined)
                return;
            if (!checkVal(val, object)) {
                throw new Error(`Invalid param ${String(fieldName)}=${val} (${typeof val}), expected ${type}`);
            }
        };
        for (const [fieldName, type] of Object.entries(validators))
            checkField(fieldName, type, false);
        for (const [fieldName, type] of Object.entries(optValidators))
            checkField(fieldName, type, true);
        return object;
    }
    // validate type tests
    // const o: { a: number; b: number; c: number } = { a: 1, b: 5, c: 6 };
    // const z0 = validateObject(o, { a: 'isSafeInteger' }, { c: 'bigint' }); // Ok!
    // // Should fail type-check
    // const z1 = validateObject(o, { a: 'tmp' }, { c: 'zz' });
    // const z2 = validateObject(o, { a: 'isSafeInteger' }, { c: 'zz' });
    // const z3 = validateObject(o, { test: 'boolean', z: 'bug' });
    // const z4 = validateObject(o, { a: 'boolean', z: 'bug' });

    var ut = /*#__PURE__*/Object.freeze({
        __proto__: null,
        bitGet: bitGet,
        bitLen: bitLen,
        bitMask: bitMask,
        bitSet: bitSet,
        bytesToHex: bytesToHex,
        bytesToNumberBE: bytesToNumberBE,
        bytesToNumberLE: bytesToNumberLE,
        concatBytes: concatBytes,
        createHmacDrbg: createHmacDrbg,
        ensureBytes: ensureBytes,
        equalBytes: equalBytes,
        hexToBytes: hexToBytes,
        hexToNumber: hexToNumber,
        numberToBytesBE: numberToBytesBE,
        numberToBytesLE: numberToBytesLE,
        numberToHexUnpadded: numberToHexUnpadded,
        numberToVarBytesBE: numberToVarBytesBE,
        utf8ToBytes: utf8ToBytes,
        validateObject: validateObject
    });

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // Utilities for modular arithmetics and finite fields
    // prettier-ignore
    const _0n$3 = BigInt(0), _1n$3 = BigInt(1), _2n$2 = BigInt(2), _3n$1 = BigInt(3);
    // prettier-ignore
    const _4n$1 = BigInt(4), _5n = BigInt(5), _8n = BigInt(8);
    // prettier-ignore
    BigInt(9); BigInt(16);
    // Calculates a modulo b
    function mod(a, b) {
        const result = a % b;
        return result >= _0n$3 ? result : b + result;
    }
    /**
     * Efficiently exponentiate num to power and do modular division.
     * Unsafe in some contexts: uses ladder, so can expose bigint bits.
     * @example
     * powMod(2n, 6n, 11n) // 64n % 11n == 9n
     */
    // TODO: use field version && remove
    function pow(num, power, modulo) {
        if (modulo <= _0n$3 || power < _0n$3)
            throw new Error('Expected power/modulo > 0');
        if (modulo === _1n$3)
            return _0n$3;
        let res = _1n$3;
        while (power > _0n$3) {
            if (power & _1n$3)
                res = (res * num) % modulo;
            num = (num * num) % modulo;
            power >>= _1n$3;
        }
        return res;
    }
    // Does x ^ (2 ^ power) mod p. pow2(30, 4) == 30 ^ (2 ^ 4)
    function pow2(x, power, modulo) {
        let res = x;
        while (power-- > _0n$3) {
            res *= res;
            res %= modulo;
        }
        return res;
    }
    // Inverses number over modulo
    function invert(number, modulo) {
        if (number === _0n$3 || modulo <= _0n$3) {
            throw new Error(`invert: expected positive integers, got n=${number} mod=${modulo}`);
        }
        // Eucledian GCD https://brilliant.org/wiki/extended-euclidean-algorithm/
        // Fermat's little theorem "CT-like" version inv(n) = n^(m-2) mod m is 30x slower.
        let a = mod(number, modulo);
        let b = modulo;
        // prettier-ignore
        let x = _0n$3, u = _1n$3;
        while (a !== _0n$3) {
            // JIT applies optimization if those two lines follow each other
            const q = b / a;
            const r = b % a;
            const m = x - u * q;
            // prettier-ignore
            b = a, a = r, x = u, u = m;
        }
        const gcd = b;
        if (gcd !== _1n$3)
            throw new Error('invert: does not exist');
        return mod(x, modulo);
    }
    // Tonelli-Shanks algorithm
    // Paper 1: https://eprint.iacr.org/2012/685.pdf (page 12)
    // Paper 2: Square Roots from 1; 24, 51, 10 to Dan Shanks
    function tonelliShanks(P) {
        // Legendre constant: used to calculate Legendre symbol (a | p),
        // which denotes the value of a^((p-1)/2) (mod p).
        // (a | p) ≡ 1    if a is a square (mod p)
        // (a | p) ≡ -1   if a is not a square (mod p)
        // (a | p) ≡ 0    if a ≡ 0 (mod p)
        const legendreC = (P - _1n$3) / _2n$2;
        let Q, S, Z;
        // Step 1: By factoring out powers of 2 from p - 1,
        // find q and s such that p - 1 = q*(2^s) with q odd
        for (Q = P - _1n$3, S = 0; Q % _2n$2 === _0n$3; Q /= _2n$2, S++)
            ;
        // Step 2: Select a non-square z such that (z | p) ≡ -1 and set c ≡ zq
        for (Z = _2n$2; Z < P && pow(Z, legendreC, P) !== P - _1n$3; Z++)
            ;
        // Fast-path
        if (S === 1) {
            const p1div4 = (P + _1n$3) / _4n$1;
            return function tonelliFast(Fp, n) {
                const root = Fp.pow(n, p1div4);
                if (!Fp.eql(Fp.sqr(root), n))
                    throw new Error('Cannot find square root');
                return root;
            };
        }
        // Slow-path
        const Q1div2 = (Q + _1n$3) / _2n$2;
        return function tonelliSlow(Fp, n) {
            // Step 0: Check that n is indeed a square: (n | p) should not be ≡ -1
            if (Fp.pow(n, legendreC) === Fp.neg(Fp.ONE))
                throw new Error('Cannot find square root');
            let r = S;
            // TODO: will fail at Fp2/etc
            let g = Fp.pow(Fp.mul(Fp.ONE, Z), Q); // will update both x and b
            let x = Fp.pow(n, Q1div2); // first guess at the square root
            let b = Fp.pow(n, Q); // first guess at the fudge factor
            while (!Fp.eql(b, Fp.ONE)) {
                if (Fp.eql(b, Fp.ZERO))
                    return Fp.ZERO; // https://en.wikipedia.org/wiki/Tonelli%E2%80%93Shanks_algorithm (4. If t = 0, return r = 0)
                // Find m such b^(2^m)==1
                let m = 1;
                for (let t2 = Fp.sqr(b); m < r; m++) {
                    if (Fp.eql(t2, Fp.ONE))
                        break;
                    t2 = Fp.sqr(t2); // t2 *= t2
                }
                // NOTE: r-m-1 can be bigger than 32, need to convert to bigint before shift, otherwise there will be overflow
                const ge = Fp.pow(g, _1n$3 << BigInt(r - m - 1)); // ge = 2^(r-m-1)
                g = Fp.sqr(ge); // g = ge * ge
                x = Fp.mul(x, ge); // x *= ge
                b = Fp.mul(b, g); // b *= g
                r = m;
            }
            return x;
        };
    }
    function FpSqrt(P) {
        // NOTE: different algorithms can give different roots, it is up to user to decide which one they want.
        // For example there is FpSqrtOdd/FpSqrtEven to choice root based on oddness (used for hash-to-curve).
        // P ≡ 3 (mod 4)
        // √n = n^((P+1)/4)
        if (P % _4n$1 === _3n$1) {
            // Not all roots possible!
            // const ORDER =
            //   0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;
            // const NUM = 72057594037927816n;
            const p1div4 = (P + _1n$3) / _4n$1;
            return function sqrt3mod4(Fp, n) {
                const root = Fp.pow(n, p1div4);
                // Throw if root**2 != n
                if (!Fp.eql(Fp.sqr(root), n))
                    throw new Error('Cannot find square root');
                return root;
            };
        }
        // Atkin algorithm for q ≡ 5 (mod 8), https://eprint.iacr.org/2012/685.pdf (page 10)
        if (P % _8n === _5n) {
            const c1 = (P - _5n) / _8n;
            return function sqrt5mod8(Fp, n) {
                const n2 = Fp.mul(n, _2n$2);
                const v = Fp.pow(n2, c1);
                const nv = Fp.mul(n, v);
                const i = Fp.mul(Fp.mul(nv, _2n$2), v);
                const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
                if (!Fp.eql(Fp.sqr(root), n))
                    throw new Error('Cannot find square root');
                return root;
            };
        }
        // Other cases: Tonelli-Shanks algorithm
        return tonelliShanks(P);
    }
    // prettier-ignore
    const FIELD_FIELDS = [
        'create', 'isValid', 'is0', 'neg', 'inv', 'sqrt', 'sqr',
        'eql', 'add', 'sub', 'mul', 'pow', 'div',
        'addN', 'subN', 'mulN', 'sqrN'
    ];
    function validateField(field) {
        const initial = {
            ORDER: 'bigint',
            MASK: 'bigint',
            BYTES: 'isSafeInteger',
            BITS: 'isSafeInteger',
        };
        const opts = FIELD_FIELDS.reduce((map, val) => {
            map[val] = 'function';
            return map;
        }, initial);
        return validateObject(field, opts);
    }
    // Generic field functions
    function FpPow(f, num, power) {
        // Should have same speed as pow for bigints
        // TODO: benchmark!
        if (power < _0n$3)
            throw new Error('Expected power > 0');
        if (power === _0n$3)
            return f.ONE;
        if (power === _1n$3)
            return num;
        let p = f.ONE;
        let d = num;
        while (power > _0n$3) {
            if (power & _1n$3)
                p = f.mul(p, d);
            d = f.sqr(d);
            power >>= _1n$3;
        }
        return p;
    }
    // 0 is non-invertible: non-batched version will throw on 0
    function FpInvertBatch(f, nums) {
        const tmp = new Array(nums.length);
        // Walk from first to last, multiply them by each other MOD p
        const lastMultiplied = nums.reduce((acc, num, i) => {
            if (f.is0(num))
                return acc;
            tmp[i] = acc;
            return f.mul(acc, num);
        }, f.ONE);
        // Invert last element
        const inverted = f.inv(lastMultiplied);
        // Walk from last to first, multiply them by inverted each other MOD p
        nums.reduceRight((acc, num, i) => {
            if (f.is0(num))
                return acc;
            tmp[i] = f.mul(acc, tmp[i]);
            return f.mul(acc, num);
        }, inverted);
        return tmp;
    }
    // CURVE.n lengths
    function nLength(n, nBitLength) {
        // Bit size, byte size of CURVE.n
        const _nBitLength = nBitLength !== undefined ? nBitLength : n.toString(2).length;
        const nByteLength = Math.ceil(_nBitLength / 8);
        return { nBitLength: _nBitLength, nByteLength };
    }
    /**
     * Initializes a galois field over prime. Non-primes are not supported for now.
     * Do not init in loop: slow. Very fragile: always run a benchmark on change.
     * Major performance gains:
     * a) non-normalized operations like mulN instead of mul
     * b) `Object.freeze`
     * c) Same object shape: never add or remove keys
     * @param ORDER prime positive bigint
     * @param bitLen how many bits the field consumes
     * @param isLE (def: false) if encoding / decoding should be in little-endian
     * @param redef optional faster redefinitions of sqrt and other methods
     */
    function Field(ORDER, bitLen, isLE = false, redef = {}) {
        if (ORDER <= _0n$3)
            throw new Error(`Expected Fp ORDER > 0, got ${ORDER}`);
        const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, bitLen);
        if (BYTES > 2048)
            throw new Error('Field lengths over 2048 bytes are not supported');
        const sqrtP = FpSqrt(ORDER);
        const f = Object.freeze({
            ORDER,
            BITS,
            BYTES,
            MASK: bitMask(BITS),
            ZERO: _0n$3,
            ONE: _1n$3,
            create: (num) => mod(num, ORDER),
            isValid: (num) => {
                if (typeof num !== 'bigint')
                    throw new Error(`Invalid field element: expected bigint, got ${typeof num}`);
                return _0n$3 <= num && num < ORDER; // 0 is valid element, but it's not invertible
            },
            is0: (num) => num === _0n$3,
            isOdd: (num) => (num & _1n$3) === _1n$3,
            neg: (num) => mod(-num, ORDER),
            eql: (lhs, rhs) => lhs === rhs,
            sqr: (num) => mod(num * num, ORDER),
            add: (lhs, rhs) => mod(lhs + rhs, ORDER),
            sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
            mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
            pow: (num, power) => FpPow(f, num, power),
            div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
            // Same as above, but doesn't normalize
            sqrN: (num) => num * num,
            addN: (lhs, rhs) => lhs + rhs,
            subN: (lhs, rhs) => lhs - rhs,
            mulN: (lhs, rhs) => lhs * rhs,
            inv: (num) => invert(num, ORDER),
            sqrt: redef.sqrt || ((n) => sqrtP(f, n)),
            invertBatch: (lst) => FpInvertBatch(f, lst),
            // TODO: do we really need constant cmov?
            // We don't have const-time bigints anyway, so probably will be not very useful
            cmov: (a, b, c) => (c ? b : a),
            toBytes: (num) => (isLE ? numberToBytesLE(num, BYTES) : numberToBytesBE(num, BYTES)),
            fromBytes: (bytes) => {
                if (bytes.length !== BYTES)
                    throw new Error(`Fp.fromBytes: expected ${BYTES}, got ${bytes.length}`);
                return isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
            },
        });
        return Object.freeze(f);
    }
    /**
     * FIPS 186 B.4.1-compliant "constant-time" private key generation utility.
     * Can take (n+8) or more bytes of uniform input e.g. from CSPRNG or KDF
     * and convert them into private scalar, with the modulo bias being neglible.
     * Needs at least 40 bytes of input for 32-byte private key.
     * https://research.kudelskisecurity.com/2020/07/28/the-definitive-guide-to-modulo-bias-and-how-to-avoid-it/
     * @param hash hash output from SHA3 or a similar function
     * @returns valid private scalar
     */
    function hashToPrivateScalar(hash, groupOrder, isLE = false) {
        hash = ensureBytes('privateHash', hash);
        const hashLen = hash.length;
        const minLen = nLength(groupOrder).nByteLength + 8;
        if (minLen < 24 || hashLen < minLen || hashLen > 1024)
            throw new Error(`hashToPrivateScalar: expected ${minLen}-1024 bytes of input, got ${hashLen}`);
        const num = isLE ? bytesToNumberLE(hash) : bytesToNumberBE(hash);
        return mod(num, groupOrder - _1n$3) + _1n$3;
    }

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // Abelian group utilities
    const _0n$2 = BigInt(0);
    const _1n$2 = BigInt(1);
    // Elliptic curve multiplication of Point by scalar. Fragile.
    // Scalars should always be less than curve order: this should be checked inside of a curve itself.
    // Creates precomputation tables for fast multiplication:
    // - private scalar is split by fixed size windows of W bits
    // - every window point is collected from window's table & added to accumulator
    // - since windows are different, same point inside tables won't be accessed more than once per calc
    // - each multiplication is 'Math.ceil(CURVE_ORDER / 𝑊) + 1' point additions (fixed for any scalar)
    // - +1 window is neccessary for wNAF
    // - wNAF reduces table size: 2x less memory + 2x faster generation, but 10% slower multiplication
    // TODO: Research returning 2d JS array of windows, instead of a single window. This would allow
    // windows to be in different memory locations
    function wNAF(c, bits) {
        const constTimeNegate = (condition, item) => {
            const neg = item.negate();
            return condition ? neg : item;
        };
        const opts = (W) => {
            const windows = Math.ceil(bits / W) + 1; // +1, because
            const windowSize = 2 ** (W - 1); // -1 because we skip zero
            return { windows, windowSize };
        };
        return {
            constTimeNegate,
            // non-const time multiplication ladder
            unsafeLadder(elm, n) {
                let p = c.ZERO;
                let d = elm;
                while (n > _0n$2) {
                    if (n & _1n$2)
                        p = p.add(d);
                    d = d.double();
                    n >>= _1n$2;
                }
                return p;
            },
            /**
             * Creates a wNAF precomputation window. Used for caching.
             * Default window size is set by `utils.precompute()` and is equal to 8.
             * Number of precomputed points depends on the curve size:
             * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
             * - 𝑊 is the window size
             * - 𝑛 is the bitlength of the curve order.
             * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
             * @returns precomputed point tables flattened to a single array
             */
            precomputeWindow(elm, W) {
                const { windows, windowSize } = opts(W);
                const points = [];
                let p = elm;
                let base = p;
                for (let window = 0; window < windows; window++) {
                    base = p;
                    points.push(base);
                    // =1, because we skip zero
                    for (let i = 1; i < windowSize; i++) {
                        base = base.add(p);
                        points.push(base);
                    }
                    p = base.double();
                }
                return points;
            },
            /**
             * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
             * @param W window size
             * @param precomputes precomputed tables
             * @param n scalar (we don't check here, but should be less than curve order)
             * @returns real and fake (for const-time) points
             */
            wNAF(W, precomputes, n) {
                // TODO: maybe check that scalar is less than group order? wNAF behavious is undefined otherwise
                // But need to carefully remove other checks before wNAF. ORDER == bits here
                const { windows, windowSize } = opts(W);
                let p = c.ZERO;
                let f = c.BASE;
                const mask = BigInt(2 ** W - 1); // Create mask with W ones: 0b1111 for W=4 etc.
                const maxNumber = 2 ** W;
                const shiftBy = BigInt(W);
                for (let window = 0; window < windows; window++) {
                    const offset = window * windowSize;
                    // Extract W bits.
                    let wbits = Number(n & mask);
                    // Shift number by W bits.
                    n >>= shiftBy;
                    // If the bits are bigger than max size, we'll split those.
                    // +224 => 256 - 32
                    if (wbits > windowSize) {
                        wbits -= maxNumber;
                        n += _1n$2;
                    }
                    // This code was first written with assumption that 'f' and 'p' will never be infinity point:
                    // since each addition is multiplied by 2 ** W, it cannot cancel each other. However,
                    // there is negate now: it is possible that negated element from low value
                    // would be the same as high element, which will create carry into next window.
                    // It's not obvious how this can fail, but still worth investigating later.
                    // Check if we're onto Zero point.
                    // Add random point inside current window to f.
                    const offset1 = offset;
                    const offset2 = offset + Math.abs(wbits) - 1; // -1 because we skip zero
                    const cond1 = window % 2 !== 0;
                    const cond2 = wbits < 0;
                    if (wbits === 0) {
                        // The most important part for const-time getPublicKey
                        f = f.add(constTimeNegate(cond1, precomputes[offset1]));
                    }
                    else {
                        p = p.add(constTimeNegate(cond2, precomputes[offset2]));
                    }
                }
                // JIT-compiler should not eliminate f here, since it will later be used in normalizeZ()
                // Even if the variable is still unused, there are some checks which will
                // throw an exception, so compiler needs to prove they won't happen, which is hard.
                // At this point there is a way to F be infinity-point even if p is not,
                // which makes it less const-time: around 1 bigint multiply.
                return { p, f };
            },
            wNAFCached(P, precomputesMap, n, transform) {
                // @ts-ignore
                const W = P._WINDOW_SIZE || 1;
                // Calculate precomputes on a first run, reuse them after
                let comp = precomputesMap.get(P);
                if (!comp) {
                    comp = this.precomputeWindow(P, W);
                    if (W !== 1) {
                        precomputesMap.set(P, transform(comp));
                    }
                }
                return this.wNAF(W, comp, n);
            },
        };
    }
    function validateBasic(curve) {
        validateField(curve.Fp);
        validateObject(curve, {
            n: 'bigint',
            h: 'bigint',
            Gx: 'field',
            Gy: 'field',
        }, {
            nBitLength: 'isSafeInteger',
            nByteLength: 'isSafeInteger',
        });
        // Set defaults
        return Object.freeze({
            ...nLength(curve.n, curve.nBitLength),
            ...curve,
            ...{ p: curve.Fp.ORDER },
        });
    }

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // Short Weierstrass curve. The formula is: y² = x³ + ax + b
    function validatePointOpts(curve) {
        const opts = validateBasic(curve);
        validateObject(opts, {
            a: 'field',
            b: 'field',
        }, {
            allowedPrivateKeyLengths: 'array',
            wrapPrivateKey: 'boolean',
            isTorsionFree: 'function',
            clearCofactor: 'function',
            allowInfinityPoint: 'boolean',
            fromBytes: 'function',
            toBytes: 'function',
        });
        const { endo, Fp, a } = opts;
        if (endo) {
            if (!Fp.eql(a, Fp.ZERO)) {
                throw new Error('Endomorphism can only be defined for Koblitz curves that have a=0');
            }
            if (typeof endo !== 'object' ||
                typeof endo.beta !== 'bigint' ||
                typeof endo.splitScalar !== 'function') {
                throw new Error('Expected endomorphism with beta: bigint and splitScalar: function');
            }
        }
        return Object.freeze({ ...opts });
    }
    // ASN.1 DER encoding utilities
    const { bytesToNumberBE: b2n, hexToBytes: h2b } = ut;
    const DER = {
        // asn.1 DER encoding utils
        Err: class DERErr extends Error {
            constructor(m = '') {
                super(m);
            }
        },
        _parseInt(data) {
            const { Err: E } = DER;
            if (data.length < 2 || data[0] !== 0x02)
                throw new E('Invalid signature integer tag');
            const len = data[1];
            const res = data.subarray(2, len + 2);
            if (!len || res.length !== len)
                throw new E('Invalid signature integer: wrong length');
            // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
            // since we always use positive integers here. It must always be empty:
            // - add zero byte if exists
            // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
            if (res[0] & 0b10000000)
                throw new E('Invalid signature integer: negative');
            if (res[0] === 0x00 && !(res[1] & 0b10000000))
                throw new E('Invalid signature integer: unnecessary leading zero');
            return { d: b2n(res), l: data.subarray(len + 2) }; // d is data, l is left
        },
        toSig(hex) {
            // parse DER signature
            const { Err: E } = DER;
            const data = typeof hex === 'string' ? h2b(hex) : hex;
            if (!(data instanceof Uint8Array))
                throw new Error('ui8a expected');
            let l = data.length;
            if (l < 2 || data[0] != 0x30)
                throw new E('Invalid signature tag');
            if (data[1] !== l - 2)
                throw new E('Invalid signature: incorrect length');
            const { d: r, l: sBytes } = DER._parseInt(data.subarray(2));
            const { d: s, l: rBytesLeft } = DER._parseInt(sBytes);
            if (rBytesLeft.length)
                throw new E('Invalid signature: left bytes after parsing');
            return { r, s };
        },
        hexFromSig(sig) {
            // Add leading zero if first byte has negative bit enabled. More details in '_parseInt'
            const slice = (s) => (Number.parseInt(s[0], 16) & 0b1000 ? '00' + s : s);
            const h = (num) => {
                const hex = num.toString(16);
                return hex.length & 1 ? `0${hex}` : hex;
            };
            const s = slice(h(sig.s));
            const r = slice(h(sig.r));
            const shl = s.length / 2;
            const rhl = r.length / 2;
            const sl = h(shl);
            const rl = h(rhl);
            return `30${h(rhl + shl + 4)}02${rl}${r}02${sl}${s}`;
        },
    };
    // Be friendly to bad ECMAScript parsers by not using bigint literals
    // prettier-ignore
    const _0n$1 = BigInt(0), _1n$1 = BigInt(1), _2n$1 = BigInt(2), _3n = BigInt(3), _4n = BigInt(4);
    function weierstrassPoints(opts) {
        const CURVE = validatePointOpts(opts);
        const { Fp } = CURVE; // All curves has same field / group length as for now, but they can differ
        const toBytes = CURVE.toBytes ||
            ((c, point, isCompressed) => {
                const a = point.toAffine();
                return concatBytes(Uint8Array.from([0x04]), Fp.toBytes(a.x), Fp.toBytes(a.y));
            });
        const fromBytes = CURVE.fromBytes ||
            ((bytes) => {
                // const head = bytes[0];
                const tail = bytes.subarray(1);
                // if (head !== 0x04) throw new Error('Only non-compressed encoding is supported');
                const x = Fp.fromBytes(tail.subarray(0, Fp.BYTES));
                const y = Fp.fromBytes(tail.subarray(Fp.BYTES, 2 * Fp.BYTES));
                return { x, y };
            });
        /**
         * y² = x³ + ax + b: Short weierstrass curve formula
         * @returns y²
         */
        function weierstrassEquation(x) {
            const { a, b } = CURVE;
            const x2 = Fp.sqr(x); // x * x
            const x3 = Fp.mul(x2, x); // x2 * x
            return Fp.add(Fp.add(x3, Fp.mul(x, a)), b); // x3 + a * x + b
        }
        // Validate whether the passed curve params are valid.
        // We check if curve equation works for generator point.
        // `assertValidity()` won't work: `isTorsionFree()` is not available at this point in bls12-381.
        // ProjectivePoint class has not been initialized yet.
        if (!Fp.eql(Fp.sqr(CURVE.Gy), weierstrassEquation(CURVE.Gx)))
            throw new Error('bad generator point: equation left != right');
        // Valid group elements reside in range 1..n-1
        function isWithinCurveOrder(num) {
            return typeof num === 'bigint' && _0n$1 < num && num < CURVE.n;
        }
        function assertGE(num) {
            if (!isWithinCurveOrder(num))
                throw new Error('Expected valid bigint: 0 < bigint < curve.n');
        }
        // Validates if priv key is valid and converts it to bigint.
        // Supports options allowedPrivateKeyLengths and wrapPrivateKey.
        function normPrivateKeyToScalar(key) {
            const { allowedPrivateKeyLengths: lengths, nByteLength, wrapPrivateKey, n } = CURVE;
            if (lengths && typeof key !== 'bigint') {
                if (key instanceof Uint8Array)
                    key = bytesToHex(key);
                // Normalize to hex string, pad. E.g. P521 would norm 130-132 char hex to 132-char bytes
                if (typeof key !== 'string' || !lengths.includes(key.length))
                    throw new Error('Invalid key');
                key = key.padStart(nByteLength * 2, '0');
            }
            let num;
            try {
                num =
                    typeof key === 'bigint'
                        ? key
                        : bytesToNumberBE(ensureBytes('private key', key, nByteLength));
            }
            catch (error) {
                throw new Error(`private key must be ${nByteLength} bytes, hex or bigint, not ${typeof key}`);
            }
            if (wrapPrivateKey)
                num = mod(num, n); // disabled by default, enabled for BLS
            assertGE(num); // num in range [1..N-1]
            return num;
        }
        const pointPrecomputes = new Map();
        function assertPrjPoint(other) {
            if (!(other instanceof Point))
                throw new Error('ProjectivePoint expected');
        }
        /**
         * Projective Point works in 3d / projective (homogeneous) coordinates: (x, y, z) ∋ (x=x/z, y=y/z)
         * Default Point works in 2d / affine coordinates: (x, y)
         * We're doing calculations in projective, because its operations don't require costly inversion.
         */
        class Point {
            constructor(px, py, pz) {
                this.px = px;
                this.py = py;
                this.pz = pz;
                if (px == null || !Fp.isValid(px))
                    throw new Error('x required');
                if (py == null || !Fp.isValid(py))
                    throw new Error('y required');
                if (pz == null || !Fp.isValid(pz))
                    throw new Error('z required');
            }
            // Does not validate if the point is on-curve.
            // Use fromHex instead, or call assertValidity() later.
            static fromAffine(p) {
                const { x, y } = p || {};
                if (!p || !Fp.isValid(x) || !Fp.isValid(y))
                    throw new Error('invalid affine point');
                if (p instanceof Point)
                    throw new Error('projective point not allowed');
                const is0 = (i) => Fp.eql(i, Fp.ZERO);
                // fromAffine(x:0, y:0) would produce (x:0, y:0, z:1), but we need (x:0, y:1, z:0)
                if (is0(x) && is0(y))
                    return Point.ZERO;
                return new Point(x, y, Fp.ONE);
            }
            get x() {
                return this.toAffine().x;
            }
            get y() {
                return this.toAffine().y;
            }
            /**
             * Takes a bunch of Projective Points but executes only one
             * inversion on all of them. Inversion is very slow operation,
             * so this improves performance massively.
             * Optimization: converts a list of projective points to a list of identical points with Z=1.
             */
            static normalizeZ(points) {
                const toInv = Fp.invertBatch(points.map((p) => p.pz));
                return points.map((p, i) => p.toAffine(toInv[i])).map(Point.fromAffine);
            }
            /**
             * Converts hash string or Uint8Array to Point.
             * @param hex short/long ECDSA hex
             */
            static fromHex(hex) {
                const P = Point.fromAffine(fromBytes(ensureBytes('pointHex', hex)));
                P.assertValidity();
                return P;
            }
            // Multiplies generator point by privateKey.
            static fromPrivateKey(privateKey) {
                return Point.BASE.multiply(normPrivateKeyToScalar(privateKey));
            }
            // "Private method", don't use it directly
            _setWindowSize(windowSize) {
                this._WINDOW_SIZE = windowSize;
                pointPrecomputes.delete(this);
            }
            // A point on curve is valid if it conforms to equation.
            assertValidity() {
                // Zero is valid point too!
                if (this.is0()) {
                    if (CURVE.allowInfinityPoint)
                        return;
                    throw new Error('bad point: ZERO');
                }
                // Some 3rd-party test vectors require different wording between here & `fromCompressedHex`
                const { x, y } = this.toAffine();
                // Check if x, y are valid field elements
                if (!Fp.isValid(x) || !Fp.isValid(y))
                    throw new Error('bad point: x or y not FE');
                const left = Fp.sqr(y); // y²
                const right = weierstrassEquation(x); // x³ + ax + b
                if (!Fp.eql(left, right))
                    throw new Error('bad point: equation left != right');
                if (!this.isTorsionFree())
                    throw new Error('bad point: not in prime-order subgroup');
            }
            hasEvenY() {
                const { y } = this.toAffine();
                if (Fp.isOdd)
                    return !Fp.isOdd(y);
                throw new Error("Field doesn't support isOdd");
            }
            /**
             * Compare one point to another.
             */
            equals(other) {
                assertPrjPoint(other);
                const { px: X1, py: Y1, pz: Z1 } = this;
                const { px: X2, py: Y2, pz: Z2 } = other;
                const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
                const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
                return U1 && U2;
            }
            /**
             * Flips point to one corresponding to (x, -y) in Affine coordinates.
             */
            negate() {
                return new Point(this.px, Fp.neg(this.py), this.pz);
            }
            // Renes-Costello-Batina exception-free doubling formula.
            // There is 30% faster Jacobian formula, but it is not complete.
            // https://eprint.iacr.org/2015/1060, algorithm 3
            // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
            double() {
                const { a, b } = CURVE;
                const b3 = Fp.mul(b, _3n);
                const { px: X1, py: Y1, pz: Z1 } = this;
                let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
                let t0 = Fp.mul(X1, X1); // step 1
                let t1 = Fp.mul(Y1, Y1);
                let t2 = Fp.mul(Z1, Z1);
                let t3 = Fp.mul(X1, Y1);
                t3 = Fp.add(t3, t3); // step 5
                Z3 = Fp.mul(X1, Z1);
                Z3 = Fp.add(Z3, Z3);
                X3 = Fp.mul(a, Z3);
                Y3 = Fp.mul(b3, t2);
                Y3 = Fp.add(X3, Y3); // step 10
                X3 = Fp.sub(t1, Y3);
                Y3 = Fp.add(t1, Y3);
                Y3 = Fp.mul(X3, Y3);
                X3 = Fp.mul(t3, X3);
                Z3 = Fp.mul(b3, Z3); // step 15
                t2 = Fp.mul(a, t2);
                t3 = Fp.sub(t0, t2);
                t3 = Fp.mul(a, t3);
                t3 = Fp.add(t3, Z3);
                Z3 = Fp.add(t0, t0); // step 20
                t0 = Fp.add(Z3, t0);
                t0 = Fp.add(t0, t2);
                t0 = Fp.mul(t0, t3);
                Y3 = Fp.add(Y3, t0);
                t2 = Fp.mul(Y1, Z1); // step 25
                t2 = Fp.add(t2, t2);
                t0 = Fp.mul(t2, t3);
                X3 = Fp.sub(X3, t0);
                Z3 = Fp.mul(t2, t1);
                Z3 = Fp.add(Z3, Z3); // step 30
                Z3 = Fp.add(Z3, Z3);
                return new Point(X3, Y3, Z3);
            }
            // Renes-Costello-Batina exception-free addition formula.
            // There is 30% faster Jacobian formula, but it is not complete.
            // https://eprint.iacr.org/2015/1060, algorithm 1
            // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
            add(other) {
                assertPrjPoint(other);
                const { px: X1, py: Y1, pz: Z1 } = this;
                const { px: X2, py: Y2, pz: Z2 } = other;
                let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO; // prettier-ignore
                const a = CURVE.a;
                const b3 = Fp.mul(CURVE.b, _3n);
                let t0 = Fp.mul(X1, X2); // step 1
                let t1 = Fp.mul(Y1, Y2);
                let t2 = Fp.mul(Z1, Z2);
                let t3 = Fp.add(X1, Y1);
                let t4 = Fp.add(X2, Y2); // step 5
                t3 = Fp.mul(t3, t4);
                t4 = Fp.add(t0, t1);
                t3 = Fp.sub(t3, t4);
                t4 = Fp.add(X1, Z1);
                let t5 = Fp.add(X2, Z2); // step 10
                t4 = Fp.mul(t4, t5);
                t5 = Fp.add(t0, t2);
                t4 = Fp.sub(t4, t5);
                t5 = Fp.add(Y1, Z1);
                X3 = Fp.add(Y2, Z2); // step 15
                t5 = Fp.mul(t5, X3);
                X3 = Fp.add(t1, t2);
                t5 = Fp.sub(t5, X3);
                Z3 = Fp.mul(a, t4);
                X3 = Fp.mul(b3, t2); // step 20
                Z3 = Fp.add(X3, Z3);
                X3 = Fp.sub(t1, Z3);
                Z3 = Fp.add(t1, Z3);
                Y3 = Fp.mul(X3, Z3);
                t1 = Fp.add(t0, t0); // step 25
                t1 = Fp.add(t1, t0);
                t2 = Fp.mul(a, t2);
                t4 = Fp.mul(b3, t4);
                t1 = Fp.add(t1, t2);
                t2 = Fp.sub(t0, t2); // step 30
                t2 = Fp.mul(a, t2);
                t4 = Fp.add(t4, t2);
                t0 = Fp.mul(t1, t4);
                Y3 = Fp.add(Y3, t0);
                t0 = Fp.mul(t5, t4); // step 35
                X3 = Fp.mul(t3, X3);
                X3 = Fp.sub(X3, t0);
                t0 = Fp.mul(t3, t1);
                Z3 = Fp.mul(t5, Z3);
                Z3 = Fp.add(Z3, t0); // step 40
                return new Point(X3, Y3, Z3);
            }
            subtract(other) {
                return this.add(other.negate());
            }
            is0() {
                return this.equals(Point.ZERO);
            }
            wNAF(n) {
                return wnaf.wNAFCached(this, pointPrecomputes, n, (comp) => {
                    const toInv = Fp.invertBatch(comp.map((p) => p.pz));
                    return comp.map((p, i) => p.toAffine(toInv[i])).map(Point.fromAffine);
                });
            }
            /**
             * Non-constant-time multiplication. Uses double-and-add algorithm.
             * It's faster, but should only be used when you don't care about
             * an exposed private key e.g. sig verification, which works over *public* keys.
             */
            multiplyUnsafe(n) {
                const I = Point.ZERO;
                if (n === _0n$1)
                    return I;
                assertGE(n); // Will throw on 0
                if (n === _1n$1)
                    return this;
                const { endo } = CURVE;
                if (!endo)
                    return wnaf.unsafeLadder(this, n);
                // Apply endomorphism
                let { k1neg, k1, k2neg, k2 } = endo.splitScalar(n);
                let k1p = I;
                let k2p = I;
                let d = this;
                while (k1 > _0n$1 || k2 > _0n$1) {
                    if (k1 & _1n$1)
                        k1p = k1p.add(d);
                    if (k2 & _1n$1)
                        k2p = k2p.add(d);
                    d = d.double();
                    k1 >>= _1n$1;
                    k2 >>= _1n$1;
                }
                if (k1neg)
                    k1p = k1p.negate();
                if (k2neg)
                    k2p = k2p.negate();
                k2p = new Point(Fp.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
                return k1p.add(k2p);
            }
            /**
             * Constant time multiplication.
             * Uses wNAF method. Windowed method may be 10% faster,
             * but takes 2x longer to generate and consumes 2x memory.
             * Uses precomputes when available.
             * Uses endomorphism for Koblitz curves.
             * @param scalar by which the point would be multiplied
             * @returns New point
             */
            multiply(scalar) {
                assertGE(scalar);
                let n = scalar;
                let point, fake; // Fake point is used to const-time mult
                const { endo } = CURVE;
                if (endo) {
                    const { k1neg, k1, k2neg, k2 } = endo.splitScalar(n);
                    let { p: k1p, f: f1p } = this.wNAF(k1);
                    let { p: k2p, f: f2p } = this.wNAF(k2);
                    k1p = wnaf.constTimeNegate(k1neg, k1p);
                    k2p = wnaf.constTimeNegate(k2neg, k2p);
                    k2p = new Point(Fp.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
                    point = k1p.add(k2p);
                    fake = f1p.add(f2p);
                }
                else {
                    const { p, f } = this.wNAF(n);
                    point = p;
                    fake = f;
                }
                // Normalize `z` for both points, but return only real one
                return Point.normalizeZ([point, fake])[0];
            }
            /**
             * Efficiently calculate `aP + bQ`. Unsafe, can expose private key, if used incorrectly.
             * Not using Strauss-Shamir trick: precomputation tables are faster.
             * The trick could be useful if both P and Q are not G (not in our case).
             * @returns non-zero affine point
             */
            multiplyAndAddUnsafe(Q, a, b) {
                const G = Point.BASE; // No Strauss-Shamir trick: we have 10% faster G precomputes
                const mul = (P, a // Select faster multiply() method
                ) => (a === _0n$1 || a === _1n$1 || !P.equals(G) ? P.multiplyUnsafe(a) : P.multiply(a));
                const sum = mul(this, a).add(mul(Q, b));
                return sum.is0() ? undefined : sum;
            }
            // Converts Projective point to affine (x, y) coordinates.
            // Can accept precomputed Z^-1 - for example, from invertBatch.
            // (x, y, z) ∋ (x=x/z, y=y/z)
            toAffine(iz) {
                const { px: x, py: y, pz: z } = this;
                const is0 = this.is0();
                // If invZ was 0, we return zero point. However we still want to execute
                // all operations, so we replace invZ with a random number, 1.
                if (iz == null)
                    iz = is0 ? Fp.ONE : Fp.inv(z);
                const ax = Fp.mul(x, iz);
                const ay = Fp.mul(y, iz);
                const zz = Fp.mul(z, iz);
                if (is0)
                    return { x: Fp.ZERO, y: Fp.ZERO };
                if (!Fp.eql(zz, Fp.ONE))
                    throw new Error('invZ was invalid');
                return { x: ax, y: ay };
            }
            isTorsionFree() {
                const { h: cofactor, isTorsionFree } = CURVE;
                if (cofactor === _1n$1)
                    return true; // No subgroups, always torsion-free
                if (isTorsionFree)
                    return isTorsionFree(Point, this);
                throw new Error('isTorsionFree() has not been declared for the elliptic curve');
            }
            clearCofactor() {
                const { h: cofactor, clearCofactor } = CURVE;
                if (cofactor === _1n$1)
                    return this; // Fast-path
                if (clearCofactor)
                    return clearCofactor(Point, this);
                return this.multiplyUnsafe(CURVE.h);
            }
            toRawBytes(isCompressed = true) {
                this.assertValidity();
                return toBytes(Point, this, isCompressed);
            }
            toHex(isCompressed = true) {
                return bytesToHex(this.toRawBytes(isCompressed));
            }
        }
        Point.BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
        Point.ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO);
        const _bits = CURVE.nBitLength;
        const wnaf = wNAF(Point, CURVE.endo ? Math.ceil(_bits / 2) : _bits);
        // Validate if generator point is on curve
        return {
            CURVE,
            ProjectivePoint: Point,
            normPrivateKeyToScalar,
            weierstrassEquation,
            isWithinCurveOrder,
        };
    }
    function validateOpts(curve) {
        const opts = validateBasic(curve);
        validateObject(opts, {
            hash: 'hash',
            hmac: 'function',
            randomBytes: 'function',
        }, {
            bits2int: 'function',
            bits2int_modN: 'function',
            lowS: 'boolean',
        });
        return Object.freeze({ lowS: true, ...opts });
    }
    function weierstrass(curveDef) {
        const CURVE = validateOpts(curveDef);
        const { Fp, n: CURVE_ORDER } = CURVE;
        const compressedLen = Fp.BYTES + 1; // e.g. 33 for 32
        const uncompressedLen = 2 * Fp.BYTES + 1; // e.g. 65 for 32
        function isValidFieldElement(num) {
            return _0n$1 < num && num < Fp.ORDER; // 0 is banned since it's not invertible FE
        }
        function modN(a) {
            return mod(a, CURVE_ORDER);
        }
        function invN(a) {
            return invert(a, CURVE_ORDER);
        }
        const { ProjectivePoint: Point, normPrivateKeyToScalar, weierstrassEquation, isWithinCurveOrder, } = weierstrassPoints({
            ...CURVE,
            toBytes(c, point, isCompressed) {
                const a = point.toAffine();
                const x = Fp.toBytes(a.x);
                const cat = concatBytes;
                if (isCompressed) {
                    return cat(Uint8Array.from([point.hasEvenY() ? 0x02 : 0x03]), x);
                }
                else {
                    return cat(Uint8Array.from([0x04]), x, Fp.toBytes(a.y));
                }
            },
            fromBytes(bytes) {
                const len = bytes.length;
                const head = bytes[0];
                const tail = bytes.subarray(1);
                // this.assertValidity() is done inside of fromHex
                if (len === compressedLen && (head === 0x02 || head === 0x03)) {
                    const x = bytesToNumberBE(tail);
                    if (!isValidFieldElement(x))
                        throw new Error('Point is not on curve');
                    const y2 = weierstrassEquation(x); // y² = x³ + ax + b
                    let y = Fp.sqrt(y2); // y = y² ^ (p+1)/4
                    const isYOdd = (y & _1n$1) === _1n$1;
                    // ECDSA
                    const isHeadOdd = (head & 1) === 1;
                    if (isHeadOdd !== isYOdd)
                        y = Fp.neg(y);
                    return { x, y };
                }
                else if (len === uncompressedLen && head === 0x04) {
                    const x = Fp.fromBytes(tail.subarray(0, Fp.BYTES));
                    const y = Fp.fromBytes(tail.subarray(Fp.BYTES, 2 * Fp.BYTES));
                    return { x, y };
                }
                else {
                    throw new Error(`Point of length ${len} was invalid. Expected ${compressedLen} compressed bytes or ${uncompressedLen} uncompressed bytes`);
                }
            },
        });
        const numToNByteStr = (num) => bytesToHex(numberToBytesBE(num, CURVE.nByteLength));
        function isBiggerThanHalfOrder(number) {
            const HALF = CURVE_ORDER >> _1n$1;
            return number > HALF;
        }
        function normalizeS(s) {
            return isBiggerThanHalfOrder(s) ? modN(-s) : s;
        }
        // slice bytes num
        const slcNum = (b, from, to) => bytesToNumberBE(b.slice(from, to));
        /**
         * ECDSA signature with its (r, s) properties. Supports DER & compact representations.
         */
        class Signature {
            constructor(r, s, recovery) {
                this.r = r;
                this.s = s;
                this.recovery = recovery;
                this.assertValidity();
            }
            // pair (bytes of r, bytes of s)
            static fromCompact(hex) {
                const l = CURVE.nByteLength;
                hex = ensureBytes('compactSignature', hex, l * 2);
                return new Signature(slcNum(hex, 0, l), slcNum(hex, l, 2 * l));
            }
            // DER encoded ECDSA signature
            // https://bitcoin.stackexchange.com/questions/57644/what-are-the-parts-of-a-bitcoin-transaction-input-script
            static fromDER(hex) {
                const { r, s } = DER.toSig(ensureBytes('DER', hex));
                return new Signature(r, s);
            }
            assertValidity() {
                // can use assertGE here
                if (!isWithinCurveOrder(this.r))
                    throw new Error('r must be 0 < r < CURVE.n');
                if (!isWithinCurveOrder(this.s))
                    throw new Error('s must be 0 < s < CURVE.n');
            }
            addRecoveryBit(recovery) {
                return new Signature(this.r, this.s, recovery);
            }
            recoverPublicKey(msgHash) {
                const { r, s, recovery: rec } = this;
                const h = bits2int_modN(ensureBytes('msgHash', msgHash)); // Truncate hash
                if (rec == null || ![0, 1, 2, 3].includes(rec))
                    throw new Error('recovery id invalid');
                const radj = rec === 2 || rec === 3 ? r + CURVE.n : r;
                if (radj >= Fp.ORDER)
                    throw new Error('recovery id 2 or 3 invalid');
                const prefix = (rec & 1) === 0 ? '02' : '03';
                const R = Point.fromHex(prefix + numToNByteStr(radj));
                const ir = invN(radj); // r^-1
                const u1 = modN(-h * ir); // -hr^-1
                const u2 = modN(s * ir); // sr^-1
                const Q = Point.BASE.multiplyAndAddUnsafe(R, u1, u2); // (sr^-1)R-(hr^-1)G = -(hr^-1)G + (sr^-1)
                if (!Q)
                    throw new Error('point at infinify'); // unsafe is fine: no priv data leaked
                Q.assertValidity();
                return Q;
            }
            // Signatures should be low-s, to prevent malleability.
            hasHighS() {
                return isBiggerThanHalfOrder(this.s);
            }
            normalizeS() {
                return this.hasHighS() ? new Signature(this.r, modN(-this.s), this.recovery) : this;
            }
            // DER-encoded
            toDERRawBytes() {
                return hexToBytes(this.toDERHex());
            }
            toDERHex() {
                return DER.hexFromSig({ r: this.r, s: this.s });
            }
            // padded bytes of r, then padded bytes of s
            toCompactRawBytes() {
                return hexToBytes(this.toCompactHex());
            }
            toCompactHex() {
                return numToNByteStr(this.r) + numToNByteStr(this.s);
            }
        }
        const utils = {
            isValidPrivateKey(privateKey) {
                try {
                    normPrivateKeyToScalar(privateKey);
                    return true;
                }
                catch (error) {
                    return false;
                }
            },
            normPrivateKeyToScalar: normPrivateKeyToScalar,
            /**
             * Produces cryptographically secure private key from random of size (nBitLength+64)
             * as per FIPS 186 B.4.1 with modulo bias being neglible.
             */
            randomPrivateKey: () => {
                const rand = CURVE.randomBytes(Fp.BYTES + 8);
                const num = hashToPrivateScalar(rand, CURVE_ORDER);
                return numberToBytesBE(num, CURVE.nByteLength);
            },
            /**
             * Creates precompute table for an arbitrary EC point. Makes point "cached".
             * Allows to massively speed-up `point.multiply(scalar)`.
             * @returns cached point
             * @example
             * const fast = utils.precompute(8, ProjectivePoint.fromHex(someonesPubKey));
             * fast.multiply(privKey); // much faster ECDH now
             */
            precompute(windowSize = 8, point = Point.BASE) {
                point._setWindowSize(windowSize);
                point.multiply(BigInt(3)); // 3 is arbitrary, just need any number here
                return point;
            },
        };
        /**
         * Computes public key for a private key. Checks for validity of the private key.
         * @param privateKey private key
         * @param isCompressed whether to return compact (default), or full key
         * @returns Public key, full when isCompressed=false; short when isCompressed=true
         */
        function getPublicKey(privateKey, isCompressed = true) {
            return Point.fromPrivateKey(privateKey).toRawBytes(isCompressed);
        }
        /**
         * Quick and dirty check for item being public key. Does not validate hex, or being on-curve.
         */
        function isProbPub(item) {
            const arr = item instanceof Uint8Array;
            const str = typeof item === 'string';
            const len = (arr || str) && item.length;
            if (arr)
                return len === compressedLen || len === uncompressedLen;
            if (str)
                return len === 2 * compressedLen || len === 2 * uncompressedLen;
            if (item instanceof Point)
                return true;
            return false;
        }
        /**
         * ECDH (Elliptic Curve Diffie Hellman).
         * Computes shared public key from private key and public key.
         * Checks: 1) private key validity 2) shared key is on-curve.
         * Does NOT hash the result.
         * @param privateA private key
         * @param publicB different public key
         * @param isCompressed whether to return compact (default), or full key
         * @returns shared public key
         */
        function getSharedSecret(privateA, publicB, isCompressed = true) {
            if (isProbPub(privateA))
                throw new Error('first arg must be private key');
            if (!isProbPub(publicB))
                throw new Error('second arg must be public key');
            const b = Point.fromHex(publicB); // check for being on-curve
            return b.multiply(normPrivateKeyToScalar(privateA)).toRawBytes(isCompressed);
        }
        // RFC6979: ensure ECDSA msg is X bytes and < N. RFC suggests optional truncating via bits2octets.
        // FIPS 186-4 4.6 suggests the leftmost min(nBitLen, outLen) bits, which matches bits2int.
        // bits2int can produce res>N, we can do mod(res, N) since the bitLen is the same.
        // int2octets can't be used; pads small msgs with 0: unacceptatble for trunc as per RFC vectors
        const bits2int = CURVE.bits2int ||
            function (bytes) {
                // For curves with nBitLength % 8 !== 0: bits2octets(bits2octets(m)) !== bits2octets(m)
                // for some cases, since bytes.length * 8 is not actual bitLength.
                const num = bytesToNumberBE(bytes); // check for == u8 done here
                const delta = bytes.length * 8 - CURVE.nBitLength; // truncate to nBitLength leftmost bits
                return delta > 0 ? num >> BigInt(delta) : num;
            };
        const bits2int_modN = CURVE.bits2int_modN ||
            function (bytes) {
                return modN(bits2int(bytes)); // can't use bytesToNumberBE here
            };
        // NOTE: pads output with zero as per spec
        const ORDER_MASK = bitMask(CURVE.nBitLength);
        /**
         * Converts to bytes. Checks if num in `[0..ORDER_MASK-1]` e.g.: `[0..2^256-1]`.
         */
        function int2octets(num) {
            if (typeof num !== 'bigint')
                throw new Error('bigint expected');
            if (!(_0n$1 <= num && num < ORDER_MASK))
                throw new Error(`bigint expected < 2^${CURVE.nBitLength}`);
            // works with order, can have different size than numToField!
            return numberToBytesBE(num, CURVE.nByteLength);
        }
        // Steps A, D of RFC6979 3.2
        // Creates RFC6979 seed; converts msg/privKey to numbers.
        // Used only in sign, not in verify.
        // NOTE: we cannot assume here that msgHash has same amount of bytes as curve order, this will be wrong at least for P521.
        // Also it can be bigger for P224 + SHA256
        function prepSig(msgHash, privateKey, opts = defaultSigOpts) {
            if (['recovered', 'canonical'].some((k) => k in opts))
                throw new Error('sign() legacy options not supported');
            const { hash, randomBytes } = CURVE;
            let { lowS, prehash, extraEntropy: ent } = opts; // generates low-s sigs by default
            if (lowS == null)
                lowS = true; // RFC6979 3.2: we skip step A, because we already provide hash
            msgHash = ensureBytes('msgHash', msgHash);
            if (prehash)
                msgHash = ensureBytes('prehashed msgHash', hash(msgHash));
            // We can't later call bits2octets, since nested bits2int is broken for curves
            // with nBitLength % 8 !== 0. Because of that, we unwrap it here as int2octets call.
            // const bits2octets = (bits) => int2octets(bits2int_modN(bits))
            const h1int = bits2int_modN(msgHash);
            const d = normPrivateKeyToScalar(privateKey); // validate private key, convert to bigint
            const seedArgs = [int2octets(d), int2octets(h1int)];
            // extraEntropy. RFC6979 3.6: additional k' (optional).
            if (ent != null) {
                // K = HMAC_K(V || 0x00 || int2octets(x) || bits2octets(h1) || k')
                const e = ent === true ? randomBytes(Fp.BYTES) : ent; // generate random bytes OR pass as-is
                seedArgs.push(ensureBytes('extraEntropy', e, Fp.BYTES)); // check for being of size BYTES
            }
            const seed = concatBytes(...seedArgs); // Step D of RFC6979 3.2
            const m = h1int; // NOTE: no need to call bits2int second time here, it is inside truncateHash!
            // Converts signature params into point w r/s, checks result for validity.
            function k2sig(kBytes) {
                // RFC 6979 Section 3.2, step 3: k = bits2int(T)
                const k = bits2int(kBytes); // Cannot use fields methods, since it is group element
                if (!isWithinCurveOrder(k))
                    return; // Important: all mod() calls here must be done over N
                const ik = invN(k); // k^-1 mod n
                const q = Point.BASE.multiply(k).toAffine(); // q = Gk
                const r = modN(q.x); // r = q.x mod n
                if (r === _0n$1)
                    return;
                // Can use scalar blinding b^-1(bm + bdr) where b ∈ [1,q−1] according to
                // https://tches.iacr.org/index.php/TCHES/article/view/7337/6509. We've decided against it:
                // a) dependency on CSPRNG b) 15% slowdown c) doesn't really help since bigints are not CT
                const s = modN(ik * modN(m + r * d)); // Not using blinding here
                if (s === _0n$1)
                    return;
                let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n$1); // recovery bit (2 or 3, when q.x > n)
                let normS = s;
                if (lowS && isBiggerThanHalfOrder(s)) {
                    normS = normalizeS(s); // if lowS was passed, ensure s is always
                    recovery ^= 1; // // in the bottom half of N
                }
                return new Signature(r, normS, recovery); // use normS, not s
            }
            return { seed, k2sig };
        }
        const defaultSigOpts = { lowS: CURVE.lowS, prehash: false };
        const defaultVerOpts = { lowS: CURVE.lowS, prehash: false };
        /**
         * Signs message hash (not message: you need to hash it by yourself).
         * ```
         * sign(m, d, k) where
         *   (x, y) = G × k
         *   r = x mod n
         *   s = (m + dr)/k mod n
         * ```
         * @param opts `lowS, extraEntropy, prehash`
         */
        function sign(msgHash, privKey, opts = defaultSigOpts) {
            const { seed, k2sig } = prepSig(msgHash, privKey, opts); // Steps A, D of RFC6979 3.2.
            const drbg = createHmacDrbg(CURVE.hash.outputLen, CURVE.nByteLength, CURVE.hmac);
            return drbg(seed, k2sig); // Steps B, C, D, E, F, G
        }
        // Enable precomputes. Slows down first publicKey computation by 20ms.
        Point.BASE._setWindowSize(8);
        // utils.precompute(8, ProjectivePoint.BASE)
        /**
         * Verifies a signature against message hash and public key.
         * Rejects lowS signatures by default: to override,
         * specify option `{lowS: false}`. Implements section 4.1.4 from https://www.secg.org/sec1-v2.pdf:
         *
         * ```
         * verify(r, s, h, P) where
         *   U1 = hs^-1 mod n
         *   U2 = rs^-1 mod n
         *   R = U1⋅G - U2⋅P
         *   mod(R.x, n) == r
         * ```
         */
        function verify(signature, msgHash, publicKey, opts = defaultVerOpts) {
            const sg = signature;
            msgHash = ensureBytes('msgHash', msgHash);
            publicKey = ensureBytes('publicKey', publicKey);
            if ('strict' in opts)
                throw new Error('options.strict was renamed to lowS');
            const { lowS, prehash } = opts;
            let _sig = undefined;
            let P;
            try {
                if (typeof sg === 'string' || sg instanceof Uint8Array) {
                    // Signature can be represented in 2 ways: compact (2*nByteLength) & DER (variable-length).
                    // Since DER can also be 2*nByteLength bytes, we check for it first.
                    try {
                        _sig = Signature.fromDER(sg);
                    }
                    catch (derError) {
                        if (!(derError instanceof DER.Err))
                            throw derError;
                        _sig = Signature.fromCompact(sg);
                    }
                }
                else if (typeof sg === 'object' && typeof sg.r === 'bigint' && typeof sg.s === 'bigint') {
                    const { r, s } = sg;
                    _sig = new Signature(r, s);
                }
                else {
                    throw new Error('PARSE');
                }
                P = Point.fromHex(publicKey);
            }
            catch (error) {
                if (error.message === 'PARSE')
                    throw new Error(`signature must be Signature instance, Uint8Array or hex string`);
                return false;
            }
            if (lowS && _sig.hasHighS())
                return false;
            if (prehash)
                msgHash = CURVE.hash(msgHash);
            const { r, s } = _sig;
            const h = bits2int_modN(msgHash); // Cannot use fields methods, since it is group element
            const is = invN(s); // s^-1
            const u1 = modN(h * is); // u1 = hs^-1 mod n
            const u2 = modN(r * is); // u2 = rs^-1 mod n
            const R = Point.BASE.multiplyAndAddUnsafe(P, u1, u2)?.toAffine(); // R = u1⋅G + u2⋅P
            if (!R)
                return false;
            const v = modN(R.x);
            return v === r;
        }
        return {
            CURVE,
            getPublicKey,
            getSharedSecret,
            sign,
            verify,
            ProjectivePoint: Point,
            Signature,
            utils,
        };
    }
    // Implementation of the Shallue and van de Woestijne method for any Weierstrass curve
    // TODO: check if there is a way to merge this with uvRatio in Edwards && move to modular?
    // b = True and y = sqrt(u / v) if (u / v) is square in F, and
    // b = False and y = sqrt(Z * (u / v)) otherwise.
    function SWUFpSqrtRatio(Fp, Z) {
        // Generic implementation
        const q = Fp.ORDER;
        let l = _0n$1;
        for (let o = q - _1n$1; o % _2n$1 === _0n$1; o /= _2n$1)
            l += _1n$1;
        const c1 = l; // 1. c1, the largest integer such that 2^c1 divides q - 1.
        const c2 = (q - _1n$1) / _2n$1 ** c1; // 2. c2 = (q - 1) / (2^c1)        # Integer arithmetic
        const c3 = (c2 - _1n$1) / _2n$1; // 3. c3 = (c2 - 1) / 2            # Integer arithmetic
        const c4 = _2n$1 ** c1 - _1n$1; // 4. c4 = 2^c1 - 1                # Integer arithmetic
        const c5 = _2n$1 ** (c1 - _1n$1); // 5. c5 = 2^(c1 - 1)              # Integer arithmetic
        const c6 = Fp.pow(Z, c2); // 6. c6 = Z^c2
        const c7 = Fp.pow(Z, (c2 + _1n$1) / _2n$1); // 7. c7 = Z^((c2 + 1) / 2)
        let sqrtRatio = (u, v) => {
            let tv1 = c6; // 1. tv1 = c6
            let tv2 = Fp.pow(v, c4); // 2. tv2 = v^c4
            let tv3 = Fp.sqr(tv2); // 3. tv3 = tv2^2
            tv3 = Fp.mul(tv3, v); // 4. tv3 = tv3 * v
            let tv5 = Fp.mul(u, tv3); // 5. tv5 = u * tv3
            tv5 = Fp.pow(tv5, c3); // 6. tv5 = tv5^c3
            tv5 = Fp.mul(tv5, tv2); // 7. tv5 = tv5 * tv2
            tv2 = Fp.mul(tv5, v); // 8. tv2 = tv5 * v
            tv3 = Fp.mul(tv5, u); // 9. tv3 = tv5 * u
            let tv4 = Fp.mul(tv3, tv2); // 10. tv4 = tv3 * tv2
            tv5 = Fp.pow(tv4, c5); // 11. tv5 = tv4^c5
            let isQR = Fp.eql(tv5, Fp.ONE); // 12. isQR = tv5 == 1
            tv2 = Fp.mul(tv3, c7); // 13. tv2 = tv3 * c7
            tv5 = Fp.mul(tv4, tv1); // 14. tv5 = tv4 * tv1
            tv3 = Fp.cmov(tv2, tv3, isQR); // 15. tv3 = CMOV(tv2, tv3, isQR)
            tv4 = Fp.cmov(tv5, tv4, isQR); // 16. tv4 = CMOV(tv5, tv4, isQR)
            // 17. for i in (c1, c1 - 1, ..., 2):
            for (let i = c1; i > _1n$1; i--) {
                let tv5 = _2n$1 ** (i - _2n$1); // 18.    tv5 = i - 2;    19.    tv5 = 2^tv5
                let tvv5 = Fp.pow(tv4, tv5); // 20.    tv5 = tv4^tv5
                const e1 = Fp.eql(tvv5, Fp.ONE); // 21.    e1 = tv5 == 1
                tv2 = Fp.mul(tv3, tv1); // 22.    tv2 = tv3 * tv1
                tv1 = Fp.mul(tv1, tv1); // 23.    tv1 = tv1 * tv1
                tvv5 = Fp.mul(tv4, tv1); // 24.    tv5 = tv4 * tv1
                tv3 = Fp.cmov(tv2, tv3, e1); // 25.    tv3 = CMOV(tv2, tv3, e1)
                tv4 = Fp.cmov(tvv5, tv4, e1); // 26.    tv4 = CMOV(tv5, tv4, e1)
            }
            return { isValid: isQR, value: tv3 };
        };
        if (Fp.ORDER % _4n === _3n) {
            // sqrt_ratio_3mod4(u, v)
            const c1 = (Fp.ORDER - _3n) / _4n; // 1. c1 = (q - 3) / 4     # Integer arithmetic
            const c2 = Fp.sqrt(Fp.neg(Z)); // 2. c2 = sqrt(-Z)
            sqrtRatio = (u, v) => {
                let tv1 = Fp.sqr(v); // 1. tv1 = v^2
                const tv2 = Fp.mul(u, v); // 2. tv2 = u * v
                tv1 = Fp.mul(tv1, tv2); // 3. tv1 = tv1 * tv2
                let y1 = Fp.pow(tv1, c1); // 4. y1 = tv1^c1
                y1 = Fp.mul(y1, tv2); // 5. y1 = y1 * tv2
                const y2 = Fp.mul(y1, c2); // 6. y2 = y1 * c2
                const tv3 = Fp.mul(Fp.sqr(y1), v); // 7. tv3 = y1^2; 8. tv3 = tv3 * v
                const isQR = Fp.eql(tv3, u); // 9. isQR = tv3 == u
                let y = Fp.cmov(y2, y1, isQR); // 10. y = CMOV(y2, y1, isQR)
                return { isValid: isQR, value: y }; // 11. return (isQR, y) isQR ? y : y*c2
            };
        }
        // No curves uses that
        // if (Fp.ORDER % _8n === _5n) // sqrt_ratio_5mod8
        return sqrtRatio;
    }
    // From draft-irtf-cfrg-hash-to-curve-16
    function mapToCurveSimpleSWU(Fp, opts) {
        validateField(Fp);
        if (!Fp.isValid(opts.A) || !Fp.isValid(opts.B) || !Fp.isValid(opts.Z))
            throw new Error('mapToCurveSimpleSWU: invalid opts');
        const sqrtRatio = SWUFpSqrtRatio(Fp, opts.Z);
        if (!Fp.isOdd)
            throw new Error('Fp.isOdd is not implemented!');
        // Input: u, an element of F.
        // Output: (x, y), a point on E.
        return (u) => {
            // prettier-ignore
            let tv1, tv2, tv3, tv4, tv5, tv6, x, y;
            tv1 = Fp.sqr(u); // 1.  tv1 = u^2
            tv1 = Fp.mul(tv1, opts.Z); // 2.  tv1 = Z * tv1
            tv2 = Fp.sqr(tv1); // 3.  tv2 = tv1^2
            tv2 = Fp.add(tv2, tv1); // 4.  tv2 = tv2 + tv1
            tv3 = Fp.add(tv2, Fp.ONE); // 5.  tv3 = tv2 + 1
            tv3 = Fp.mul(tv3, opts.B); // 6.  tv3 = B * tv3
            tv4 = Fp.cmov(opts.Z, Fp.neg(tv2), !Fp.eql(tv2, Fp.ZERO)); // 7.  tv4 = CMOV(Z, -tv2, tv2 != 0)
            tv4 = Fp.mul(tv4, opts.A); // 8.  tv4 = A * tv4
            tv2 = Fp.sqr(tv3); // 9.  tv2 = tv3^2
            tv6 = Fp.sqr(tv4); // 10. tv6 = tv4^2
            tv5 = Fp.mul(tv6, opts.A); // 11. tv5 = A * tv6
            tv2 = Fp.add(tv2, tv5); // 12. tv2 = tv2 + tv5
            tv2 = Fp.mul(tv2, tv3); // 13. tv2 = tv2 * tv3
            tv6 = Fp.mul(tv6, tv4); // 14. tv6 = tv6 * tv4
            tv5 = Fp.mul(tv6, opts.B); // 15. tv5 = B * tv6
            tv2 = Fp.add(tv2, tv5); // 16. tv2 = tv2 + tv5
            x = Fp.mul(tv1, tv3); // 17.   x = tv1 * tv3
            const { isValid, value } = sqrtRatio(tv2, tv6); // 18. (is_gx1_square, y1) = sqrt_ratio(tv2, tv6)
            y = Fp.mul(tv1, u); // 19.   y = tv1 * u  -> Z * u^3 * y1
            y = Fp.mul(y, value); // 20.   y = y * y1
            x = Fp.cmov(x, tv3, isValid); // 21.   x = CMOV(x, tv3, is_gx1_square)
            y = Fp.cmov(y, value, isValid); // 22.   y = CMOV(y, y1, is_gx1_square)
            const e1 = Fp.isOdd(u) === Fp.isOdd(y); // 23.  e1 = sgn0(u) == sgn0(y)
            y = Fp.cmov(Fp.neg(y), y, e1); // 24.   y = CMOV(-y, y, e1)
            x = Fp.div(x, tv4); // 25.   x = x / tv4
            return { x, y };
        };
    }

    function validateDST(dst) {
        if (dst instanceof Uint8Array)
            return dst;
        if (typeof dst === 'string')
            return utf8ToBytes(dst);
        throw new Error('DST must be Uint8Array or string');
    }
    // Octet Stream to Integer. "spec" implementation of os2ip is 2.5x slower vs bytesToNumberBE.
    const os2ip = bytesToNumberBE;
    // Integer to Octet Stream (numberToBytesBE)
    function i2osp(value, length) {
        if (value < 0 || value >= 1 << (8 * length)) {
            throw new Error(`bad I2OSP call: value=${value} length=${length}`);
        }
        const res = Array.from({ length }).fill(0);
        for (let i = length - 1; i >= 0; i--) {
            res[i] = value & 0xff;
            value >>>= 8;
        }
        return new Uint8Array(res);
    }
    function strxor(a, b) {
        const arr = new Uint8Array(a.length);
        for (let i = 0; i < a.length; i++) {
            arr[i] = a[i] ^ b[i];
        }
        return arr;
    }
    function isBytes(item) {
        if (!(item instanceof Uint8Array))
            throw new Error('Uint8Array expected');
    }
    function isNum(item) {
        if (!Number.isSafeInteger(item))
            throw new Error('number expected');
    }
    // Produces a uniformly random byte string using a cryptographic hash function H that outputs b bits
    // https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve-11#section-5.4.1
    function expand_message_xmd(msg, DST, lenInBytes, H) {
        isBytes(msg);
        isBytes(DST);
        isNum(lenInBytes);
        // https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve-16#section-5.3.3
        if (DST.length > 255)
            DST = H(concatBytes(utf8ToBytes('H2C-OVERSIZE-DST-'), DST));
        const { outputLen: b_in_bytes, blockLen: r_in_bytes } = H;
        const ell = Math.ceil(lenInBytes / b_in_bytes);
        if (ell > 255)
            throw new Error('Invalid xmd length');
        const DST_prime = concatBytes(DST, i2osp(DST.length, 1));
        const Z_pad = i2osp(0, r_in_bytes);
        const l_i_b_str = i2osp(lenInBytes, 2); // len_in_bytes_str
        const b = new Array(ell);
        const b_0 = H(concatBytes(Z_pad, msg, l_i_b_str, i2osp(0, 1), DST_prime));
        b[0] = H(concatBytes(b_0, i2osp(1, 1), DST_prime));
        for (let i = 1; i <= ell; i++) {
            const args = [strxor(b_0, b[i - 1]), i2osp(i + 1, 1), DST_prime];
            b[i] = H(concatBytes(...args));
        }
        const pseudo_random_bytes = concatBytes(...b);
        return pseudo_random_bytes.slice(0, lenInBytes);
    }
    function expand_message_xof(msg, DST, lenInBytes, k, H) {
        isBytes(msg);
        isBytes(DST);
        isNum(lenInBytes);
        // https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve-16#section-5.3.3
        // DST = H('H2C-OVERSIZE-DST-' || a_very_long_DST, Math.ceil((lenInBytes * k) / 8));
        if (DST.length > 255) {
            const dkLen = Math.ceil((2 * k) / 8);
            DST = H.create({ dkLen }).update(utf8ToBytes('H2C-OVERSIZE-DST-')).update(DST).digest();
        }
        if (lenInBytes > 65535 || DST.length > 255)
            throw new Error('expand_message_xof: invalid lenInBytes');
        return (H.create({ dkLen: lenInBytes })
            .update(msg)
            .update(i2osp(lenInBytes, 2))
            // 2. DST_prime = DST || I2OSP(len(DST), 1)
            .update(DST)
            .update(i2osp(DST.length, 1))
            .digest());
    }
    /**
     * Hashes arbitrary-length byte strings to a list of one or more elements of a finite field F
     * https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve-11#section-5.3
     * @param msg a byte string containing the message to hash
     * @param count the number of elements of F to output
     * @param options `{DST: string, p: bigint, m: number, k: number, expand: 'xmd' | 'xof', hash: H}`, see above
     * @returns [u_0, ..., u_(count - 1)], a list of field elements.
     */
    function hash_to_field(msg, count, options) {
        validateObject(options, {
            DST: 'string',
            p: 'bigint',
            m: 'isSafeInteger',
            k: 'isSafeInteger',
            hash: 'hash',
        });
        const { p, k, m, hash, expand, DST: _DST } = options;
        isBytes(msg);
        isNum(count);
        const DST = validateDST(_DST);
        const log2p = p.toString(2).length;
        const L = Math.ceil((log2p + k) / 8); // section 5.1 of ietf draft link above
        const len_in_bytes = count * m * L;
        let prb; // pseudo_random_bytes
        if (expand === 'xmd') {
            prb = expand_message_xmd(msg, DST, len_in_bytes, hash);
        }
        else if (expand === 'xof') {
            prb = expand_message_xof(msg, DST, len_in_bytes, k, hash);
        }
        else if (expand === '_internal_pass') {
            // for internal tests only
            prb = msg;
        }
        else {
            throw new Error('expand must be "xmd" or "xof"');
        }
        const u = new Array(count);
        for (let i = 0; i < count; i++) {
            const e = new Array(m);
            for (let j = 0; j < m; j++) {
                const elm_offset = L * (j + i * m);
                const tv = prb.subarray(elm_offset, elm_offset + L);
                e[j] = mod(os2ip(tv), p);
            }
            u[i] = e;
        }
        return u;
    }
    function isogenyMap(field, map) {
        // Make same order as in spec
        const COEFF = map.map((i) => Array.from(i).reverse());
        return (x, y) => {
            const [xNum, xDen, yNum, yDen] = COEFF.map((val) => val.reduce((acc, i) => field.add(field.mul(acc, x), i)));
            x = field.div(xNum, xDen); // xNum / xDen
            y = field.mul(y, field.div(yNum, yDen)); // y * (yNum / yDev)
            return { x, y };
        };
    }
    function createHasher(Point, mapToCurve, def) {
        if (typeof mapToCurve !== 'function')
            throw new Error('mapToCurve() must be defined');
        return {
            // Encodes byte string to elliptic curve
            // https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve-16#section-3
            hashToCurve(msg, options) {
                const u = hash_to_field(msg, 2, { ...def, DST: def.DST, ...options });
                const u0 = Point.fromAffine(mapToCurve(u[0]));
                const u1 = Point.fromAffine(mapToCurve(u[1]));
                const P = u0.add(u1).clearCofactor();
                P.assertValidity();
                return P;
            },
            // https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve-16#section-3
            encodeToCurve(msg, options) {
                const u = hash_to_field(msg, 1, { ...def, DST: def.encodeDST, ...options });
                const P = Point.fromAffine(mapToCurve(u[0])).clearCofactor();
                P.assertValidity();
                return P;
            },
        };
    }

    // HMAC (RFC 2104)
    class HMAC extends Hash {
        constructor(hash, _key) {
            super();
            this.finished = false;
            this.destroyed = false;
            assert$1.hash(hash);
            const key = toBytes(_key);
            this.iHash = hash.create();
            if (typeof this.iHash.update !== 'function')
                throw new TypeError('Expected instance of class which extends utils.Hash');
            this.blockLen = this.iHash.blockLen;
            this.outputLen = this.iHash.outputLen;
            const blockLen = this.blockLen;
            const pad = new Uint8Array(blockLen);
            // blockLen can be bigger than outputLen
            pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36;
            this.iHash.update(pad);
            // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
            this.oHash = hash.create();
            // Undo internal XOR && apply outer XOR
            for (let i = 0; i < pad.length; i++)
                pad[i] ^= 0x36 ^ 0x5c;
            this.oHash.update(pad);
            pad.fill(0);
        }
        update(buf) {
            assert$1.exists(this);
            this.iHash.update(buf);
            return this;
        }
        digestInto(out) {
            assert$1.exists(this);
            assert$1.bytes(out, this.outputLen);
            this.finished = true;
            this.iHash.digestInto(out);
            this.oHash.update(out);
            this.oHash.digestInto(out);
            this.destroy();
        }
        digest() {
            const out = new Uint8Array(this.oHash.outputLen);
            this.digestInto(out);
            return out;
        }
        _cloneInto(to) {
            // Create new instance without calling constructor since key already in state and we don't know it.
            to || (to = Object.create(Object.getPrototypeOf(this), {}));
            const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
            to = to;
            to.finished = finished;
            to.destroyed = destroyed;
            to.blockLen = blockLen;
            to.outputLen = outputLen;
            to.oHash = oHash._cloneInto(to.oHash);
            to.iHash = iHash._cloneInto(to.iHash);
            return to;
        }
        destroy() {
            this.destroyed = true;
            this.oHash.destroy();
            this.iHash.destroy();
        }
    }
    /**
     * HMAC: RFC2104 message authentication code.
     * @param hash - function that would be used e.g. sha256
     * @param key - message key
     * @param message - message data
     */
    const hmac$1 = (hash, key, message) => new HMAC(hash, key).update(message).digest();
    hmac$1.create = (hash, key) => new HMAC(hash, key);

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    // connects noble-curves to noble-hashes
    function getHash(hash) {
        return {
            hash,
            hmac: (key, ...msgs) => hmac$1(hash, key, concatBytes$1(...msgs)),
            randomBytes,
        };
    }
    function createCurve(curveDef, defHash) {
        const create = (hash) => weierstrass({ ...curveDef, ...getHash(hash) });
        return Object.freeze({ ...create(defHash), create });
    }

    /*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    const secp256k1P = BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f');
    const secp256k1N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
    const _1n = BigInt(1);
    const _2n = BigInt(2);
    const divNearest = (a, b) => (a + b / _2n) / b;
    /**
     * √n = n^((p+1)/4) for fields p = 3 mod 4. We unwrap the loop and multiply bit-by-bit.
     * (P+1n/4n).toString(2) would produce bits [223x 1, 0, 22x 1, 4x 0, 11, 00]
     */
    function sqrtMod(y) {
        const P = secp256k1P;
        // prettier-ignore
        const _3n = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
        // prettier-ignore
        const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
        const b2 = (y * y * y) % P; // x^3, 11
        const b3 = (b2 * b2 * y) % P; // x^7
        const b6 = (pow2(b3, _3n, P) * b3) % P;
        const b9 = (pow2(b6, _3n, P) * b3) % P;
        const b11 = (pow2(b9, _2n, P) * b2) % P;
        const b22 = (pow2(b11, _11n, P) * b11) % P;
        const b44 = (pow2(b22, _22n, P) * b22) % P;
        const b88 = (pow2(b44, _44n, P) * b44) % P;
        const b176 = (pow2(b88, _88n, P) * b88) % P;
        const b220 = (pow2(b176, _44n, P) * b44) % P;
        const b223 = (pow2(b220, _3n, P) * b3) % P;
        const t1 = (pow2(b223, _23n, P) * b22) % P;
        const t2 = (pow2(t1, _6n, P) * b2) % P;
        const root = pow2(t2, _2n, P);
        if (!Fp.eql(Fp.sqr(root), y))
            throw new Error('Cannot find square root');
        return root;
    }
    const Fp = Field(secp256k1P, undefined, undefined, { sqrt: sqrtMod });
    const secp256k1 = createCurve({
        a: BigInt(0),
        b: BigInt(7),
        Fp,
        n: secp256k1N,
        // Base point (x, y) aka generator point
        Gx: BigInt('55066263022277343669578718895168534326250603453777594175500187360389116729240'),
        Gy: BigInt('32670510020758816978083085130507043184471273380659243275938904335757337482424'),
        h: BigInt(1),
        lowS: true,
        /**
         * secp256k1 belongs to Koblitz curves: it has efficiently computable endomorphism.
         * Endomorphism uses 2x less RAM, speeds up precomputation by 2x and ECDH / key recovery by 20%.
         * For precomputed wNAF it trades off 1/2 init time & 1/3 ram for 20% perf hit.
         * Explanation: https://gist.github.com/paulmillr/eb670806793e84df628a7c434a873066
         */
        endo: {
            beta: BigInt('0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee'),
            splitScalar: (k) => {
                const n = secp256k1N;
                const a1 = BigInt('0x3086d221a7d46bcde86c90e49284eb15');
                const b1 = -_1n * BigInt('0xe4437ed6010e88286f547fa90abfe4c3');
                const a2 = BigInt('0x114ca50f7a8e2f3f657c1108d9d44cfd8');
                const b2 = a1;
                const POW_2_128 = BigInt('0x100000000000000000000000000000000'); // (2n**128n).toString(16)
                const c1 = divNearest(b2 * k, n);
                const c2 = divNearest(-b1 * k, n);
                let k1 = mod(k - c1 * a1 - c2 * a2, n);
                let k2 = mod(-c1 * b1 - c2 * b2, n);
                const k1neg = k1 > POW_2_128;
                const k2neg = k2 > POW_2_128;
                if (k1neg)
                    k1 = n - k1;
                if (k2neg)
                    k2 = n - k2;
                if (k1 > POW_2_128 || k2 > POW_2_128) {
                    throw new Error('splitScalar: Endomorphism failed, k=' + k);
                }
                return { k1neg, k1, k2neg, k2 };
            },
        },
    }, sha256$1);
    // Schnorr signatures are superior to ECDSA from above. Below is Schnorr-specific BIP0340 code.
    // https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki
    const _0n = BigInt(0);
    const fe = (x) => typeof x === 'bigint' && _0n < x && x < secp256k1P;
    const ge = (x) => typeof x === 'bigint' && _0n < x && x < secp256k1N;
    /** An object mapping tags to their tagged hash prefix of [SHA256(tag) | SHA256(tag)] */
    const TAGGED_HASH_PREFIXES = {};
    function taggedHash(tag, ...messages) {
        let tagP = TAGGED_HASH_PREFIXES[tag];
        if (tagP === undefined) {
            const tagH = sha256$1(Uint8Array.from(tag, (c) => c.charCodeAt(0)));
            tagP = concatBytes(tagH, tagH);
            TAGGED_HASH_PREFIXES[tag] = tagP;
        }
        return sha256$1(concatBytes(tagP, ...messages));
    }
    // ECDSA compact points are 33-byte. Schnorr is 32: we strip first byte 0x02 or 0x03
    const pointToBytes = (point) => point.toRawBytes(true).slice(1);
    const numTo32b = (n) => numberToBytesBE(n, 32);
    const modP = (x) => mod(x, secp256k1P);
    const modN = (x) => mod(x, secp256k1N);
    const Point$1 = secp256k1.ProjectivePoint;
    const GmulAdd = (Q, a, b) => Point$1.BASE.multiplyAndAddUnsafe(Q, a, b);
    // Calculate point, scalar and bytes
    function schnorrGetExtPubKey(priv) {
        let d_ = secp256k1.utils.normPrivateKeyToScalar(priv); // same method executed in fromPrivateKey
        let p = Point$1.fromPrivateKey(d_); // P = d'⋅G; 0 < d' < n check is done inside
        const scalar = p.hasEvenY() ? d_ : modN(-d_);
        return { scalar: scalar, bytes: pointToBytes(p) };
    }
    /**
     * lift_x from BIP340. Convert 32-byte x coordinate to elliptic curve point.
     * @returns valid point checked for being on-curve
     */
    function lift_x(x) {
        if (!fe(x))
            throw new Error('bad x: need 0 < x < p'); // Fail if x ≥ p.
        const xx = modP(x * x);
        const c = modP(xx * x + BigInt(7)); // Let c = x³ + 7 mod p.
        let y = sqrtMod(c); // Let y = c^(p+1)/4 mod p.
        if (y % _2n !== _0n)
            y = modP(-y); // Return the unique point P such that x(P) = x and
        const p = new Point$1(x, y, _1n); // y(P) = y if y mod 2 = 0 or y(P) = p-y otherwise.
        p.assertValidity();
        return p;
    }
    /**
     * Create tagged hash, convert it to bigint, reduce modulo-n.
     */
    function challenge(...args) {
        return modN(bytesToNumberBE(taggedHash('BIP0340/challenge', ...args)));
    }
    /**
     * Schnorr public key is just `x` coordinate of Point as per BIP340.
     */
    function schnorrGetPublicKey(privateKey) {
        return schnorrGetExtPubKey(privateKey).bytes; // d'=int(sk). Fail if d'=0 or d'≥n. Ret bytes(d'⋅G)
    }
    /**
     * Creates Schnorr signature as per BIP340. Verifies itself before returning anything.
     * auxRand is optional and is not the sole source of k generation: bad CSPRNG won't be dangerous.
     */
    function schnorrSign(message, privateKey, auxRand = randomBytes(32)) {
        const m = ensureBytes('message', message);
        const { bytes: px, scalar: d } = schnorrGetExtPubKey(privateKey); // checks for isWithinCurveOrder
        const a = ensureBytes('auxRand', auxRand, 32); // Auxiliary random data a: a 32-byte array
        const t = numTo32b(d ^ bytesToNumberBE(taggedHash('BIP0340/aux', a))); // Let t be the byte-wise xor of bytes(d) and hash/aux(a)
        const rand = taggedHash('BIP0340/nonce', t, px, m); // Let rand = hash/nonce(t || bytes(P) || m)
        const k_ = modN(bytesToNumberBE(rand)); // Let k' = int(rand) mod n
        if (k_ === _0n)
            throw new Error('sign failed: k is zero'); // Fail if k' = 0.
        const { bytes: rx, scalar: k } = schnorrGetExtPubKey(k_); // Let R = k'⋅G.
        const e = challenge(rx, px, m); // Let e = int(hash/challenge(bytes(R) || bytes(P) || m)) mod n.
        const sig = new Uint8Array(64); // Let sig = bytes(R) || bytes((k + ed) mod n).
        sig.set(rx, 0);
        sig.set(numTo32b(modN(k + e * d)), 32);
        // If Verify(bytes(P), m, sig) (see below) returns failure, abort
        if (!schnorrVerify(sig, m, px))
            throw new Error('sign: Invalid signature produced');
        return sig;
    }
    /**
     * Verifies Schnorr signature.
     * Will swallow errors & return false except for initial type validation of arguments.
     */
    function schnorrVerify(signature, message, publicKey) {
        const sig = ensureBytes('signature', signature, 64);
        const m = ensureBytes('message', message);
        const pub = ensureBytes('publicKey', publicKey, 32);
        try {
            const P = lift_x(bytesToNumberBE(pub)); // P = lift_x(int(pk)); fail if that fails
            const r = bytesToNumberBE(sig.subarray(0, 32)); // Let r = int(sig[0:32]); fail if r ≥ p.
            if (!fe(r))
                return false;
            const s = bytesToNumberBE(sig.subarray(32, 64)); // Let s = int(sig[32:64]); fail if s ≥ n.
            if (!ge(s))
                return false;
            const e = challenge(numTo32b(r), pointToBytes(P), m); // int(challenge(bytes(r)||bytes(P)||m))%n
            const R = GmulAdd(P, s, modN(-e)); // R = s⋅G - e⋅P
            if (!R || !R.hasEvenY() || R.toAffine().x !== r)
                return false; // -eP == (n-e)P
            return true; // Fail if is_infinite(R) / not has_even_y(R) / x(R) ≠ r.
        }
        catch (error) {
            return false;
        }
    }
    const schnorr = {
        getPublicKey: schnorrGetPublicKey,
        sign: schnorrSign,
        verify: schnorrVerify,
        utils: {
            randomPrivateKey: secp256k1.utils.randomPrivateKey,
            lift_x,
            pointToBytes,
            numberToBytesBE,
            bytesToNumberBE,
            taggedHash,
            mod,
        },
    };
    const isoMap = isogenyMap(Fp, [
        // xNum
        [
            '0x8e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38daaaaa8c7',
            '0x7d3d4c80bc321d5b9f315cea7fd44c5d595d2fc0bf63b92dfff1044f17c6581',
            '0x534c328d23f234e6e2a413deca25caece4506144037c40314ecbd0b53d9dd262',
            '0x8e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38e38daaaaa88c',
        ],
        // xDen
        [
            '0xd35771193d94918a9ca34ccbb7b640dd86cd409542f8487d9fe6b745781eb49b',
            '0xedadc6f64383dc1df7c4b2d51b54225406d36b641f5e41bbc52a56612a8c6d14',
            '0x0000000000000000000000000000000000000000000000000000000000000001', // LAST 1
        ],
        // yNum
        [
            '0x4bda12f684bda12f684bda12f684bda12f684bda12f684bda12f684b8e38e23c',
            '0xc75e0c32d5cb7c0fa9d0a54b12a0a6d5647ab046d686da6fdffc90fc201d71a3',
            '0x29a6194691f91a73715209ef6512e576722830a201be2018a765e85a9ecee931',
            '0x2f684bda12f684bda12f684bda12f684bda12f684bda12f684bda12f38e38d84',
        ],
        // yDen
        [
            '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffff93b',
            '0x7a06534bb8bdb49fd5e9e6632722c2989467c1bfc8e8d978dfb425d2685c2573',
            '0x6484aa716545ca2cf3a70c3fa8fe337e0a3d21162f0d6299a7bf8192bfd2a76f',
            '0x0000000000000000000000000000000000000000000000000000000000000001', // LAST 1
        ],
    ].map((i) => i.map((j) => BigInt(j))));
    const mapSWU = mapToCurveSimpleSWU(Fp, {
        A: BigInt('0x3f8731abdd661adca08a5558f0f5d272e953d363cb6f0e5d405447c01a444533'),
        B: BigInt('1771'),
        Z: Fp.create(BigInt('-11')),
    });
    createHasher(secp256k1.ProjectivePoint, (scalars) => {
        const { x, y } = mapSWU(Fp.create(scalars[0]));
        return isoMap(x, y);
    }, {
        DST: 'secp256k1_XMD:SHA-256_SSWU_RO_',
        encodeDST: 'secp256k1_XMD:SHA-256_SSWU_NU_',
        p: Fp.ORDER,
        m: 1,
        k: 128,
        expand: 'xmd',
        hash: sha256$1,
    });

    /*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    function assertNumber(n) {
        if (!Number.isSafeInteger(n))
            throw new Error(`Wrong integer: ${n}`);
    }
    function chain(...args) {
        const wrap = (a, b) => (c) => a(b(c));
        const encode = Array.from(args)
            .reverse()
            .reduce((acc, i) => (acc ? wrap(acc, i.encode) : i.encode), undefined);
        const decode = args.reduce((acc, i) => (acc ? wrap(acc, i.decode) : i.decode), undefined);
        return { encode, decode };
    }
    function alphabet(alphabet) {
        return {
            encode: (digits) => {
                if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
                    throw new Error('alphabet.encode input should be an array of numbers');
                return digits.map((i) => {
                    assertNumber(i);
                    if (i < 0 || i >= alphabet.length)
                        throw new Error(`Digit index outside alphabet: ${i} (alphabet: ${alphabet.length})`);
                    return alphabet[i];
                });
            },
            decode: (input) => {
                if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string'))
                    throw new Error('alphabet.decode input should be array of strings');
                return input.map((letter) => {
                    if (typeof letter !== 'string')
                        throw new Error(`alphabet.decode: not string element=${letter}`);
                    const index = alphabet.indexOf(letter);
                    if (index === -1)
                        throw new Error(`Unknown letter: "${letter}". Allowed: ${alphabet}`);
                    return index;
                });
            },
        };
    }
    function join(separator = '') {
        if (typeof separator !== 'string')
            throw new Error('join separator should be string');
        return {
            encode: (from) => {
                if (!Array.isArray(from) || (from.length && typeof from[0] !== 'string'))
                    throw new Error('join.encode input should be array of strings');
                for (let i of from)
                    if (typeof i !== 'string')
                        throw new Error(`join.encode: non-string input=${i}`);
                return from.join(separator);
            },
            decode: (to) => {
                if (typeof to !== 'string')
                    throw new Error('join.decode input should be string');
                return to.split(separator);
            },
        };
    }
    function padding(bits, chr = '=') {
        assertNumber(bits);
        if (typeof chr !== 'string')
            throw new Error('padding chr should be string');
        return {
            encode(data) {
                if (!Array.isArray(data) || (data.length && typeof data[0] !== 'string'))
                    throw new Error('padding.encode input should be array of strings');
                for (let i of data)
                    if (typeof i !== 'string')
                        throw new Error(`padding.encode: non-string input=${i}`);
                while ((data.length * bits) % 8)
                    data.push(chr);
                return data;
            },
            decode(input) {
                if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string'))
                    throw new Error('padding.encode input should be array of strings');
                for (let i of input)
                    if (typeof i !== 'string')
                        throw new Error(`padding.decode: non-string input=${i}`);
                let end = input.length;
                if ((end * bits) % 8)
                    throw new Error('Invalid padding: string should have whole number of bytes');
                for (; end > 0 && input[end - 1] === chr; end--) {
                    if (!(((end - 1) * bits) % 8))
                        throw new Error('Invalid padding: string has too much padding');
                }
                return input.slice(0, end);
            },
        };
    }
    function normalize$1(fn) {
        if (typeof fn !== 'function')
            throw new Error('normalize fn should be function');
        return { encode: (from) => from, decode: (to) => fn(to) };
    }
    function convertRadix(data, from, to) {
        if (from < 2)
            throw new Error(`convertRadix: wrong from=${from}, base cannot be less than 2`);
        if (to < 2)
            throw new Error(`convertRadix: wrong to=${to}, base cannot be less than 2`);
        if (!Array.isArray(data))
            throw new Error('convertRadix: data should be array');
        if (!data.length)
            return [];
        let pos = 0;
        const res = [];
        const digits = Array.from(data);
        digits.forEach((d) => {
            assertNumber(d);
            if (d < 0 || d >= from)
                throw new Error(`Wrong integer: ${d}`);
        });
        while (true) {
            let carry = 0;
            let done = true;
            for (let i = pos; i < digits.length; i++) {
                const digit = digits[i];
                const digitBase = from * carry + digit;
                if (!Number.isSafeInteger(digitBase) ||
                    (from * carry) / from !== carry ||
                    digitBase - digit !== from * carry) {
                    throw new Error('convertRadix: carry overflow');
                }
                carry = digitBase % to;
                digits[i] = Math.floor(digitBase / to);
                if (!Number.isSafeInteger(digits[i]) || digits[i] * to + carry !== digitBase)
                    throw new Error('convertRadix: carry overflow');
                if (!done)
                    continue;
                else if (!digits[i])
                    pos = i;
                else
                    done = false;
            }
            res.push(carry);
            if (done)
                break;
        }
        for (let i = 0; i < data.length - 1 && data[i] === 0; i++)
            res.push(0);
        return res.reverse();
    }
    const gcd = (a, b) => (!b ? a : gcd(b, a % b));
    const radix2carry = (from, to) => from + (to - gcd(from, to));
    function convertRadix2(data, from, to, padding) {
        if (!Array.isArray(data))
            throw new Error('convertRadix2: data should be array');
        if (from <= 0 || from > 32)
            throw new Error(`convertRadix2: wrong from=${from}`);
        if (to <= 0 || to > 32)
            throw new Error(`convertRadix2: wrong to=${to}`);
        if (radix2carry(from, to) > 32) {
            throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${radix2carry(from, to)}`);
        }
        let carry = 0;
        let pos = 0;
        const mask = 2 ** to - 1;
        const res = [];
        for (const n of data) {
            assertNumber(n);
            if (n >= 2 ** from)
                throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
            carry = (carry << from) | n;
            if (pos + from > 32)
                throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
            pos += from;
            for (; pos >= to; pos -= to)
                res.push(((carry >> (pos - to)) & mask) >>> 0);
            carry &= 2 ** pos - 1;
        }
        carry = (carry << (to - pos)) & mask;
        if (!padding && pos >= from)
            throw new Error('Excess padding');
        if (!padding && carry)
            throw new Error(`Non-zero padding: ${carry}`);
        if (padding && pos > 0)
            res.push(carry >>> 0);
        return res;
    }
    function radix(num) {
        assertNumber(num);
        return {
            encode: (bytes) => {
                if (!(bytes instanceof Uint8Array))
                    throw new Error('radix.encode input should be Uint8Array');
                return convertRadix(Array.from(bytes), 2 ** 8, num);
            },
            decode: (digits) => {
                if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
                    throw new Error('radix.decode input should be array of strings');
                return Uint8Array.from(convertRadix(digits, num, 2 ** 8));
            },
        };
    }
    function radix2(bits, revPadding = false) {
        assertNumber(bits);
        if (bits <= 0 || bits > 32)
            throw new Error('radix2: bits should be in (0..32]');
        if (radix2carry(8, bits) > 32 || radix2carry(bits, 8) > 32)
            throw new Error('radix2: carry overflow');
        return {
            encode: (bytes) => {
                if (!(bytes instanceof Uint8Array))
                    throw new Error('radix2.encode input should be Uint8Array');
                return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
            },
            decode: (digits) => {
                if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
                    throw new Error('radix2.decode input should be array of strings');
                return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
            },
        };
    }
    function unsafeWrapper(fn) {
        if (typeof fn !== 'function')
            throw new Error('unsafeWrapper fn should be function');
        return function (...args) {
            try {
                return fn.apply(null, args);
            }
            catch (e) { }
        };
    }
    function checksum(len, fn) {
        assertNumber(len);
        if (typeof fn !== 'function')
            throw new Error('checksum fn should be function');
        return {
            encode(data) {
                if (!(data instanceof Uint8Array))
                    throw new Error('checksum.encode: input should be Uint8Array');
                const checksum = fn(data).slice(0, len);
                const res = new Uint8Array(data.length + len);
                res.set(data);
                res.set(checksum, data.length);
                return res;
            },
            decode(data) {
                if (!(data instanceof Uint8Array))
                    throw new Error('checksum.decode: input should be Uint8Array');
                const payload = data.slice(0, -len);
                const newChecksum = fn(payload).slice(0, len);
                const oldChecksum = data.slice(-len);
                for (let i = 0; i < len; i++)
                    if (newChecksum[i] !== oldChecksum[i])
                        throw new Error('Invalid checksum');
                return payload;
            },
        };
    }
    const base16 = chain(radix2(4), alphabet('0123456789ABCDEF'), join(''));
    const base32 = chain(radix2(5), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), padding(5), join(''));
    chain(radix2(5), alphabet('0123456789ABCDEFGHIJKLMNOPQRSTUV'), padding(5), join(''));
    chain(radix2(5), alphabet('0123456789ABCDEFGHJKMNPQRSTVWXYZ'), join(''), normalize$1((s) => s.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')));
    const base64 = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), padding(6), join(''));
    const base64url = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'), padding(6), join(''));
    const genBase58 = (abc) => chain(radix(58), alphabet(abc), join(''));
    const base58 = genBase58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');
    genBase58('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ');
    genBase58('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz');
    const XMR_BLOCK_LEN = [0, 2, 3, 5, 6, 7, 9, 10, 11];
    const base58xmr = {
        encode(data) {
            let res = '';
            for (let i = 0; i < data.length; i += 8) {
                const block = data.subarray(i, i + 8);
                res += base58.encode(block).padStart(XMR_BLOCK_LEN[block.length], '1');
            }
            return res;
        },
        decode(str) {
            let res = [];
            for (let i = 0; i < str.length; i += 11) {
                const slice = str.slice(i, i + 11);
                const blockLen = XMR_BLOCK_LEN.indexOf(slice.length);
                const block = base58.decode(slice);
                for (let j = 0; j < block.length - blockLen; j++) {
                    if (block[j] !== 0)
                        throw new Error('base58xmr: wrong padding');
                }
                res = res.concat(Array.from(block.slice(block.length - blockLen)));
            }
            return Uint8Array.from(res);
        },
    };
    const base58check$1 = (sha256) => chain(checksum(4, (data) => sha256(sha256(data))), base58);
    const BECH_ALPHABET = chain(alphabet('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), join(''));
    const POLYMOD_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    function bech32Polymod(pre) {
        const b = pre >> 25;
        let chk = (pre & 0x1ffffff) << 5;
        for (let i = 0; i < POLYMOD_GENERATORS.length; i++) {
            if (((b >> i) & 1) === 1)
                chk ^= POLYMOD_GENERATORS[i];
        }
        return chk;
    }
    function bechChecksum(prefix, words, encodingConst = 1) {
        const len = prefix.length;
        let chk = 1;
        for (let i = 0; i < len; i++) {
            const c = prefix.charCodeAt(i);
            if (c < 33 || c > 126)
                throw new Error(`Invalid prefix (${prefix})`);
            chk = bech32Polymod(chk) ^ (c >> 5);
        }
        chk = bech32Polymod(chk);
        for (let i = 0; i < len; i++)
            chk = bech32Polymod(chk) ^ (prefix.charCodeAt(i) & 0x1f);
        for (let v of words)
            chk = bech32Polymod(chk) ^ v;
        for (let i = 0; i < 6; i++)
            chk = bech32Polymod(chk);
        chk ^= encodingConst;
        return BECH_ALPHABET.encode(convertRadix2([chk % 2 ** 30], 30, 5, false));
    }
    function genBech32(encoding) {
        const ENCODING_CONST = encoding === 'bech32' ? 1 : 0x2bc830a3;
        const _words = radix2(5);
        const fromWords = _words.decode;
        const toWords = _words.encode;
        const fromWordsUnsafe = unsafeWrapper(fromWords);
        function encode(prefix, words, limit = 90) {
            if (typeof prefix !== 'string')
                throw new Error(`bech32.encode prefix should be string, not ${typeof prefix}`);
            if (!Array.isArray(words) || (words.length && typeof words[0] !== 'number'))
                throw new Error(`bech32.encode words should be array of numbers, not ${typeof words}`);
            const actualLength = prefix.length + 7 + words.length;
            if (limit !== false && actualLength > limit)
                throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
            prefix = prefix.toLowerCase();
            return `${prefix}1${BECH_ALPHABET.encode(words)}${bechChecksum(prefix, words, ENCODING_CONST)}`;
        }
        function decode(str, limit = 90) {
            if (typeof str !== 'string')
                throw new Error(`bech32.decode input should be string, not ${typeof str}`);
            if (str.length < 8 || (limit !== false && str.length > limit))
                throw new TypeError(`Wrong string length: ${str.length} (${str}). Expected (8..${limit})`);
            const lowered = str.toLowerCase();
            if (str !== lowered && str !== str.toUpperCase())
                throw new Error(`String must be lowercase or uppercase`);
            str = lowered;
            const sepIndex = str.lastIndexOf('1');
            if (sepIndex === 0 || sepIndex === -1)
                throw new Error(`Letter "1" must be present between prefix and data only`);
            const prefix = str.slice(0, sepIndex);
            const _words = str.slice(sepIndex + 1);
            if (_words.length < 6)
                throw new Error('Data must be at least 6 characters long');
            const words = BECH_ALPHABET.decode(_words).slice(0, -6);
            const sum = bechChecksum(prefix, words, ENCODING_CONST);
            if (!_words.endsWith(sum))
                throw new Error(`Invalid checksum in ${str}: expected "${sum}"`);
            return { prefix, words };
        }
        const decodeUnsafe = unsafeWrapper(decode);
        function decodeToBytes(str) {
            const { prefix, words } = decode(str, false);
            return { prefix, words, bytes: fromWords(words) };
        }
        return { encode, decode, decodeToBytes, decodeUnsafe, fromWords, fromWordsUnsafe, toWords };
    }
    const bech32 = genBech32('bech32');
    genBech32('bech32m');
    const utf8 = {
        encode: (data) => new TextDecoder().decode(data),
        decode: (str) => new TextEncoder().encode(str),
    };
    const hex = chain(radix2(4), alphabet('0123456789abcdef'), join(''), normalize$1((s) => {
        if (typeof s !== 'string' || s.length % 2)
            throw new TypeError(`hex.decode: expected string, got ${typeof s} with length ${s.length}`);
        return s.toLowerCase();
    }));
    const CODERS = {
        utf8, hex, base16, base32, base64, base64url, base58, base58xmr
    };
`Invalid encoding type. Available types: ${Object.keys(CODERS).join(', ')}`;

    var english = {};

    Object.defineProperty(english, "__esModule", { value: true });
    var wordlist = english.wordlist = void 0;
    wordlist = english.wordlist = `abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split('\n');

    var bip39 = {};

    var _assert = {};

    Object.defineProperty(_assert, "__esModule", { value: true });
    _assert.output = _assert.exists = _assert.hash = _assert.bytes = _assert.bool = _assert.number = void 0;
    function number(n) {
        if (!Number.isSafeInteger(n) || n < 0)
            throw new Error(`Wrong positive integer: ${n}`);
    }
    _assert.number = number;
    function bool(b) {
        if (typeof b !== 'boolean')
            throw new Error(`Expected boolean, not ${b}`);
    }
    _assert.bool = bool;
    function bytes(b, ...lengths) {
        if (!(b instanceof Uint8Array))
            throw new TypeError('Expected Uint8Array');
        if (lengths.length > 0 && !lengths.includes(b.length))
            throw new TypeError(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
    }
    _assert.bytes = bytes;
    function hash(hash) {
        if (typeof hash !== 'function' || typeof hash.create !== 'function')
            throw new Error('Hash should be wrapped by utils.wrapConstructor');
        number(hash.outputLen);
        number(hash.blockLen);
    }
    _assert.hash = hash;
    function exists(instance, checkFinished = true) {
        if (instance.destroyed)
            throw new Error('Hash instance has been destroyed');
        if (checkFinished && instance.finished)
            throw new Error('Hash#digest() has already been called');
    }
    _assert.exists = exists;
    function output(out, instance) {
        bytes(out);
        const min = instance.outputLen;
        if (out.length < min) {
            throw new Error(`digestInto() expects output buffer of length at least ${min}`);
        }
    }
    _assert.output = output;
    const assert = {
        number,
        bool,
        bytes,
        hash,
        exists,
        output,
    };
    _assert.default = assert;

    var pbkdf2$1 = {};

    var hmac = {};

    var utils$2 = {};

    var crypto$1 = {};

    Object.defineProperty(crypto$1, "__esModule", { value: true });
    crypto$1.crypto = void 0;
    crypto$1.crypto = typeof globalThis === 'object' && 'crypto' in globalThis ? globalThis.crypto : undefined;

    (function (exports) {
    	/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    	Object.defineProperty(exports, "__esModule", { value: true });
    	exports.randomBytes = exports.wrapConstructorWithOpts = exports.wrapConstructor = exports.checkOpts = exports.Hash = exports.concatBytes = exports.toBytes = exports.utf8ToBytes = exports.asyncLoop = exports.nextTick = exports.hexToBytes = exports.bytesToHex = exports.isLE = exports.rotr = exports.createView = exports.u32 = exports.u8 = void 0;
    	// We use `globalThis.crypto`, but node.js versions earlier than v19 don't
    	// declare it in global scope. For node.js, package.json#exports field mapping
    	// rewrites import from `crypto` to `cryptoNode`, which imports native module.
    	// Makes the utils un-importable in browsers without a bundler.
    	// Once node.js 18 is deprecated, we can just drop the import.
    	const crypto_1 = crypto$1;
    	// Cast array to different type
    	const u8 = (arr) => new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    	exports.u8 = u8;
    	const u32 = (arr) => new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
    	exports.u32 = u32;
    	// Cast array to view
    	const createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    	exports.createView = createView;
    	// The rotate right (circular right shift) operation for uint32
    	const rotr = (word, shift) => (word << (32 - shift)) | (word >>> shift);
    	exports.rotr = rotr;
    	// big-endian hardware is rare. Just in case someone still decides to run hashes:
    	// early-throw an error because we don't support BE yet.
    	exports.isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
    	if (!exports.isLE)
    	    throw new Error('Non little-endian hardware is not supported');
    	const hexes = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
    	/**
    	 * @example bytesToHex(Uint8Array.from([0xde, 0xad, 0xbe, 0xef])) // 'deadbeef'
    	 */
    	function bytesToHex(uint8a) {
    	    // pre-caching improves the speed 6x
    	    if (!(uint8a instanceof Uint8Array))
    	        throw new Error('Uint8Array expected');
    	    let hex = '';
    	    for (let i = 0; i < uint8a.length; i++) {
    	        hex += hexes[uint8a[i]];
    	    }
    	    return hex;
    	}
    	exports.bytesToHex = bytesToHex;
    	/**
    	 * @example hexToBytes('deadbeef') // Uint8Array.from([0xde, 0xad, 0xbe, 0xef])
    	 */
    	function hexToBytes(hex) {
    	    if (typeof hex !== 'string') {
    	        throw new TypeError('hexToBytes: expected string, got ' + typeof hex);
    	    }
    	    if (hex.length % 2)
    	        throw new Error('hexToBytes: received invalid unpadded hex');
    	    const array = new Uint8Array(hex.length / 2);
    	    for (let i = 0; i < array.length; i++) {
    	        const j = i * 2;
    	        const hexByte = hex.slice(j, j + 2);
    	        const byte = Number.parseInt(hexByte, 16);
    	        if (Number.isNaN(byte) || byte < 0)
    	            throw new Error('Invalid byte sequence');
    	        array[i] = byte;
    	    }
    	    return array;
    	}
    	exports.hexToBytes = hexToBytes;
    	// There is no setImmediate in browser and setTimeout is slow.
    	// call of async fn will return Promise, which will be fullfiled only on
    	// next scheduler queue processing step and this is exactly what we need.
    	const nextTick = async () => { };
    	exports.nextTick = nextTick;
    	// Returns control to thread each 'tick' ms to avoid blocking
    	async function asyncLoop(iters, tick, cb) {
    	    let ts = Date.now();
    	    for (let i = 0; i < iters; i++) {
    	        cb(i);
    	        // Date.now() is not monotonic, so in case if clock goes backwards we return return control too
    	        const diff = Date.now() - ts;
    	        if (diff >= 0 && diff < tick)
    	            continue;
    	        await (0, exports.nextTick)();
    	        ts += diff;
    	    }
    	}
    	exports.asyncLoop = asyncLoop;
    	function utf8ToBytes(str) {
    	    if (typeof str !== 'string') {
    	        throw new TypeError(`utf8ToBytes expected string, got ${typeof str}`);
    	    }
    	    return new TextEncoder().encode(str);
    	}
    	exports.utf8ToBytes = utf8ToBytes;
    	function toBytes(data) {
    	    if (typeof data === 'string')
    	        data = utf8ToBytes(data);
    	    if (!(data instanceof Uint8Array))
    	        throw new TypeError(`Expected input type is Uint8Array (got ${typeof data})`);
    	    return data;
    	}
    	exports.toBytes = toBytes;
    	/**
    	 * Concats Uint8Array-s into one; like `Buffer.concat([buf1, buf2])`
    	 * @example concatBytes(buf1, buf2)
    	 */
    	function concatBytes(...arrays) {
    	    if (!arrays.every((a) => a instanceof Uint8Array))
    	        throw new Error('Uint8Array list expected');
    	    if (arrays.length === 1)
    	        return arrays[0];
    	    const length = arrays.reduce((a, arr) => a + arr.length, 0);
    	    const result = new Uint8Array(length);
    	    for (let i = 0, pad = 0; i < arrays.length; i++) {
    	        const arr = arrays[i];
    	        result.set(arr, pad);
    	        pad += arr.length;
    	    }
    	    return result;
    	}
    	exports.concatBytes = concatBytes;
    	// For runtime check if class implements interface
    	class Hash {
    	    // Safe version that clones internal state
    	    clone() {
    	        return this._cloneInto();
    	    }
    	}
    	exports.Hash = Hash;
    	// Check if object doens't have custom constructor (like Uint8Array/Array)
    	const isPlainObject = (obj) => Object.prototype.toString.call(obj) === '[object Object]' && obj.constructor === Object;
    	function checkOpts(defaults, opts) {
    	    if (opts !== undefined && (typeof opts !== 'object' || !isPlainObject(opts)))
    	        throw new TypeError('Options should be object or undefined');
    	    const merged = Object.assign(defaults, opts);
    	    return merged;
    	}
    	exports.checkOpts = checkOpts;
    	function wrapConstructor(hashConstructor) {
    	    const hashC = (message) => hashConstructor().update(toBytes(message)).digest();
    	    const tmp = hashConstructor();
    	    hashC.outputLen = tmp.outputLen;
    	    hashC.blockLen = tmp.blockLen;
    	    hashC.create = () => hashConstructor();
    	    return hashC;
    	}
    	exports.wrapConstructor = wrapConstructor;
    	function wrapConstructorWithOpts(hashCons) {
    	    const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
    	    const tmp = hashCons({});
    	    hashC.outputLen = tmp.outputLen;
    	    hashC.blockLen = tmp.blockLen;
    	    hashC.create = (opts) => hashCons(opts);
    	    return hashC;
    	}
    	exports.wrapConstructorWithOpts = wrapConstructorWithOpts;
    	/**
    	 * Secure PRNG. Uses `globalThis.crypto` or node.js crypto module.
    	 */
    	function randomBytes(bytesLength = 32) {
    	    if (crypto_1.crypto && typeof crypto_1.crypto.getRandomValues === 'function') {
    	        return crypto_1.crypto.getRandomValues(new Uint8Array(bytesLength));
    	    }
    	    throw new Error('crypto.getRandomValues must be defined');
    	}
    	exports.randomBytes = randomBytes;
    	
    } (utils$2));

    (function (exports) {
    	Object.defineProperty(exports, "__esModule", { value: true });
    	exports.hmac = void 0;
    	const _assert_js_1 = _assert;
    	const utils_js_1 = utils$2;
    	// HMAC (RFC 2104)
    	class HMAC extends utils_js_1.Hash {
    	    constructor(hash, _key) {
    	        super();
    	        this.finished = false;
    	        this.destroyed = false;
    	        _assert_js_1.default.hash(hash);
    	        const key = (0, utils_js_1.toBytes)(_key);
    	        this.iHash = hash.create();
    	        if (typeof this.iHash.update !== 'function')
    	            throw new TypeError('Expected instance of class which extends utils.Hash');
    	        this.blockLen = this.iHash.blockLen;
    	        this.outputLen = this.iHash.outputLen;
    	        const blockLen = this.blockLen;
    	        const pad = new Uint8Array(blockLen);
    	        // blockLen can be bigger than outputLen
    	        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    	        for (let i = 0; i < pad.length; i++)
    	            pad[i] ^= 0x36;
    	        this.iHash.update(pad);
    	        // By doing update (processing of first block) of outer hash here we can re-use it between multiple calls via clone
    	        this.oHash = hash.create();
    	        // Undo internal XOR && apply outer XOR
    	        for (let i = 0; i < pad.length; i++)
    	            pad[i] ^= 0x36 ^ 0x5c;
    	        this.oHash.update(pad);
    	        pad.fill(0);
    	    }
    	    update(buf) {
    	        _assert_js_1.default.exists(this);
    	        this.iHash.update(buf);
    	        return this;
    	    }
    	    digestInto(out) {
    	        _assert_js_1.default.exists(this);
    	        _assert_js_1.default.bytes(out, this.outputLen);
    	        this.finished = true;
    	        this.iHash.digestInto(out);
    	        this.oHash.update(out);
    	        this.oHash.digestInto(out);
    	        this.destroy();
    	    }
    	    digest() {
    	        const out = new Uint8Array(this.oHash.outputLen);
    	        this.digestInto(out);
    	        return out;
    	    }
    	    _cloneInto(to) {
    	        // Create new instance without calling constructor since key already in state and we don't know it.
    	        to || (to = Object.create(Object.getPrototypeOf(this), {}));
    	        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    	        to = to;
    	        to.finished = finished;
    	        to.destroyed = destroyed;
    	        to.blockLen = blockLen;
    	        to.outputLen = outputLen;
    	        to.oHash = oHash._cloneInto(to.oHash);
    	        to.iHash = iHash._cloneInto(to.iHash);
    	        return to;
    	    }
    	    destroy() {
    	        this.destroyed = true;
    	        this.oHash.destroy();
    	        this.iHash.destroy();
    	    }
    	}
    	/**
    	 * HMAC: RFC2104 message authentication code.
    	 * @param hash - function that would be used e.g. sha256
    	 * @param key - message key
    	 * @param message - message data
    	 */
    	const hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
    	exports.hmac = hmac;
    	exports.hmac.create = (hash, key) => new HMAC(hash, key);
    	
    } (hmac));

    Object.defineProperty(pbkdf2$1, "__esModule", { value: true });
    pbkdf2$1.pbkdf2Async = pbkdf2$1.pbkdf2 = void 0;
    const _assert_js_1$1 = _assert;
    const hmac_js_1 = hmac;
    const utils_js_1$3 = utils$2;
    // Common prologue and epilogue for sync/async functions
    function pbkdf2Init(hash, _password, _salt, _opts) {
        _assert_js_1$1.default.hash(hash);
        const opts = (0, utils_js_1$3.checkOpts)({ dkLen: 32, asyncTick: 10 }, _opts);
        const { c, dkLen, asyncTick } = opts;
        _assert_js_1$1.default.number(c);
        _assert_js_1$1.default.number(dkLen);
        _assert_js_1$1.default.number(asyncTick);
        if (c < 1)
            throw new Error('PBKDF2: iterations (c) should be >= 1');
        const password = (0, utils_js_1$3.toBytes)(_password);
        const salt = (0, utils_js_1$3.toBytes)(_salt);
        // DK = PBKDF2(PRF, Password, Salt, c, dkLen);
        const DK = new Uint8Array(dkLen);
        // U1 = PRF(Password, Salt + INT_32_BE(i))
        const PRF = hmac_js_1.hmac.create(hash, password);
        const PRFSalt = PRF._cloneInto().update(salt);
        return { c, dkLen, asyncTick, DK, PRF, PRFSalt };
    }
    function pbkdf2Output(PRF, PRFSalt, DK, prfW, u) {
        PRF.destroy();
        PRFSalt.destroy();
        if (prfW)
            prfW.destroy();
        u.fill(0);
        return DK;
    }
    /**
     * PBKDF2-HMAC: RFC 2898 key derivation function
     * @param hash - hash function that would be used e.g. sha256
     * @param password - password from which a derived key is generated
     * @param salt - cryptographic salt
     * @param opts - {c, dkLen} where c is work factor and dkLen is output message size
     */
    function pbkdf2(hash, password, salt, opts) {
        const { c, dkLen, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, opts);
        let prfW; // Working copy
        const arr = new Uint8Array(4);
        const view = (0, utils_js_1$3.createView)(arr);
        const u = new Uint8Array(PRF.outputLen);
        // DK = T1 + T2 + ⋯ + Tdklen/hlen
        for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
            // Ti = F(Password, Salt, c, i)
            const Ti = DK.subarray(pos, pos + PRF.outputLen);
            view.setInt32(0, ti, false);
            // F(Password, Salt, c, i) = U1 ^ U2 ^ ⋯ ^ Uc
            // U1 = PRF(Password, Salt + INT_32_BE(i))
            (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
            Ti.set(u.subarray(0, Ti.length));
            for (let ui = 1; ui < c; ui++) {
                // Uc = PRF(Password, Uc−1)
                PRF._cloneInto(prfW).update(u).digestInto(u);
                for (let i = 0; i < Ti.length; i++)
                    Ti[i] ^= u[i];
            }
        }
        return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
    }
    pbkdf2$1.pbkdf2 = pbkdf2;
    async function pbkdf2Async(hash, password, salt, opts) {
        const { c, dkLen, asyncTick, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, opts);
        let prfW; // Working copy
        const arr = new Uint8Array(4);
        const view = (0, utils_js_1$3.createView)(arr);
        const u = new Uint8Array(PRF.outputLen);
        // DK = T1 + T2 + ⋯ + Tdklen/hlen
        for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
            // Ti = F(Password, Salt, c, i)
            const Ti = DK.subarray(pos, pos + PRF.outputLen);
            view.setInt32(0, ti, false);
            // F(Password, Salt, c, i) = U1 ^ U2 ^ ⋯ ^ Uc
            // U1 = PRF(Password, Salt + INT_32_BE(i))
            (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
            Ti.set(u.subarray(0, Ti.length));
            await (0, utils_js_1$3.asyncLoop)(c - 1, asyncTick, (i) => {
                // Uc = PRF(Password, Uc−1)
                PRF._cloneInto(prfW).update(u).digestInto(u);
                for (let i = 0; i < Ti.length; i++)
                    Ti[i] ^= u[i];
            });
        }
        return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
    }
    pbkdf2$1.pbkdf2Async = pbkdf2Async;

    var sha256 = {};

    var _sha2 = {};

    Object.defineProperty(_sha2, "__esModule", { value: true });
    _sha2.SHA2 = void 0;
    const _assert_js_1 = _assert;
    const utils_js_1$2 = utils$2;
    // Polyfill for Safari 14
    function setBigUint64(view, byteOffset, value, isLE) {
        if (typeof view.setBigUint64 === 'function')
            return view.setBigUint64(byteOffset, value, isLE);
        const _32n = BigInt(32);
        const _u32_max = BigInt(0xffffffff);
        const wh = Number((value >> _32n) & _u32_max);
        const wl = Number(value & _u32_max);
        const h = isLE ? 4 : 0;
        const l = isLE ? 0 : 4;
        view.setUint32(byteOffset + h, wh, isLE);
        view.setUint32(byteOffset + l, wl, isLE);
    }
    // Base SHA2 class (RFC 6234)
    class SHA2 extends utils_js_1$2.Hash {
        constructor(blockLen, outputLen, padOffset, isLE) {
            super();
            this.blockLen = blockLen;
            this.outputLen = outputLen;
            this.padOffset = padOffset;
            this.isLE = isLE;
            this.finished = false;
            this.length = 0;
            this.pos = 0;
            this.destroyed = false;
            this.buffer = new Uint8Array(blockLen);
            this.view = (0, utils_js_1$2.createView)(this.buffer);
        }
        update(data) {
            _assert_js_1.default.exists(this);
            const { view, buffer, blockLen } = this;
            data = (0, utils_js_1$2.toBytes)(data);
            const len = data.length;
            for (let pos = 0; pos < len;) {
                const take = Math.min(blockLen - this.pos, len - pos);
                // Fast path: we have at least one block in input, cast it to view and process
                if (take === blockLen) {
                    const dataView = (0, utils_js_1$2.createView)(data);
                    for (; blockLen <= len - pos; pos += blockLen)
                        this.process(dataView, pos);
                    continue;
                }
                buffer.set(data.subarray(pos, pos + take), this.pos);
                this.pos += take;
                pos += take;
                if (this.pos === blockLen) {
                    this.process(view, 0);
                    this.pos = 0;
                }
            }
            this.length += data.length;
            this.roundClean();
            return this;
        }
        digestInto(out) {
            _assert_js_1.default.exists(this);
            _assert_js_1.default.output(out, this);
            this.finished = true;
            // Padding
            // We can avoid allocation of buffer for padding completely if it
            // was previously not allocated here. But it won't change performance.
            const { buffer, view, blockLen, isLE } = this;
            let { pos } = this;
            // append the bit '1' to the message
            buffer[pos++] = 0b10000000;
            this.buffer.subarray(pos).fill(0);
            // we have less than padOffset left in buffer, so we cannot put length in current block, need process it and pad again
            if (this.padOffset > blockLen - pos) {
                this.process(view, 0);
                pos = 0;
            }
            // Pad until full block byte with zeros
            for (let i = pos; i < blockLen; i++)
                buffer[i] = 0;
            // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
            // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
            // So we just write lowest 64 bits of that value.
            setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
            this.process(view, 0);
            const oview = (0, utils_js_1$2.createView)(out);
            const len = this.outputLen;
            // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
            if (len % 4)
                throw new Error('_sha2: outputLen should be aligned to 32bit');
            const outLen = len / 4;
            const state = this.get();
            if (outLen > state.length)
                throw new Error('_sha2: outputLen bigger than state');
            for (let i = 0; i < outLen; i++)
                oview.setUint32(4 * i, state[i], isLE);
        }
        digest() {
            const { buffer, outputLen } = this;
            this.digestInto(buffer);
            const res = buffer.slice(0, outputLen);
            this.destroy();
            return res;
        }
        _cloneInto(to) {
            to || (to = new this.constructor());
            to.set(...this.get());
            const { blockLen, buffer, length, finished, destroyed, pos } = this;
            to.length = length;
            to.pos = pos;
            to.finished = finished;
            to.destroyed = destroyed;
            if (length % blockLen)
                to.buffer.set(buffer);
            return to;
        }
    }
    _sha2.SHA2 = SHA2;

    Object.defineProperty(sha256, "__esModule", { value: true });
    sha256.sha224 = sha256.sha256 = void 0;
    const _sha2_js_1$1 = _sha2;
    const utils_js_1$1 = utils$2;
    // Choice: a ? b : c
    const Chi = (a, b, c) => (a & b) ^ (~a & c);
    // Majority function, true if any two inpust is true
    const Maj = (a, b, c) => (a & b) ^ (a & c) ^ (b & c);
    // Round constants:
    // first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
    // prettier-ignore
    const SHA256_K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    // Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
    // prettier-ignore
    const IV = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    // Temporary buffer, not used to store anything between runs
    // Named this way because it matches specification.
    const SHA256_W = new Uint32Array(64);
    class SHA256 extends _sha2_js_1$1.SHA2 {
        constructor() {
            super(64, 32, 8, false);
            // We cannot use array here since array allows indexing by variable
            // which means optimizer/compiler cannot use registers.
            this.A = IV[0] | 0;
            this.B = IV[1] | 0;
            this.C = IV[2] | 0;
            this.D = IV[3] | 0;
            this.E = IV[4] | 0;
            this.F = IV[5] | 0;
            this.G = IV[6] | 0;
            this.H = IV[7] | 0;
        }
        get() {
            const { A, B, C, D, E, F, G, H } = this;
            return [A, B, C, D, E, F, G, H];
        }
        // prettier-ignore
        set(A, B, C, D, E, F, G, H) {
            this.A = A | 0;
            this.B = B | 0;
            this.C = C | 0;
            this.D = D | 0;
            this.E = E | 0;
            this.F = F | 0;
            this.G = G | 0;
            this.H = H | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4)
                SHA256_W[i] = view.getUint32(offset, false);
            for (let i = 16; i < 64; i++) {
                const W15 = SHA256_W[i - 15];
                const W2 = SHA256_W[i - 2];
                const s0 = (0, utils_js_1$1.rotr)(W15, 7) ^ (0, utils_js_1$1.rotr)(W15, 18) ^ (W15 >>> 3);
                const s1 = (0, utils_js_1$1.rotr)(W2, 17) ^ (0, utils_js_1$1.rotr)(W2, 19) ^ (W2 >>> 10);
                SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
            }
            // Compression function main loop, 64 rounds
            let { A, B, C, D, E, F, G, H } = this;
            for (let i = 0; i < 64; i++) {
                const sigma1 = (0, utils_js_1$1.rotr)(E, 6) ^ (0, utils_js_1$1.rotr)(E, 11) ^ (0, utils_js_1$1.rotr)(E, 25);
                const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
                const sigma0 = (0, utils_js_1$1.rotr)(A, 2) ^ (0, utils_js_1$1.rotr)(A, 13) ^ (0, utils_js_1$1.rotr)(A, 22);
                const T2 = (sigma0 + Maj(A, B, C)) | 0;
                H = G;
                G = F;
                F = E;
                E = (D + T1) | 0;
                D = C;
                C = B;
                B = A;
                A = (T1 + T2) | 0;
            }
            // Add the compressed chunk to the current hash value
            A = (A + this.A) | 0;
            B = (B + this.B) | 0;
            C = (C + this.C) | 0;
            D = (D + this.D) | 0;
            E = (E + this.E) | 0;
            F = (F + this.F) | 0;
            G = (G + this.G) | 0;
            H = (H + this.H) | 0;
            this.set(A, B, C, D, E, F, G, H);
        }
        roundClean() {
            SHA256_W.fill(0);
        }
        destroy() {
            this.set(0, 0, 0, 0, 0, 0, 0, 0);
            this.buffer.fill(0);
        }
    }
    // Constants from https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf
    class SHA224 extends SHA256 {
        constructor() {
            super();
            this.A = 0xc1059ed8 | 0;
            this.B = 0x367cd507 | 0;
            this.C = 0x3070dd17 | 0;
            this.D = 0xf70e5939 | 0;
            this.E = 0xffc00b31 | 0;
            this.F = 0x68581511 | 0;
            this.G = 0x64f98fa7 | 0;
            this.H = 0xbefa4fa4 | 0;
            this.outputLen = 28;
        }
    }
    /**
     * SHA2-256 hash function
     * @param message - data that would be hashed
     */
    sha256.sha256 = (0, utils_js_1$1.wrapConstructor)(() => new SHA256());
    sha256.sha224 = (0, utils_js_1$1.wrapConstructor)(() => new SHA224());

    var sha512$1 = {};

    var _u64 = {};

    (function (exports) {
    	Object.defineProperty(exports, "__esModule", { value: true });
    	exports.add = exports.toBig = exports.split = exports.fromBig = void 0;
    	const U32_MASK64 = BigInt(2 ** 32 - 1);
    	const _32n = BigInt(32);
    	// We are not using BigUint64Array, because they are extremely slow as per 2022
    	function fromBig(n, le = false) {
    	    if (le)
    	        return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
    	    return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
    	}
    	exports.fromBig = fromBig;
    	function split(lst, le = false) {
    	    let Ah = new Uint32Array(lst.length);
    	    let Al = new Uint32Array(lst.length);
    	    for (let i = 0; i < lst.length; i++) {
    	        const { h, l } = fromBig(lst[i], le);
    	        [Ah[i], Al[i]] = [h, l];
    	    }
    	    return [Ah, Al];
    	}
    	exports.split = split;
    	const toBig = (h, l) => (BigInt(h >>> 0) << _32n) | BigInt(l >>> 0);
    	exports.toBig = toBig;
    	// for Shift in [0, 32)
    	const shrSH = (h, l, s) => h >>> s;
    	const shrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
    	// Right rotate for Shift in [1, 32)
    	const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
    	const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
    	// Right rotate for Shift in (32, 64), NOTE: 32 is special case.
    	const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
    	const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
    	// Right rotate for shift===32 (just swaps l&h)
    	const rotr32H = (h, l) => l;
    	const rotr32L = (h, l) => h;
    	// Left rotate for Shift in [1, 32)
    	const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
    	const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
    	// Left rotate for Shift in (32, 64), NOTE: 32 is special case.
    	const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
    	const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));
    	// JS uses 32-bit signed integers for bitwise operations which means we cannot
    	// simple take carry out of low bit sum by shift, we need to use division.
    	// Removing "export" has 5% perf penalty -_-
    	function add(Ah, Al, Bh, Bl) {
    	    const l = (Al >>> 0) + (Bl >>> 0);
    	    return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
    	}
    	exports.add = add;
    	// Addition with more than 2 elements
    	const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
    	const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;
    	const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
    	const add4H = (low, Ah, Bh, Ch, Dh) => (Ah + Bh + Ch + Dh + ((low / 2 ** 32) | 0)) | 0;
    	const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
    	const add5H = (low, Ah, Bh, Ch, Dh, Eh) => (Ah + Bh + Ch + Dh + Eh + ((low / 2 ** 32) | 0)) | 0;
    	// prettier-ignore
    	const u64 = {
    	    fromBig, split, toBig: exports.toBig,
    	    shrSH, shrSL,
    	    rotrSH, rotrSL, rotrBH, rotrBL,
    	    rotr32H, rotr32L,
    	    rotlSH, rotlSL, rotlBH, rotlBL,
    	    add, add3L, add3H, add4L, add4H, add5H, add5L,
    	};
    	exports.default = u64;
    	
    } (_u64));

    Object.defineProperty(sha512$1, "__esModule", { value: true });
    sha512$1.sha384 = sha512$1.sha512_256 = sha512$1.sha512_224 = sha512$1.sha512 = sha512$1.SHA512 = void 0;
    const _sha2_js_1 = _sha2;
    const _u64_js_1 = _u64;
    const utils_js_1 = utils$2;
    // Round contants (first 32 bits of the fractional parts of the cube roots of the first 80 primes 2..409):
    // prettier-ignore
    const [SHA512_Kh$1, SHA512_Kl$1] = _u64_js_1.default.split([
        '0x428a2f98d728ae22', '0x7137449123ef65cd', '0xb5c0fbcfec4d3b2f', '0xe9b5dba58189dbbc',
        '0x3956c25bf348b538', '0x59f111f1b605d019', '0x923f82a4af194f9b', '0xab1c5ed5da6d8118',
        '0xd807aa98a3030242', '0x12835b0145706fbe', '0x243185be4ee4b28c', '0x550c7dc3d5ffb4e2',
        '0x72be5d74f27b896f', '0x80deb1fe3b1696b1', '0x9bdc06a725c71235', '0xc19bf174cf692694',
        '0xe49b69c19ef14ad2', '0xefbe4786384f25e3', '0x0fc19dc68b8cd5b5', '0x240ca1cc77ac9c65',
        '0x2de92c6f592b0275', '0x4a7484aa6ea6e483', '0x5cb0a9dcbd41fbd4', '0x76f988da831153b5',
        '0x983e5152ee66dfab', '0xa831c66d2db43210', '0xb00327c898fb213f', '0xbf597fc7beef0ee4',
        '0xc6e00bf33da88fc2', '0xd5a79147930aa725', '0x06ca6351e003826f', '0x142929670a0e6e70',
        '0x27b70a8546d22ffc', '0x2e1b21385c26c926', '0x4d2c6dfc5ac42aed', '0x53380d139d95b3df',
        '0x650a73548baf63de', '0x766a0abb3c77b2a8', '0x81c2c92e47edaee6', '0x92722c851482353b',
        '0xa2bfe8a14cf10364', '0xa81a664bbc423001', '0xc24b8b70d0f89791', '0xc76c51a30654be30',
        '0xd192e819d6ef5218', '0xd69906245565a910', '0xf40e35855771202a', '0x106aa07032bbd1b8',
        '0x19a4c116b8d2d0c8', '0x1e376c085141ab53', '0x2748774cdf8eeb99', '0x34b0bcb5e19b48a8',
        '0x391c0cb3c5c95a63', '0x4ed8aa4ae3418acb', '0x5b9cca4f7763e373', '0x682e6ff3d6b2b8a3',
        '0x748f82ee5defb2fc', '0x78a5636f43172f60', '0x84c87814a1f0ab72', '0x8cc702081a6439ec',
        '0x90befffa23631e28', '0xa4506cebde82bde9', '0xbef9a3f7b2c67915', '0xc67178f2e372532b',
        '0xca273eceea26619c', '0xd186b8c721c0c207', '0xeada7dd6cde0eb1e', '0xf57d4f7fee6ed178',
        '0x06f067aa72176fba', '0x0a637dc5a2c898a6', '0x113f9804bef90dae', '0x1b710b35131c471b',
        '0x28db77f523047d84', '0x32caab7b40c72493', '0x3c9ebe0a15c9bebc', '0x431d67c49c100d4c',
        '0x4cc5d4becb3e42b6', '0x597f299cfc657e2a', '0x5fcb6fab3ad6faec', '0x6c44198c4a475817'
    ].map(n => BigInt(n)));
    // Temporary buffer, not used to store anything between runs
    const SHA512_W_H$1 = new Uint32Array(80);
    const SHA512_W_L$1 = new Uint32Array(80);
    let SHA512$1 = class SHA512 extends _sha2_js_1.SHA2 {
        constructor() {
            super(128, 64, 16, false);
            // We cannot use array here since array allows indexing by variable which means optimizer/compiler cannot use registers.
            // Also looks cleaner and easier to verify with spec.
            // Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x6a09e667 | 0;
            this.Al = 0xf3bcc908 | 0;
            this.Bh = 0xbb67ae85 | 0;
            this.Bl = 0x84caa73b | 0;
            this.Ch = 0x3c6ef372 | 0;
            this.Cl = 0xfe94f82b | 0;
            this.Dh = 0xa54ff53a | 0;
            this.Dl = 0x5f1d36f1 | 0;
            this.Eh = 0x510e527f | 0;
            this.El = 0xade682d1 | 0;
            this.Fh = 0x9b05688c | 0;
            this.Fl = 0x2b3e6c1f | 0;
            this.Gh = 0x1f83d9ab | 0;
            this.Gl = 0xfb41bd6b | 0;
            this.Hh = 0x5be0cd19 | 0;
            this.Hl = 0x137e2179 | 0;
        }
        // prettier-ignore
        get() {
            const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
            return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
        }
        // prettier-ignore
        set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
            this.Ah = Ah | 0;
            this.Al = Al | 0;
            this.Bh = Bh | 0;
            this.Bl = Bl | 0;
            this.Ch = Ch | 0;
            this.Cl = Cl | 0;
            this.Dh = Dh | 0;
            this.Dl = Dl | 0;
            this.Eh = Eh | 0;
            this.El = El | 0;
            this.Fh = Fh | 0;
            this.Fl = Fl | 0;
            this.Gh = Gh | 0;
            this.Gl = Gl | 0;
            this.Hh = Hh | 0;
            this.Hl = Hl | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 64 words w[16..79] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4) {
                SHA512_W_H$1[i] = view.getUint32(offset);
                SHA512_W_L$1[i] = view.getUint32((offset += 4));
            }
            for (let i = 16; i < 80; i++) {
                // s0 := (w[i-15] rightrotate 1) xor (w[i-15] rightrotate 8) xor (w[i-15] rightshift 7)
                const W15h = SHA512_W_H$1[i - 15] | 0;
                const W15l = SHA512_W_L$1[i - 15] | 0;
                const s0h = _u64_js_1.default.rotrSH(W15h, W15l, 1) ^ _u64_js_1.default.rotrSH(W15h, W15l, 8) ^ _u64_js_1.default.shrSH(W15h, W15l, 7);
                const s0l = _u64_js_1.default.rotrSL(W15h, W15l, 1) ^ _u64_js_1.default.rotrSL(W15h, W15l, 8) ^ _u64_js_1.default.shrSL(W15h, W15l, 7);
                // s1 := (w[i-2] rightrotate 19) xor (w[i-2] rightrotate 61) xor (w[i-2] rightshift 6)
                const W2h = SHA512_W_H$1[i - 2] | 0;
                const W2l = SHA512_W_L$1[i - 2] | 0;
                const s1h = _u64_js_1.default.rotrSH(W2h, W2l, 19) ^ _u64_js_1.default.rotrBH(W2h, W2l, 61) ^ _u64_js_1.default.shrSH(W2h, W2l, 6);
                const s1l = _u64_js_1.default.rotrSL(W2h, W2l, 19) ^ _u64_js_1.default.rotrBL(W2h, W2l, 61) ^ _u64_js_1.default.shrSL(W2h, W2l, 6);
                // SHA256_W[i] = s0 + s1 + SHA256_W[i - 7] + SHA256_W[i - 16];
                const SUMl = _u64_js_1.default.add4L(s0l, s1l, SHA512_W_L$1[i - 7], SHA512_W_L$1[i - 16]);
                const SUMh = _u64_js_1.default.add4H(SUMl, s0h, s1h, SHA512_W_H$1[i - 7], SHA512_W_H$1[i - 16]);
                SHA512_W_H$1[i] = SUMh | 0;
                SHA512_W_L$1[i] = SUMl | 0;
            }
            let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
            // Compression function main loop, 80 rounds
            for (let i = 0; i < 80; i++) {
                // S1 := (e rightrotate 14) xor (e rightrotate 18) xor (e rightrotate 41)
                const sigma1h = _u64_js_1.default.rotrSH(Eh, El, 14) ^ _u64_js_1.default.rotrSH(Eh, El, 18) ^ _u64_js_1.default.rotrBH(Eh, El, 41);
                const sigma1l = _u64_js_1.default.rotrSL(Eh, El, 14) ^ _u64_js_1.default.rotrSL(Eh, El, 18) ^ _u64_js_1.default.rotrBL(Eh, El, 41);
                //const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
                const CHIh = (Eh & Fh) ^ (~Eh & Gh);
                const CHIl = (El & Fl) ^ (~El & Gl);
                // T1 = H + sigma1 + Chi(E, F, G) + SHA512_K[i] + SHA512_W[i]
                // prettier-ignore
                const T1ll = _u64_js_1.default.add5L(Hl, sigma1l, CHIl, SHA512_Kl$1[i], SHA512_W_L$1[i]);
                const T1h = _u64_js_1.default.add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh$1[i], SHA512_W_H$1[i]);
                const T1l = T1ll | 0;
                // S0 := (a rightrotate 28) xor (a rightrotate 34) xor (a rightrotate 39)
                const sigma0h = _u64_js_1.default.rotrSH(Ah, Al, 28) ^ _u64_js_1.default.rotrBH(Ah, Al, 34) ^ _u64_js_1.default.rotrBH(Ah, Al, 39);
                const sigma0l = _u64_js_1.default.rotrSL(Ah, Al, 28) ^ _u64_js_1.default.rotrBL(Ah, Al, 34) ^ _u64_js_1.default.rotrBL(Ah, Al, 39);
                const MAJh = (Ah & Bh) ^ (Ah & Ch) ^ (Bh & Ch);
                const MAJl = (Al & Bl) ^ (Al & Cl) ^ (Bl & Cl);
                Hh = Gh | 0;
                Hl = Gl | 0;
                Gh = Fh | 0;
                Gl = Fl | 0;
                Fh = Eh | 0;
                Fl = El | 0;
                ({ h: Eh, l: El } = _u64_js_1.default.add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
                Dh = Ch | 0;
                Dl = Cl | 0;
                Ch = Bh | 0;
                Cl = Bl | 0;
                Bh = Ah | 0;
                Bl = Al | 0;
                const All = _u64_js_1.default.add3L(T1l, sigma0l, MAJl);
                Ah = _u64_js_1.default.add3H(All, T1h, sigma0h, MAJh);
                Al = All | 0;
            }
            // Add the compressed chunk to the current hash value
            ({ h: Ah, l: Al } = _u64_js_1.default.add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
            ({ h: Bh, l: Bl } = _u64_js_1.default.add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
            ({ h: Ch, l: Cl } = _u64_js_1.default.add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
            ({ h: Dh, l: Dl } = _u64_js_1.default.add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
            ({ h: Eh, l: El } = _u64_js_1.default.add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
            ({ h: Fh, l: Fl } = _u64_js_1.default.add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
            ({ h: Gh, l: Gl } = _u64_js_1.default.add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
            ({ h: Hh, l: Hl } = _u64_js_1.default.add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
            this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
        }
        roundClean() {
            SHA512_W_H$1.fill(0);
            SHA512_W_L$1.fill(0);
        }
        destroy() {
            this.buffer.fill(0);
            this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }
    };
    sha512$1.SHA512 = SHA512$1;
    let SHA512_224$1 = class SHA512_224 extends SHA512$1 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x8c3d37c8 | 0;
            this.Al = 0x19544da2 | 0;
            this.Bh = 0x73e19966 | 0;
            this.Bl = 0x89dcd4d6 | 0;
            this.Ch = 0x1dfab7ae | 0;
            this.Cl = 0x32ff9c82 | 0;
            this.Dh = 0x679dd514 | 0;
            this.Dl = 0x582f9fcf | 0;
            this.Eh = 0x0f6d2b69 | 0;
            this.El = 0x7bd44da8 | 0;
            this.Fh = 0x77e36f73 | 0;
            this.Fl = 0x04c48942 | 0;
            this.Gh = 0x3f9d85a8 | 0;
            this.Gl = 0x6a1d36c8 | 0;
            this.Hh = 0x1112e6ad | 0;
            this.Hl = 0x91d692a1 | 0;
            this.outputLen = 28;
        }
    };
    let SHA512_256$1 = class SHA512_256 extends SHA512$1 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x22312194 | 0;
            this.Al = 0xfc2bf72c | 0;
            this.Bh = 0x9f555fa3 | 0;
            this.Bl = 0xc84c64c2 | 0;
            this.Ch = 0x2393b86b | 0;
            this.Cl = 0x6f53b151 | 0;
            this.Dh = 0x96387719 | 0;
            this.Dl = 0x5940eabd | 0;
            this.Eh = 0x96283ee2 | 0;
            this.El = 0xa88effe3 | 0;
            this.Fh = 0xbe5e1e25 | 0;
            this.Fl = 0x53863992 | 0;
            this.Gh = 0x2b0199fc | 0;
            this.Gl = 0x2c85b8aa | 0;
            this.Hh = 0x0eb72ddc | 0;
            this.Hl = 0x81c52ca2 | 0;
            this.outputLen = 32;
        }
    };
    let SHA384$1 = class SHA384 extends SHA512$1 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0xcbbb9d5d | 0;
            this.Al = 0xc1059ed8 | 0;
            this.Bh = 0x629a292a | 0;
            this.Bl = 0x367cd507 | 0;
            this.Ch = 0x9159015a | 0;
            this.Cl = 0x3070dd17 | 0;
            this.Dh = 0x152fecd8 | 0;
            this.Dl = 0xf70e5939 | 0;
            this.Eh = 0x67332667 | 0;
            this.El = 0xffc00b31 | 0;
            this.Fh = 0x8eb44a87 | 0;
            this.Fl = 0x68581511 | 0;
            this.Gh = 0xdb0c2e0d | 0;
            this.Gl = 0x64f98fa7 | 0;
            this.Hh = 0x47b5481d | 0;
            this.Hl = 0xbefa4fa4 | 0;
            this.outputLen = 48;
        }
    };
    sha512$1.sha512 = (0, utils_js_1.wrapConstructor)(() => new SHA512$1());
    sha512$1.sha512_224 = (0, utils_js_1.wrapConstructor)(() => new SHA512_224$1());
    sha512$1.sha512_256 = (0, utils_js_1.wrapConstructor)(() => new SHA512_256$1());
    sha512$1.sha384 = (0, utils_js_1.wrapConstructor)(() => new SHA384$1());

    var lib = {};

    (function (exports) {
    	/*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
    	Object.defineProperty(exports, "__esModule", { value: true });
    	exports.bytes = exports.stringToBytes = exports.str = exports.bytesToString = exports.hex = exports.utf8 = exports.bech32m = exports.bech32 = exports.base58check = exports.base58xmr = exports.base58xrp = exports.base58flickr = exports.base58 = exports.base64url = exports.base64 = exports.base32crockford = exports.base32hex = exports.base32 = exports.base16 = exports.utils = exports.assertNumber = void 0;
    	function assertNumber(n) {
    	    if (!Number.isSafeInteger(n))
    	        throw new Error(`Wrong integer: ${n}`);
    	}
    	exports.assertNumber = assertNumber;
    	function chain(...args) {
    	    const wrap = (a, b) => (c) => a(b(c));
    	    const encode = Array.from(args)
    	        .reverse()
    	        .reduce((acc, i) => (acc ? wrap(acc, i.encode) : i.encode), undefined);
    	    const decode = args.reduce((acc, i) => (acc ? wrap(acc, i.decode) : i.decode), undefined);
    	    return { encode, decode };
    	}
    	function alphabet(alphabet) {
    	    return {
    	        encode: (digits) => {
    	            if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
    	                throw new Error('alphabet.encode input should be an array of numbers');
    	            return digits.map((i) => {
    	                assertNumber(i);
    	                if (i < 0 || i >= alphabet.length)
    	                    throw new Error(`Digit index outside alphabet: ${i} (alphabet: ${alphabet.length})`);
    	                return alphabet[i];
    	            });
    	        },
    	        decode: (input) => {
    	            if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string'))
    	                throw new Error('alphabet.decode input should be array of strings');
    	            return input.map((letter) => {
    	                if (typeof letter !== 'string')
    	                    throw new Error(`alphabet.decode: not string element=${letter}`);
    	                const index = alphabet.indexOf(letter);
    	                if (index === -1)
    	                    throw new Error(`Unknown letter: "${letter}". Allowed: ${alphabet}`);
    	                return index;
    	            });
    	        },
    	    };
    	}
    	function join(separator = '') {
    	    if (typeof separator !== 'string')
    	        throw new Error('join separator should be string');
    	    return {
    	        encode: (from) => {
    	            if (!Array.isArray(from) || (from.length && typeof from[0] !== 'string'))
    	                throw new Error('join.encode input should be array of strings');
    	            for (let i of from)
    	                if (typeof i !== 'string')
    	                    throw new Error(`join.encode: non-string input=${i}`);
    	            return from.join(separator);
    	        },
    	        decode: (to) => {
    	            if (typeof to !== 'string')
    	                throw new Error('join.decode input should be string');
    	            return to.split(separator);
    	        },
    	    };
    	}
    	function padding(bits, chr = '=') {
    	    assertNumber(bits);
    	    if (typeof chr !== 'string')
    	        throw new Error('padding chr should be string');
    	    return {
    	        encode(data) {
    	            if (!Array.isArray(data) || (data.length && typeof data[0] !== 'string'))
    	                throw new Error('padding.encode input should be array of strings');
    	            for (let i of data)
    	                if (typeof i !== 'string')
    	                    throw new Error(`padding.encode: non-string input=${i}`);
    	            while ((data.length * bits) % 8)
    	                data.push(chr);
    	            return data;
    	        },
    	        decode(input) {
    	            if (!Array.isArray(input) || (input.length && typeof input[0] !== 'string'))
    	                throw new Error('padding.encode input should be array of strings');
    	            for (let i of input)
    	                if (typeof i !== 'string')
    	                    throw new Error(`padding.decode: non-string input=${i}`);
    	            let end = input.length;
    	            if ((end * bits) % 8)
    	                throw new Error('Invalid padding: string should have whole number of bytes');
    	            for (; end > 0 && input[end - 1] === chr; end--) {
    	                if (!(((end - 1) * bits) % 8))
    	                    throw new Error('Invalid padding: string has too much padding');
    	            }
    	            return input.slice(0, end);
    	        },
    	    };
    	}
    	function normalize(fn) {
    	    if (typeof fn !== 'function')
    	        throw new Error('normalize fn should be function');
    	    return { encode: (from) => from, decode: (to) => fn(to) };
    	}
    	function convertRadix(data, from, to) {
    	    if (from < 2)
    	        throw new Error(`convertRadix: wrong from=${from}, base cannot be less than 2`);
    	    if (to < 2)
    	        throw new Error(`convertRadix: wrong to=${to}, base cannot be less than 2`);
    	    if (!Array.isArray(data))
    	        throw new Error('convertRadix: data should be array');
    	    if (!data.length)
    	        return [];
    	    let pos = 0;
    	    const res = [];
    	    const digits = Array.from(data);
    	    digits.forEach((d) => {
    	        assertNumber(d);
    	        if (d < 0 || d >= from)
    	            throw new Error(`Wrong integer: ${d}`);
    	    });
    	    while (true) {
    	        let carry = 0;
    	        let done = true;
    	        for (let i = pos; i < digits.length; i++) {
    	            const digit = digits[i];
    	            const digitBase = from * carry + digit;
    	            if (!Number.isSafeInteger(digitBase) ||
    	                (from * carry) / from !== carry ||
    	                digitBase - digit !== from * carry) {
    	                throw new Error('convertRadix: carry overflow');
    	            }
    	            carry = digitBase % to;
    	            digits[i] = Math.floor(digitBase / to);
    	            if (!Number.isSafeInteger(digits[i]) || digits[i] * to + carry !== digitBase)
    	                throw new Error('convertRadix: carry overflow');
    	            if (!done)
    	                continue;
    	            else if (!digits[i])
    	                pos = i;
    	            else
    	                done = false;
    	        }
    	        res.push(carry);
    	        if (done)
    	            break;
    	    }
    	    for (let i = 0; i < data.length - 1 && data[i] === 0; i++)
    	        res.push(0);
    	    return res.reverse();
    	}
    	const gcd = (a, b) => (!b ? a : gcd(b, a % b));
    	const radix2carry = (from, to) => from + (to - gcd(from, to));
    	function convertRadix2(data, from, to, padding) {
    	    if (!Array.isArray(data))
    	        throw new Error('convertRadix2: data should be array');
    	    if (from <= 0 || from > 32)
    	        throw new Error(`convertRadix2: wrong from=${from}`);
    	    if (to <= 0 || to > 32)
    	        throw new Error(`convertRadix2: wrong to=${to}`);
    	    if (radix2carry(from, to) > 32) {
    	        throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${radix2carry(from, to)}`);
    	    }
    	    let carry = 0;
    	    let pos = 0;
    	    const mask = 2 ** to - 1;
    	    const res = [];
    	    for (const n of data) {
    	        assertNumber(n);
    	        if (n >= 2 ** from)
    	            throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
    	        carry = (carry << from) | n;
    	        if (pos + from > 32)
    	            throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
    	        pos += from;
    	        for (; pos >= to; pos -= to)
    	            res.push(((carry >> (pos - to)) & mask) >>> 0);
    	        carry &= 2 ** pos - 1;
    	    }
    	    carry = (carry << (to - pos)) & mask;
    	    if (!padding && pos >= from)
    	        throw new Error('Excess padding');
    	    if (!padding && carry)
    	        throw new Error(`Non-zero padding: ${carry}`);
    	    if (padding && pos > 0)
    	        res.push(carry >>> 0);
    	    return res;
    	}
    	function radix(num) {
    	    assertNumber(num);
    	    return {
    	        encode: (bytes) => {
    	            if (!(bytes instanceof Uint8Array))
    	                throw new Error('radix.encode input should be Uint8Array');
    	            return convertRadix(Array.from(bytes), 2 ** 8, num);
    	        },
    	        decode: (digits) => {
    	            if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
    	                throw new Error('radix.decode input should be array of strings');
    	            return Uint8Array.from(convertRadix(digits, num, 2 ** 8));
    	        },
    	    };
    	}
    	function radix2(bits, revPadding = false) {
    	    assertNumber(bits);
    	    if (bits <= 0 || bits > 32)
    	        throw new Error('radix2: bits should be in (0..32]');
    	    if (radix2carry(8, bits) > 32 || radix2carry(bits, 8) > 32)
    	        throw new Error('radix2: carry overflow');
    	    return {
    	        encode: (bytes) => {
    	            if (!(bytes instanceof Uint8Array))
    	                throw new Error('radix2.encode input should be Uint8Array');
    	            return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
    	        },
    	        decode: (digits) => {
    	            if (!Array.isArray(digits) || (digits.length && typeof digits[0] !== 'number'))
    	                throw new Error('radix2.decode input should be array of strings');
    	            return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
    	        },
    	    };
    	}
    	function unsafeWrapper(fn) {
    	    if (typeof fn !== 'function')
    	        throw new Error('unsafeWrapper fn should be function');
    	    return function (...args) {
    	        try {
    	            return fn.apply(null, args);
    	        }
    	        catch (e) { }
    	    };
    	}
    	function checksum(len, fn) {
    	    assertNumber(len);
    	    if (typeof fn !== 'function')
    	        throw new Error('checksum fn should be function');
    	    return {
    	        encode(data) {
    	            if (!(data instanceof Uint8Array))
    	                throw new Error('checksum.encode: input should be Uint8Array');
    	            const checksum = fn(data).slice(0, len);
    	            const res = new Uint8Array(data.length + len);
    	            res.set(data);
    	            res.set(checksum, data.length);
    	            return res;
    	        },
    	        decode(data) {
    	            if (!(data instanceof Uint8Array))
    	                throw new Error('checksum.decode: input should be Uint8Array');
    	            const payload = data.slice(0, -len);
    	            const newChecksum = fn(payload).slice(0, len);
    	            const oldChecksum = data.slice(-len);
    	            for (let i = 0; i < len; i++)
    	                if (newChecksum[i] !== oldChecksum[i])
    	                    throw new Error('Invalid checksum');
    	            return payload;
    	        },
    	    };
    	}
    	exports.utils = { alphabet, chain, checksum, radix, radix2, join, padding };
    	exports.base16 = chain(radix2(4), alphabet('0123456789ABCDEF'), join(''));
    	exports.base32 = chain(radix2(5), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'), padding(5), join(''));
    	exports.base32hex = chain(radix2(5), alphabet('0123456789ABCDEFGHIJKLMNOPQRSTUV'), padding(5), join(''));
    	exports.base32crockford = chain(radix2(5), alphabet('0123456789ABCDEFGHJKMNPQRSTVWXYZ'), join(''), normalize((s) => s.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')));
    	exports.base64 = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'), padding(6), join(''));
    	exports.base64url = chain(radix2(6), alphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'), padding(6), join(''));
    	const genBase58 = (abc) => chain(radix(58), alphabet(abc), join(''));
    	exports.base58 = genBase58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');
    	exports.base58flickr = genBase58('123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ');
    	exports.base58xrp = genBase58('rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz');
    	const XMR_BLOCK_LEN = [0, 2, 3, 5, 6, 7, 9, 10, 11];
    	exports.base58xmr = {
    	    encode(data) {
    	        let res = '';
    	        for (let i = 0; i < data.length; i += 8) {
    	            const block = data.subarray(i, i + 8);
    	            res += exports.base58.encode(block).padStart(XMR_BLOCK_LEN[block.length], '1');
    	        }
    	        return res;
    	    },
    	    decode(str) {
    	        let res = [];
    	        for (let i = 0; i < str.length; i += 11) {
    	            const slice = str.slice(i, i + 11);
    	            const blockLen = XMR_BLOCK_LEN.indexOf(slice.length);
    	            const block = exports.base58.decode(slice);
    	            for (let j = 0; j < block.length - blockLen; j++) {
    	                if (block[j] !== 0)
    	                    throw new Error('base58xmr: wrong padding');
    	            }
    	            res = res.concat(Array.from(block.slice(block.length - blockLen)));
    	        }
    	        return Uint8Array.from(res);
    	    },
    	};
    	const base58check = (sha256) => chain(checksum(4, (data) => sha256(sha256(data))), exports.base58);
    	exports.base58check = base58check;
    	const BECH_ALPHABET = chain(alphabet('qpzry9x8gf2tvdw0s3jn54khce6mua7l'), join(''));
    	const POLYMOD_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    	function bech32Polymod(pre) {
    	    const b = pre >> 25;
    	    let chk = (pre & 0x1ffffff) << 5;
    	    for (let i = 0; i < POLYMOD_GENERATORS.length; i++) {
    	        if (((b >> i) & 1) === 1)
    	            chk ^= POLYMOD_GENERATORS[i];
    	    }
    	    return chk;
    	}
    	function bechChecksum(prefix, words, encodingConst = 1) {
    	    const len = prefix.length;
    	    let chk = 1;
    	    for (let i = 0; i < len; i++) {
    	        const c = prefix.charCodeAt(i);
    	        if (c < 33 || c > 126)
    	            throw new Error(`Invalid prefix (${prefix})`);
    	        chk = bech32Polymod(chk) ^ (c >> 5);
    	    }
    	    chk = bech32Polymod(chk);
    	    for (let i = 0; i < len; i++)
    	        chk = bech32Polymod(chk) ^ (prefix.charCodeAt(i) & 0x1f);
    	    for (let v of words)
    	        chk = bech32Polymod(chk) ^ v;
    	    for (let i = 0; i < 6; i++)
    	        chk = bech32Polymod(chk);
    	    chk ^= encodingConst;
    	    return BECH_ALPHABET.encode(convertRadix2([chk % 2 ** 30], 30, 5, false));
    	}
    	function genBech32(encoding) {
    	    const ENCODING_CONST = encoding === 'bech32' ? 1 : 0x2bc830a3;
    	    const _words = radix2(5);
    	    const fromWords = _words.decode;
    	    const toWords = _words.encode;
    	    const fromWordsUnsafe = unsafeWrapper(fromWords);
    	    function encode(prefix, words, limit = 90) {
    	        if (typeof prefix !== 'string')
    	            throw new Error(`bech32.encode prefix should be string, not ${typeof prefix}`);
    	        if (!Array.isArray(words) || (words.length && typeof words[0] !== 'number'))
    	            throw new Error(`bech32.encode words should be array of numbers, not ${typeof words}`);
    	        const actualLength = prefix.length + 7 + words.length;
    	        if (limit !== false && actualLength > limit)
    	            throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
    	        prefix = prefix.toLowerCase();
    	        return `${prefix}1${BECH_ALPHABET.encode(words)}${bechChecksum(prefix, words, ENCODING_CONST)}`;
    	    }
    	    function decode(str, limit = 90) {
    	        if (typeof str !== 'string')
    	            throw new Error(`bech32.decode input should be string, not ${typeof str}`);
    	        if (str.length < 8 || (limit !== false && str.length > limit))
    	            throw new TypeError(`Wrong string length: ${str.length} (${str}). Expected (8..${limit})`);
    	        const lowered = str.toLowerCase();
    	        if (str !== lowered && str !== str.toUpperCase())
    	            throw new Error(`String must be lowercase or uppercase`);
    	        str = lowered;
    	        const sepIndex = str.lastIndexOf('1');
    	        if (sepIndex === 0 || sepIndex === -1)
    	            throw new Error(`Letter "1" must be present between prefix and data only`);
    	        const prefix = str.slice(0, sepIndex);
    	        const _words = str.slice(sepIndex + 1);
    	        if (_words.length < 6)
    	            throw new Error('Data must be at least 6 characters long');
    	        const words = BECH_ALPHABET.decode(_words).slice(0, -6);
    	        const sum = bechChecksum(prefix, words, ENCODING_CONST);
    	        if (!_words.endsWith(sum))
    	            throw new Error(`Invalid checksum in ${str}: expected "${sum}"`);
    	        return { prefix, words };
    	    }
    	    const decodeUnsafe = unsafeWrapper(decode);
    	    function decodeToBytes(str) {
    	        const { prefix, words } = decode(str, false);
    	        return { prefix, words, bytes: fromWords(words) };
    	    }
    	    return { encode, decode, decodeToBytes, decodeUnsafe, fromWords, fromWordsUnsafe, toWords };
    	}
    	exports.bech32 = genBech32('bech32');
    	exports.bech32m = genBech32('bech32m');
    	exports.utf8 = {
    	    encode: (data) => new TextDecoder().decode(data),
    	    decode: (str) => new TextEncoder().encode(str),
    	};
    	exports.hex = chain(radix2(4), alphabet('0123456789abcdef'), join(''), normalize((s) => {
    	    if (typeof s !== 'string' || s.length % 2)
    	        throw new TypeError(`hex.decode: expected string, got ${typeof s} with length ${s.length}`);
    	    return s.toLowerCase();
    	}));
    	const CODERS = {
    	    utf8: exports.utf8, hex: exports.hex, base16: exports.base16, base32: exports.base32, base64: exports.base64, base64url: exports.base64url, base58: exports.base58, base58xmr: exports.base58xmr
    	};
    	const coderTypeError = `Invalid encoding type. Available types: ${Object.keys(CODERS).join(', ')}`;
    	const bytesToString = (type, bytes) => {
    	    if (typeof type !== 'string' || !CODERS.hasOwnProperty(type))
    	        throw new TypeError(coderTypeError);
    	    if (!(bytes instanceof Uint8Array))
    	        throw new TypeError('bytesToString() expects Uint8Array');
    	    return CODERS[type].encode(bytes);
    	};
    	exports.bytesToString = bytesToString;
    	exports.str = exports.bytesToString;
    	const stringToBytes = (type, str) => {
    	    if (!CODERS.hasOwnProperty(type))
    	        throw new TypeError(coderTypeError);
    	    if (typeof str !== 'string')
    	        throw new TypeError('stringToBytes() expects string');
    	    return CODERS[type].decode(str);
    	};
    	exports.stringToBytes = stringToBytes;
    	exports.bytes = exports.stringToBytes; 
    } (lib));

    Object.defineProperty(bip39, "__esModule", { value: true });
    var mnemonicToSeedSync_1 = bip39.mnemonicToSeedSync = bip39.mnemonicToSeed = validateMnemonic_1 = bip39.validateMnemonic = bip39.entropyToMnemonic = bip39.mnemonicToEntropy = generateMnemonic_1 = bip39.generateMnemonic = void 0;
    /*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
    const _assert_1 = _assert;
    const pbkdf2_1 = pbkdf2$1;
    const sha256_1 = sha256;
    const sha512_1 = sha512$1;
    const utils_1 = utils$2;
    const base_1 = lib;
    // Japanese wordlist
    const isJapanese = (wordlist) => wordlist[0] === '\u3042\u3044\u3053\u304f\u3057\u3093';
    // Normalization replaces equivalent sequences of characters
    // so that any two texts that are equivalent will be reduced
    // to the same sequence of code points, called the normal form of the original text.
    function nfkd(str) {
        if (typeof str !== 'string')
            throw new TypeError(`Invalid mnemonic type: ${typeof str}`);
        return str.normalize('NFKD');
    }
    function normalize(str) {
        const norm = nfkd(str);
        const words = norm.split(' ');
        if (![12, 15, 18, 21, 24].includes(words.length))
            throw new Error('Invalid mnemonic');
        return { nfkd: norm, words };
    }
    function assertEntropy(entropy) {
        _assert_1.default.bytes(entropy, 16, 20, 24, 28, 32);
    }
    /**
     * Generate x random words. Uses Cryptographically-Secure Random Number Generator.
     * @param wordlist imported wordlist for specific language
     * @param strength mnemonic strength 128-256 bits
     * @example
     * generateMnemonic(wordlist, 128)
     * // 'legal winner thank year wave sausage worth useful legal winner thank yellow'
     */
    function generateMnemonic(wordlist, strength = 128) {
        _assert_1.default.number(strength);
        if (strength % 32 !== 0 || strength > 256)
            throw new TypeError('Invalid entropy');
        return entropyToMnemonic((0, utils_1.randomBytes)(strength / 8), wordlist);
    }
    var generateMnemonic_1 = bip39.generateMnemonic = generateMnemonic;
    const calcChecksum = (entropy) => {
        // Checksum is ent.length/4 bits long
        const bitsLeft = 8 - entropy.length / 4;
        // Zero rightmost "bitsLeft" bits in byte
        // For example: bitsLeft=4 val=10111101 -> 10110000
        return new Uint8Array([((0, sha256_1.sha256)(entropy)[0] >> bitsLeft) << bitsLeft]);
    };
    function getCoder(wordlist) {
        if (!Array.isArray(wordlist) || wordlist.length !== 2048 || typeof wordlist[0] !== 'string')
            throw new Error('Worlist: expected array of 2048 strings');
        wordlist.forEach((i) => {
            if (typeof i !== 'string')
                throw new Error(`Wordlist: non-string element: ${i}`);
        });
        return base_1.utils.chain(base_1.utils.checksum(1, calcChecksum), base_1.utils.radix2(11, true), base_1.utils.alphabet(wordlist));
    }
    /**
     * Reversible: Converts mnemonic string to raw entropy in form of byte array.
     * @param mnemonic 12-24 words
     * @param wordlist imported wordlist for specific language
     * @example
     * const mnem = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
     * mnemonicToEntropy(mnem, wordlist)
     * // Produces
     * new Uint8Array([
     *   0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f,
     *   0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f
     * ])
     */
    function mnemonicToEntropy(mnemonic, wordlist) {
        const { words } = normalize(mnemonic);
        const entropy = getCoder(wordlist).decode(words);
        assertEntropy(entropy);
        return entropy;
    }
    bip39.mnemonicToEntropy = mnemonicToEntropy;
    /**
     * Reversible: Converts raw entropy in form of byte array to mnemonic string.
     * @param entropy byte array
     * @param wordlist imported wordlist for specific language
     * @returns 12-24 words
     * @example
     * const ent = new Uint8Array([
     *   0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f,
     *   0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f
     * ]);
     * entropyToMnemonic(ent, wordlist);
     * // 'legal winner thank year wave sausage worth useful legal winner thank yellow'
     */
    function entropyToMnemonic(entropy, wordlist) {
        assertEntropy(entropy);
        const words = getCoder(wordlist).encode(entropy);
        return words.join(isJapanese(wordlist) ? '\u3000' : ' ');
    }
    bip39.entropyToMnemonic = entropyToMnemonic;
    /**
     * Validates mnemonic for being 12-24 words contained in `wordlist`.
     */
    function validateMnemonic(mnemonic, wordlist) {
        try {
            mnemonicToEntropy(mnemonic, wordlist);
        }
        catch (e) {
            return false;
        }
        return true;
    }
    var validateMnemonic_1 = bip39.validateMnemonic = validateMnemonic;
    const salt = (passphrase) => nfkd(`mnemonic${passphrase}`);
    /**
     * Irreversible: Uses KDF to derive 64 bytes of key data from mnemonic + optional password.
     * @param mnemonic 12-24 words
     * @param passphrase string that will additionally protect the key
     * @returns 64 bytes of key data
     * @example
     * const mnem = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
     * await mnemonicToSeed(mnem, 'password');
     * // new Uint8Array([...64 bytes])
     */
    function mnemonicToSeed(mnemonic, passphrase = '') {
        return (0, pbkdf2_1.pbkdf2Async)(sha512_1.sha512, normalize(mnemonic).nfkd, salt(passphrase), { c: 2048, dkLen: 64 });
    }
    bip39.mnemonicToSeed = mnemonicToSeed;
    /**
     * Irreversible: Uses KDF to derive 64 bytes of key data from mnemonic + optional password.
     * @param mnemonic 12-24 words
     * @param passphrase string that will additionally protect the key
     * @returns 64 bytes of key data
     * @example
     * const mnem = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
     * mnemonicToSeedSync(mnem, 'password');
     * // new Uint8Array([...64 bytes])
     */
    function mnemonicToSeedSync(mnemonic, passphrase = '') {
        return (0, pbkdf2_1.pbkdf2)(sha512_1.sha512, normalize(mnemonic).nfkd, salt(passphrase), { c: 2048, dkLen: 64 });
    }
    mnemonicToSeedSync_1 = bip39.mnemonicToSeedSync = mnemonicToSeedSync;

    // https://homes.esat.kuleuven.be/~bosselae/ripemd160.html
    // https://homes.esat.kuleuven.be/~bosselae/ripemd160/pdf/AB-9601/AB-9601.pdf
    const Rho = new Uint8Array([7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8]);
    const Id = Uint8Array.from({ length: 16 }, (_, i) => i);
    const Pi = Id.map((i) => (9 * i + 5) % 16);
    let idxL = [Id];
    let idxR = [Pi];
    for (let i = 0; i < 4; i++)
        for (let j of [idxL, idxR])
            j.push(j[i].map((k) => Rho[k]));
    const shifts = [
        [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
        [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
        [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
        [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
        [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5],
    ].map((i) => new Uint8Array(i));
    const shiftsL = idxL.map((idx, i) => idx.map((j) => shifts[i][j]));
    const shiftsR = idxR.map((idx, i) => idx.map((j) => shifts[i][j]));
    const Kl = new Uint32Array([0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e]);
    const Kr = new Uint32Array([0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000]);
    // The rotate left (circular left shift) operation for uint32
    const rotl = (word, shift) => (word << shift) | (word >>> (32 - shift));
    // It's called f() in spec.
    function f(group, x, y, z) {
        if (group === 0)
            return x ^ y ^ z;
        else if (group === 1)
            return (x & y) | (~x & z);
        else if (group === 2)
            return (x | ~y) ^ z;
        else if (group === 3)
            return (x & z) | (y & ~z);
        else
            return x ^ (y | ~z);
    }
    // Temporary buffer, not used to store anything between runs
    const BUF = new Uint32Array(16);
    class RIPEMD160 extends SHA2$1 {
        constructor() {
            super(64, 20, 8, true);
            this.h0 = 0x67452301 | 0;
            this.h1 = 0xefcdab89 | 0;
            this.h2 = 0x98badcfe | 0;
            this.h3 = 0x10325476 | 0;
            this.h4 = 0xc3d2e1f0 | 0;
        }
        get() {
            const { h0, h1, h2, h3, h4 } = this;
            return [h0, h1, h2, h3, h4];
        }
        set(h0, h1, h2, h3, h4) {
            this.h0 = h0 | 0;
            this.h1 = h1 | 0;
            this.h2 = h2 | 0;
            this.h3 = h3 | 0;
            this.h4 = h4 | 0;
        }
        process(view, offset) {
            for (let i = 0; i < 16; i++, offset += 4)
                BUF[i] = view.getUint32(offset, true);
            // prettier-ignore
            let al = this.h0 | 0, ar = al, bl = this.h1 | 0, br = bl, cl = this.h2 | 0, cr = cl, dl = this.h3 | 0, dr = dl, el = this.h4 | 0, er = el;
            // Instead of iterating 0 to 80, we split it into 5 groups
            // And use the groups in constants, functions, etc. Much simpler
            for (let group = 0; group < 5; group++) {
                const rGroup = 4 - group;
                const hbl = Kl[group], hbr = Kr[group]; // prettier-ignore
                const rl = idxL[group], rr = idxR[group]; // prettier-ignore
                const sl = shiftsL[group], sr = shiftsR[group]; // prettier-ignore
                for (let i = 0; i < 16; i++) {
                    const tl = (rotl(al + f(group, bl, cl, dl) + BUF[rl[i]] + hbl, sl[i]) + el) | 0;
                    al = el, el = dl, dl = rotl(cl, 10) | 0, cl = bl, bl = tl; // prettier-ignore
                }
                // 2 loops are 10% faster
                for (let i = 0; i < 16; i++) {
                    const tr = (rotl(ar + f(rGroup, br, cr, dr) + BUF[rr[i]] + hbr, sr[i]) + er) | 0;
                    ar = er, er = dr, dr = rotl(cr, 10) | 0, cr = br, br = tr; // prettier-ignore
                }
            }
            // Add the compressed chunk to the current hash value
            this.set((this.h1 + cl + dr) | 0, (this.h2 + dl + er) | 0, (this.h3 + el + ar) | 0, (this.h4 + al + br) | 0, (this.h0 + bl + cr) | 0);
        }
        roundClean() {
            BUF.fill(0);
        }
        destroy() {
            this.destroyed = true;
            this.buffer.fill(0);
            this.set(0, 0, 0, 0, 0);
        }
    }
    /**
     * RIPEMD-160 - a hash function from 1990s.
     * @param message - msg that would be hashed
     */
    const ripemd160 = wrapConstructor(() => new RIPEMD160());

    const U32_MASK64 = BigInt(2 ** 32 - 1);
    const _32n = BigInt(32);
    // We are not using BigUint64Array, because they are extremely slow as per 2022
    function fromBig(n, le = false) {
        if (le)
            return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
        return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
    }
    function split(lst, le = false) {
        let Ah = new Uint32Array(lst.length);
        let Al = new Uint32Array(lst.length);
        for (let i = 0; i < lst.length; i++) {
            const { h, l } = fromBig(lst[i], le);
            [Ah[i], Al[i]] = [h, l];
        }
        return [Ah, Al];
    }
    const toBig = (h, l) => (BigInt(h >>> 0) << _32n) | BigInt(l >>> 0);
    // for Shift in [0, 32)
    const shrSH = (h, l, s) => h >>> s;
    const shrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
    // Right rotate for Shift in [1, 32)
    const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
    const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
    // Right rotate for Shift in (32, 64), NOTE: 32 is special case.
    const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
    const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
    // Right rotate for shift===32 (just swaps l&h)
    const rotr32H = (h, l) => l;
    const rotr32L = (h, l) => h;
    // Left rotate for Shift in [1, 32)
    const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
    const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
    // Left rotate for Shift in (32, 64), NOTE: 32 is special case.
    const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
    const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));
    // JS uses 32-bit signed integers for bitwise operations which means we cannot
    // simple take carry out of low bit sum by shift, we need to use division.
    // Removing "export" has 5% perf penalty -_-
    function add(Ah, Al, Bh, Bl) {
        const l = (Al >>> 0) + (Bl >>> 0);
        return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
    }
    // Addition with more than 2 elements
    const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
    const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;
    const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
    const add4H = (low, Ah, Bh, Ch, Dh) => (Ah + Bh + Ch + Dh + ((low / 2 ** 32) | 0)) | 0;
    const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
    const add5H = (low, Ah, Bh, Ch, Dh, Eh) => (Ah + Bh + Ch + Dh + Eh + ((low / 2 ** 32) | 0)) | 0;
    // prettier-ignore
    const u64 = {
        fromBig, split, toBig,
        shrSH, shrSL,
        rotrSH, rotrSL, rotrBH, rotrBL,
        rotr32H, rotr32L,
        rotlSH, rotlSL, rotlBH, rotlBL,
        add, add3L, add3H, add4L, add4H, add5H, add5L,
    };

    // Round contants (first 32 bits of the fractional parts of the cube roots of the first 80 primes 2..409):
    // prettier-ignore
    const [SHA512_Kh, SHA512_Kl] = u64.split([
        '0x428a2f98d728ae22', '0x7137449123ef65cd', '0xb5c0fbcfec4d3b2f', '0xe9b5dba58189dbbc',
        '0x3956c25bf348b538', '0x59f111f1b605d019', '0x923f82a4af194f9b', '0xab1c5ed5da6d8118',
        '0xd807aa98a3030242', '0x12835b0145706fbe', '0x243185be4ee4b28c', '0x550c7dc3d5ffb4e2',
        '0x72be5d74f27b896f', '0x80deb1fe3b1696b1', '0x9bdc06a725c71235', '0xc19bf174cf692694',
        '0xe49b69c19ef14ad2', '0xefbe4786384f25e3', '0x0fc19dc68b8cd5b5', '0x240ca1cc77ac9c65',
        '0x2de92c6f592b0275', '0x4a7484aa6ea6e483', '0x5cb0a9dcbd41fbd4', '0x76f988da831153b5',
        '0x983e5152ee66dfab', '0xa831c66d2db43210', '0xb00327c898fb213f', '0xbf597fc7beef0ee4',
        '0xc6e00bf33da88fc2', '0xd5a79147930aa725', '0x06ca6351e003826f', '0x142929670a0e6e70',
        '0x27b70a8546d22ffc', '0x2e1b21385c26c926', '0x4d2c6dfc5ac42aed', '0x53380d139d95b3df',
        '0x650a73548baf63de', '0x766a0abb3c77b2a8', '0x81c2c92e47edaee6', '0x92722c851482353b',
        '0xa2bfe8a14cf10364', '0xa81a664bbc423001', '0xc24b8b70d0f89791', '0xc76c51a30654be30',
        '0xd192e819d6ef5218', '0xd69906245565a910', '0xf40e35855771202a', '0x106aa07032bbd1b8',
        '0x19a4c116b8d2d0c8', '0x1e376c085141ab53', '0x2748774cdf8eeb99', '0x34b0bcb5e19b48a8',
        '0x391c0cb3c5c95a63', '0x4ed8aa4ae3418acb', '0x5b9cca4f7763e373', '0x682e6ff3d6b2b8a3',
        '0x748f82ee5defb2fc', '0x78a5636f43172f60', '0x84c87814a1f0ab72', '0x8cc702081a6439ec',
        '0x90befffa23631e28', '0xa4506cebde82bde9', '0xbef9a3f7b2c67915', '0xc67178f2e372532b',
        '0xca273eceea26619c', '0xd186b8c721c0c207', '0xeada7dd6cde0eb1e', '0xf57d4f7fee6ed178',
        '0x06f067aa72176fba', '0x0a637dc5a2c898a6', '0x113f9804bef90dae', '0x1b710b35131c471b',
        '0x28db77f523047d84', '0x32caab7b40c72493', '0x3c9ebe0a15c9bebc', '0x431d67c49c100d4c',
        '0x4cc5d4becb3e42b6', '0x597f299cfc657e2a', '0x5fcb6fab3ad6faec', '0x6c44198c4a475817'
    ].map(n => BigInt(n)));
    // Temporary buffer, not used to store anything between runs
    const SHA512_W_H = new Uint32Array(80);
    const SHA512_W_L = new Uint32Array(80);
    class SHA512 extends SHA2$1 {
        constructor() {
            super(128, 64, 16, false);
            // We cannot use array here since array allows indexing by variable which means optimizer/compiler cannot use registers.
            // Also looks cleaner and easier to verify with spec.
            // Initial state (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19):
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x6a09e667 | 0;
            this.Al = 0xf3bcc908 | 0;
            this.Bh = 0xbb67ae85 | 0;
            this.Bl = 0x84caa73b | 0;
            this.Ch = 0x3c6ef372 | 0;
            this.Cl = 0xfe94f82b | 0;
            this.Dh = 0xa54ff53a | 0;
            this.Dl = 0x5f1d36f1 | 0;
            this.Eh = 0x510e527f | 0;
            this.El = 0xade682d1 | 0;
            this.Fh = 0x9b05688c | 0;
            this.Fl = 0x2b3e6c1f | 0;
            this.Gh = 0x1f83d9ab | 0;
            this.Gl = 0xfb41bd6b | 0;
            this.Hh = 0x5be0cd19 | 0;
            this.Hl = 0x137e2179 | 0;
        }
        // prettier-ignore
        get() {
            const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
            return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
        }
        // prettier-ignore
        set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
            this.Ah = Ah | 0;
            this.Al = Al | 0;
            this.Bh = Bh | 0;
            this.Bl = Bl | 0;
            this.Ch = Ch | 0;
            this.Cl = Cl | 0;
            this.Dh = Dh | 0;
            this.Dl = Dl | 0;
            this.Eh = Eh | 0;
            this.El = El | 0;
            this.Fh = Fh | 0;
            this.Fl = Fl | 0;
            this.Gh = Gh | 0;
            this.Gl = Gl | 0;
            this.Hh = Hh | 0;
            this.Hl = Hl | 0;
        }
        process(view, offset) {
            // Extend the first 16 words into the remaining 64 words w[16..79] of the message schedule array
            for (let i = 0; i < 16; i++, offset += 4) {
                SHA512_W_H[i] = view.getUint32(offset);
                SHA512_W_L[i] = view.getUint32((offset += 4));
            }
            for (let i = 16; i < 80; i++) {
                // s0 := (w[i-15] rightrotate 1) xor (w[i-15] rightrotate 8) xor (w[i-15] rightshift 7)
                const W15h = SHA512_W_H[i - 15] | 0;
                const W15l = SHA512_W_L[i - 15] | 0;
                const s0h = u64.rotrSH(W15h, W15l, 1) ^ u64.rotrSH(W15h, W15l, 8) ^ u64.shrSH(W15h, W15l, 7);
                const s0l = u64.rotrSL(W15h, W15l, 1) ^ u64.rotrSL(W15h, W15l, 8) ^ u64.shrSL(W15h, W15l, 7);
                // s1 := (w[i-2] rightrotate 19) xor (w[i-2] rightrotate 61) xor (w[i-2] rightshift 6)
                const W2h = SHA512_W_H[i - 2] | 0;
                const W2l = SHA512_W_L[i - 2] | 0;
                const s1h = u64.rotrSH(W2h, W2l, 19) ^ u64.rotrBH(W2h, W2l, 61) ^ u64.shrSH(W2h, W2l, 6);
                const s1l = u64.rotrSL(W2h, W2l, 19) ^ u64.rotrBL(W2h, W2l, 61) ^ u64.shrSL(W2h, W2l, 6);
                // SHA256_W[i] = s0 + s1 + SHA256_W[i - 7] + SHA256_W[i - 16];
                const SUMl = u64.add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
                const SUMh = u64.add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
                SHA512_W_H[i] = SUMh | 0;
                SHA512_W_L[i] = SUMl | 0;
            }
            let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
            // Compression function main loop, 80 rounds
            for (let i = 0; i < 80; i++) {
                // S1 := (e rightrotate 14) xor (e rightrotate 18) xor (e rightrotate 41)
                const sigma1h = u64.rotrSH(Eh, El, 14) ^ u64.rotrSH(Eh, El, 18) ^ u64.rotrBH(Eh, El, 41);
                const sigma1l = u64.rotrSL(Eh, El, 14) ^ u64.rotrSL(Eh, El, 18) ^ u64.rotrBL(Eh, El, 41);
                //const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
                const CHIh = (Eh & Fh) ^ (~Eh & Gh);
                const CHIl = (El & Fl) ^ (~El & Gl);
                // T1 = H + sigma1 + Chi(E, F, G) + SHA512_K[i] + SHA512_W[i]
                // prettier-ignore
                const T1ll = u64.add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
                const T1h = u64.add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
                const T1l = T1ll | 0;
                // S0 := (a rightrotate 28) xor (a rightrotate 34) xor (a rightrotate 39)
                const sigma0h = u64.rotrSH(Ah, Al, 28) ^ u64.rotrBH(Ah, Al, 34) ^ u64.rotrBH(Ah, Al, 39);
                const sigma0l = u64.rotrSL(Ah, Al, 28) ^ u64.rotrBL(Ah, Al, 34) ^ u64.rotrBL(Ah, Al, 39);
                const MAJh = (Ah & Bh) ^ (Ah & Ch) ^ (Bh & Ch);
                const MAJl = (Al & Bl) ^ (Al & Cl) ^ (Bl & Cl);
                Hh = Gh | 0;
                Hl = Gl | 0;
                Gh = Fh | 0;
                Gl = Fl | 0;
                Fh = Eh | 0;
                Fl = El | 0;
                ({ h: Eh, l: El } = u64.add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
                Dh = Ch | 0;
                Dl = Cl | 0;
                Ch = Bh | 0;
                Cl = Bl | 0;
                Bh = Ah | 0;
                Bl = Al | 0;
                const All = u64.add3L(T1l, sigma0l, MAJl);
                Ah = u64.add3H(All, T1h, sigma0h, MAJh);
                Al = All | 0;
            }
            // Add the compressed chunk to the current hash value
            ({ h: Ah, l: Al } = u64.add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
            ({ h: Bh, l: Bl } = u64.add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
            ({ h: Ch, l: Cl } = u64.add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
            ({ h: Dh, l: Dl } = u64.add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
            ({ h: Eh, l: El } = u64.add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
            ({ h: Fh, l: Fl } = u64.add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
            ({ h: Gh, l: Gl } = u64.add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
            ({ h: Hh, l: Hl } = u64.add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
            this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
        }
        roundClean() {
            SHA512_W_H.fill(0);
            SHA512_W_L.fill(0);
        }
        destroy() {
            this.buffer.fill(0);
            this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        }
    }
    class SHA512_224 extends SHA512 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x8c3d37c8 | 0;
            this.Al = 0x19544da2 | 0;
            this.Bh = 0x73e19966 | 0;
            this.Bl = 0x89dcd4d6 | 0;
            this.Ch = 0x1dfab7ae | 0;
            this.Cl = 0x32ff9c82 | 0;
            this.Dh = 0x679dd514 | 0;
            this.Dl = 0x582f9fcf | 0;
            this.Eh = 0x0f6d2b69 | 0;
            this.El = 0x7bd44da8 | 0;
            this.Fh = 0x77e36f73 | 0;
            this.Fl = 0x04c48942 | 0;
            this.Gh = 0x3f9d85a8 | 0;
            this.Gl = 0x6a1d36c8 | 0;
            this.Hh = 0x1112e6ad | 0;
            this.Hl = 0x91d692a1 | 0;
            this.outputLen = 28;
        }
    }
    class SHA512_256 extends SHA512 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0x22312194 | 0;
            this.Al = 0xfc2bf72c | 0;
            this.Bh = 0x9f555fa3 | 0;
            this.Bl = 0xc84c64c2 | 0;
            this.Ch = 0x2393b86b | 0;
            this.Cl = 0x6f53b151 | 0;
            this.Dh = 0x96387719 | 0;
            this.Dl = 0x5940eabd | 0;
            this.Eh = 0x96283ee2 | 0;
            this.El = 0xa88effe3 | 0;
            this.Fh = 0xbe5e1e25 | 0;
            this.Fl = 0x53863992 | 0;
            this.Gh = 0x2b0199fc | 0;
            this.Gl = 0x2c85b8aa | 0;
            this.Hh = 0x0eb72ddc | 0;
            this.Hl = 0x81c52ca2 | 0;
            this.outputLen = 32;
        }
    }
    class SHA384 extends SHA512 {
        constructor() {
            super();
            // h -- high 32 bits, l -- low 32 bits
            this.Ah = 0xcbbb9d5d | 0;
            this.Al = 0xc1059ed8 | 0;
            this.Bh = 0x629a292a | 0;
            this.Bl = 0x367cd507 | 0;
            this.Ch = 0x9159015a | 0;
            this.Cl = 0x3070dd17 | 0;
            this.Dh = 0x152fecd8 | 0;
            this.Dl = 0xf70e5939 | 0;
            this.Eh = 0x67332667 | 0;
            this.El = 0xffc00b31 | 0;
            this.Fh = 0x8eb44a87 | 0;
            this.Fl = 0x68581511 | 0;
            this.Gh = 0xdb0c2e0d | 0;
            this.Gl = 0x64f98fa7 | 0;
            this.Hh = 0x47b5481d | 0;
            this.Hl = 0xbefa4fa4 | 0;
            this.outputLen = 48;
        }
    }
    const sha512 = wrapConstructor(() => new SHA512());
    wrapConstructor(() => new SHA512_224());
    wrapConstructor(() => new SHA512_256());
    wrapConstructor(() => new SHA384());

    const Point = secp256k1.ProjectivePoint;
    const base58check = base58check$1(sha256$1);
    function bytesToNumber(bytes) {
        return BigInt(`0x${bytesToHex$1(bytes)}`);
    }
    function numberToBytes(num) {
        return hexToBytes$1(num.toString(16).padStart(64, '0'));
    }
    const MASTER_SECRET = utf8ToBytes$1('Bitcoin seed');
    const BITCOIN_VERSIONS = { private: 0x0488ade4, public: 0x0488b21e };
    const HARDENED_OFFSET = 0x80000000;
    const hash160 = (data) => ripemd160(sha256$1(data));
    const fromU32 = (data) => createView(data).getUint32(0, false);
    const toU32 = (n) => {
        if (!Number.isSafeInteger(n) || n < 0 || n > 2 ** 32 - 1) {
            throw new Error(`Invalid number=${n}. Should be from 0 to 2 ** 32 - 1`);
        }
        const buf = new Uint8Array(4);
        createView(buf).setUint32(0, n, false);
        return buf;
    };
    class HDKey {
        get fingerprint() {
            if (!this.pubHash) {
                throw new Error('No publicKey set!');
            }
            return fromU32(this.pubHash);
        }
        get identifier() {
            return this.pubHash;
        }
        get pubKeyHash() {
            return this.pubHash;
        }
        get privateKey() {
            return this.privKeyBytes || null;
        }
        get publicKey() {
            return this.pubKey || null;
        }
        get privateExtendedKey() {
            const priv = this.privateKey;
            if (!priv) {
                throw new Error('No private key');
            }
            return base58check.encode(this.serialize(this.versions.private, concatBytes$1(new Uint8Array([0]), priv)));
        }
        get publicExtendedKey() {
            if (!this.pubKey) {
                throw new Error('No public key');
            }
            return base58check.encode(this.serialize(this.versions.public, this.pubKey));
        }
        static fromMasterSeed(seed, versions = BITCOIN_VERSIONS) {
            bytes$1(seed);
            if (8 * seed.length < 128 || 8 * seed.length > 512) {
                throw new Error(`HDKey: wrong seed length=${seed.length}. Should be between 128 and 512 bits; 256 bits is advised)`);
            }
            const I = hmac$1(sha512, MASTER_SECRET, seed);
            return new HDKey({
                versions,
                chainCode: I.slice(32),
                privateKey: I.slice(0, 32),
            });
        }
        static fromExtendedKey(base58key, versions = BITCOIN_VERSIONS) {
            const keyBuffer = base58check.decode(base58key);
            const keyView = createView(keyBuffer);
            const version = keyView.getUint32(0, false);
            const opt = {
                versions,
                depth: keyBuffer[4],
                parentFingerprint: keyView.getUint32(5, false),
                index: keyView.getUint32(9, false),
                chainCode: keyBuffer.slice(13, 45),
            };
            const key = keyBuffer.slice(45);
            const isPriv = key[0] === 0;
            if (version !== versions[isPriv ? 'private' : 'public']) {
                throw new Error('Version mismatch');
            }
            if (isPriv) {
                return new HDKey({ ...opt, privateKey: key.slice(1) });
            }
            else {
                return new HDKey({ ...opt, publicKey: key });
            }
        }
        static fromJSON(json) {
            return HDKey.fromExtendedKey(json.xpriv);
        }
        constructor(opt) {
            this.depth = 0;
            this.index = 0;
            this.chainCode = null;
            this.parentFingerprint = 0;
            if (!opt || typeof opt !== 'object') {
                throw new Error('HDKey.constructor must not be called directly');
            }
            this.versions = opt.versions || BITCOIN_VERSIONS;
            this.depth = opt.depth || 0;
            this.chainCode = opt.chainCode;
            this.index = opt.index || 0;
            this.parentFingerprint = opt.parentFingerprint || 0;
            if (!this.depth) {
                if (this.parentFingerprint || this.index) {
                    throw new Error('HDKey: zero depth with non-zero index/parent fingerprint');
                }
            }
            if (opt.publicKey && opt.privateKey) {
                throw new Error('HDKey: publicKey and privateKey at same time.');
            }
            if (opt.privateKey) {
                if (!secp256k1.utils.isValidPrivateKey(opt.privateKey)) {
                    throw new Error('Invalid private key');
                }
                this.privKey =
                    typeof opt.privateKey === 'bigint' ? opt.privateKey : bytesToNumber(opt.privateKey);
                this.privKeyBytes = numberToBytes(this.privKey);
                this.pubKey = secp256k1.getPublicKey(opt.privateKey, true);
            }
            else if (opt.publicKey) {
                this.pubKey = Point.fromHex(opt.publicKey).toRawBytes(true);
            }
            else {
                throw new Error('HDKey: no public or private key provided');
            }
            this.pubHash = hash160(this.pubKey);
        }
        derive(path) {
            if (!/^[mM]'?/.test(path)) {
                throw new Error('Path must start with "m" or "M"');
            }
            if (/^[mM]'?$/.test(path)) {
                return this;
            }
            const parts = path.replace(/^[mM]'?\//, '').split('/');
            let child = this;
            for (const c of parts) {
                const m = /^(\d+)('?)$/.exec(c);
                if (!m || m.length !== 3) {
                    throw new Error(`Invalid child index: ${c}`);
                }
                let idx = +m[1];
                if (!Number.isSafeInteger(idx) || idx >= HARDENED_OFFSET) {
                    throw new Error('Invalid index');
                }
                if (m[2] === "'") {
                    idx += HARDENED_OFFSET;
                }
                child = child.deriveChild(idx);
            }
            return child;
        }
        deriveChild(index) {
            if (!this.pubKey || !this.chainCode) {
                throw new Error('No publicKey or chainCode set');
            }
            let data = toU32(index);
            if (index >= HARDENED_OFFSET) {
                const priv = this.privateKey;
                if (!priv) {
                    throw new Error('Could not derive hardened child key');
                }
                data = concatBytes$1(new Uint8Array([0]), priv, data);
            }
            else {
                data = concatBytes$1(this.pubKey, data);
            }
            const I = hmac$1(sha512, this.chainCode, data);
            const childTweak = bytesToNumber(I.slice(0, 32));
            const chainCode = I.slice(32);
            if (!secp256k1.utils.isValidPrivateKey(childTweak)) {
                throw new Error('Tweak bigger than curve order');
            }
            const opt = {
                versions: this.versions,
                chainCode,
                depth: this.depth + 1,
                parentFingerprint: this.fingerprint,
                index,
            };
            try {
                if (this.privateKey) {
                    const added = mod(this.privKey + childTweak, secp256k1.CURVE.n);
                    if (!secp256k1.utils.isValidPrivateKey(added)) {
                        throw new Error('The tweak was out of range or the resulted private key is invalid');
                    }
                    opt.privateKey = added;
                }
                else {
                    const added = Point.fromHex(this.pubKey).add(Point.fromPrivateKey(childTweak));
                    if (added.equals(Point.ZERO)) {
                        throw new Error('The tweak was equal to negative P, which made the result key invalid');
                    }
                    opt.publicKey = added.toRawBytes(true);
                }
                return new HDKey(opt);
            }
            catch (err) {
                return this.deriveChild(index + 1);
            }
        }
        sign(hash) {
            if (!this.privateKey) {
                throw new Error('No privateKey set!');
            }
            bytes$1(hash, 32);
            return secp256k1.sign(hash, this.privKey).toCompactRawBytes();
        }
        verify(hash, signature) {
            bytes$1(hash, 32);
            bytes$1(signature, 64);
            if (!this.publicKey) {
                throw new Error('No publicKey set!');
            }
            let sig;
            try {
                sig = secp256k1.Signature.fromCompact(signature);
            }
            catch (error) {
                return false;
            }
            return secp256k1.verify(sig, hash, this.publicKey);
        }
        wipePrivateData() {
            this.privKey = undefined;
            if (this.privKeyBytes) {
                this.privKeyBytes.fill(0);
                this.privKeyBytes = undefined;
            }
            return this;
        }
        toJSON() {
            return {
                xpriv: this.privateExtendedKey,
                xpub: this.publicExtendedKey,
            };
        }
        serialize(version, key) {
            if (!this.chainCode) {
                throw new Error('No chainCode set');
            }
            bytes$1(key, 33);
            return concatBytes$1(toU32(version), new Uint8Array([this.depth]), toU32(this.parentFingerprint), toU32(this.index), this.chainCode, key);
        }
    }

    var __defProp = Object.defineProperty;
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    function generatePrivateKey() {
      return bytesToHex$1(schnorr.utils.randomPrivateKey());
    }
    function getPublicKey(privateKey) {
      return bytesToHex$1(schnorr.getPublicKey(privateKey));
    }

    // utils.ts
    var utils_exports = {};
    __export(utils_exports, {
      MessageNode: () => MessageNode,
      MessageQueue: () => MessageQueue,
      insertEventIntoAscendingList: () => insertEventIntoAscendingList,
      insertEventIntoDescendingList: () => insertEventIntoDescendingList,
      normalizeURL: () => normalizeURL,
      utf8Decoder: () => utf8Decoder,
      utf8Encoder: () => utf8Encoder
    });
    var utf8Decoder = new TextDecoder("utf-8");
    var utf8Encoder = new TextEncoder();
    function normalizeURL(url) {
      let p = new URL(url);
      p.pathname = p.pathname.replace(/\/+/g, "/");
      if (p.pathname.endsWith("/"))
        p.pathname = p.pathname.slice(0, -1);
      if (p.port === "80" && p.protocol === "ws:" || p.port === "443" && p.protocol === "wss:")
        p.port = "";
      p.searchParams.sort();
      p.hash = "";
      return p.toString();
    }
    function insertEventIntoDescendingList(sortedArray, event) {
      let start = 0;
      let end = sortedArray.length - 1;
      let midPoint;
      let position = start;
      if (end < 0) {
        position = 0;
      } else if (event.created_at < sortedArray[end].created_at) {
        position = end + 1;
      } else if (event.created_at >= sortedArray[start].created_at) {
        position = start;
      } else
        while (true) {
          if (end <= start + 1) {
            position = end;
            break;
          }
          midPoint = Math.floor(start + (end - start) / 2);
          if (sortedArray[midPoint].created_at > event.created_at) {
            start = midPoint;
          } else if (sortedArray[midPoint].created_at < event.created_at) {
            end = midPoint;
          } else {
            position = midPoint;
            break;
          }
        }
      if (sortedArray[position]?.id !== event.id) {
        return [
          ...sortedArray.slice(0, position),
          event,
          ...sortedArray.slice(position)
        ];
      }
      return sortedArray;
    }
    function insertEventIntoAscendingList(sortedArray, event) {
      let start = 0;
      let end = sortedArray.length - 1;
      let midPoint;
      let position = start;
      if (end < 0) {
        position = 0;
      } else if (event.created_at > sortedArray[end].created_at) {
        position = end + 1;
      } else if (event.created_at <= sortedArray[start].created_at) {
        position = start;
      } else
        while (true) {
          if (end <= start + 1) {
            position = end;
            break;
          }
          midPoint = Math.floor(start + (end - start) / 2);
          if (sortedArray[midPoint].created_at < event.created_at) {
            start = midPoint;
          } else if (sortedArray[midPoint].created_at > event.created_at) {
            end = midPoint;
          } else {
            position = midPoint;
            break;
          }
        }
      if (sortedArray[position]?.id !== event.id) {
        return [
          ...sortedArray.slice(0, position),
          event,
          ...sortedArray.slice(position)
        ];
      }
      return sortedArray;
    }
    var MessageNode = class {
      _value;
      _next;
      get value() {
        return this._value;
      }
      set value(message) {
        this._value = message;
      }
      get next() {
        return this._next;
      }
      set next(node) {
        this._next = node;
      }
      constructor(message) {
        this._value = message;
        this._next = null;
      }
    };
    var MessageQueue = class {
      _first;
      _last;
      get first() {
        return this._first;
      }
      set first(messageNode) {
        this._first = messageNode;
      }
      get last() {
        return this._last;
      }
      set last(messageNode) {
        this._last = messageNode;
      }
      _size;
      get size() {
        return this._size;
      }
      set size(v) {
        this._size = v;
      }
      constructor() {
        this._first = null;
        this._last = null;
        this._size = 0;
      }
      enqueue(message) {
        const newNode = new MessageNode(message);
        if (this._size === 0 || !this._last) {
          this._first = newNode;
          this._last = newNode;
        } else {
          this._last.next = newNode;
          this._last = newNode;
        }
        this._size++;
        return true;
      }
      dequeue() {
        if (this._size === 0 || !this._first)
          return null;
        let prev = this._first;
        this._first = prev.next;
        prev.next = null;
        this._size--;
        return prev.value;
      }
    };
    function finishEvent(t, privateKey) {
      let event = t;
      event.pubkey = getPublicKey(privateKey);
      event.id = getEventHash(event);
      event.sig = getSignature(event, privateKey);
      return event;
    }
    function serializeEvent(evt) {
      if (!validateEvent(evt))
        throw new Error("can't serialize event with wrong or missing properties");
      return JSON.stringify([
        0,
        evt.pubkey,
        evt.created_at,
        evt.kind,
        evt.tags,
        evt.content
      ]);
    }
    function getEventHash(event) {
      let eventHash = sha256$1(utf8Encoder.encode(serializeEvent(event)));
      return bytesToHex$1(eventHash);
    }
    var isRecord = (obj) => obj instanceof Object;
    function validateEvent(event) {
      if (!isRecord(event))
        return false;
      if (typeof event.kind !== "number")
        return false;
      if (typeof event.content !== "string")
        return false;
      if (typeof event.created_at !== "number")
        return false;
      if (typeof event.pubkey !== "string")
        return false;
      if (!event.pubkey.match(/^[a-f0-9]{64}$/))
        return false;
      if (!Array.isArray(event.tags))
        return false;
      for (let i = 0; i < event.tags.length; i++) {
        let tag = event.tags[i];
        if (!Array.isArray(tag))
          return false;
        for (let j = 0; j < tag.length; j++) {
          if (typeof tag[j] === "object")
            return false;
        }
      }
      return true;
    }
    function verifySignature(event) {
      try {
        return schnorr.verify(event.sig, getEventHash(event), event.pubkey);
      } catch (err) {
        return false;
      }
    }
    function getSignature(event, key) {
      return bytesToHex$1(schnorr.sign(getEventHash(event), key));
    }

    // filter.ts
    function matchFilter(filter, event) {
      if (filter.ids && filter.ids.indexOf(event.id) === -1) {
        if (!filter.ids.some((prefix) => event.id.startsWith(prefix))) {
          return false;
        }
      }
      if (filter.kinds && filter.kinds.indexOf(event.kind) === -1)
        return false;
      if (filter.authors && filter.authors.indexOf(event.pubkey) === -1) {
        if (!filter.authors.some((prefix) => event.pubkey.startsWith(prefix))) {
          return false;
        }
      }
      for (let f in filter) {
        if (f[0] === "#") {
          let tagName = f.slice(1);
          let values = filter[`#${tagName}`];
          if (values && !event.tags.find(
            ([t, v]) => t === f.slice(1) && values.indexOf(v) !== -1
          ))
            return false;
        }
      }
      if (filter.since && event.created_at < filter.since)
        return false;
      if (filter.until && event.created_at >= filter.until)
        return false;
      return true;
    }
    function matchFilters(filters, event) {
      for (let i = 0; i < filters.length; i++) {
        if (matchFilter(filters[i], event))
          return true;
      }
      return false;
    }

    // fakejson.ts
    var fakejson_exports = {};
    __export(fakejson_exports, {
      getHex64: () => getHex64,
      getInt: () => getInt,
      getSubscriptionId: () => getSubscriptionId,
      matchEventId: () => matchEventId,
      matchEventKind: () => matchEventKind,
      matchEventPubkey: () => matchEventPubkey
    });
    function getHex64(json, field) {
      let len = field.length + 3;
      let idx = json.indexOf(`"${field}":`) + len;
      let s = json.slice(idx).indexOf(`"`) + idx + 1;
      return json.slice(s, s + 64);
    }
    function getInt(json, field) {
      let len = field.length;
      let idx = json.indexOf(`"${field}":`) + len + 3;
      let sliced = json.slice(idx);
      let end = Math.min(sliced.indexOf(","), sliced.indexOf("}"));
      return parseInt(sliced.slice(0, end), 10);
    }
    function getSubscriptionId(json) {
      let idx = json.slice(0, 22).indexOf(`"EVENT"`);
      if (idx === -1)
        return null;
      let pstart = json.slice(idx + 7 + 1).indexOf(`"`);
      if (pstart === -1)
        return null;
      let start = idx + 7 + 1 + pstart;
      let pend = json.slice(start + 1, 80).indexOf(`"`);
      if (pend === -1)
        return null;
      let end = start + 1 + pend;
      return json.slice(start + 1, end);
    }
    function matchEventId(json, id) {
      return id === getHex64(json, "id");
    }
    function matchEventPubkey(json, pubkey) {
      return pubkey === getHex64(json, "pubkey");
    }
    function matchEventKind(json, kind) {
      return kind === getInt(json, "kind");
    }

    // relay.ts
    var newListeners = () => ({
      connect: [],
      disconnect: [],
      error: [],
      notice: [],
      auth: []
    });
    function relayInit(url, options = {}) {
      let { listTimeout = 3e3, getTimeout = 3e3, countTimeout = 3e3 } = options;
      var ws;
      var openSubs = {};
      var listeners = newListeners();
      var subListeners = {};
      var pubListeners = {};
      var connectionPromise;
      async function connectRelay() {
        if (connectionPromise)
          return connectionPromise;
        connectionPromise = new Promise((resolve, reject) => {
          try {
            ws = new WebSocket(url);
          } catch (err) {
            reject(err);
          }
          ws.onopen = () => {
            listeners.connect.forEach((cb) => cb());
            resolve();
          };
          ws.onerror = () => {
            connectionPromise = void 0;
            listeners.error.forEach((cb) => cb());
            reject();
          };
          ws.onclose = async () => {
            connectionPromise = void 0;
            listeners.disconnect.forEach((cb) => cb());
          };
          let incomingMessageQueue = new MessageQueue();
          let handleNextInterval;
          ws.onmessage = (e) => {
            incomingMessageQueue.enqueue(e.data);
            if (!handleNextInterval) {
              handleNextInterval = setInterval(handleNext, 0);
            }
          };
          function handleNext() {
            if (incomingMessageQueue.size === 0) {
              clearInterval(handleNextInterval);
              handleNextInterval = null;
              return;
            }
            var json = incomingMessageQueue.dequeue();
            if (!json)
              return;
            let subid = getSubscriptionId(json);
            if (subid) {
              let so = openSubs[subid];
              if (so && so.alreadyHaveEvent && so.alreadyHaveEvent(getHex64(json, "id"), url)) {
                return;
              }
            }
            try {
              let data = JSON.parse(json);
              switch (data[0]) {
                case "EVENT": {
                  let id2 = data[1];
                  let event = data[2];
                  if (validateEvent(event) && openSubs[id2] && (openSubs[id2].skipVerification || verifySignature(event)) && matchFilters(openSubs[id2].filters, event)) {
                    openSubs[id2];
                    (subListeners[id2]?.event || []).forEach((cb) => cb(event));
                  }
                  return;
                }
                case "COUNT":
                  let id = data[1];
                  let payload = data[2];
                  if (openSubs[id]) {
                    ;
                    (subListeners[id]?.count || []).forEach((cb) => cb(payload));
                  }
                  return;
                case "EOSE": {
                  let id2 = data[1];
                  if (id2 in subListeners) {
                    subListeners[id2].eose.forEach((cb) => cb());
                    subListeners[id2].eose = [];
                  }
                  return;
                }
                case "OK": {
                  let id2 = data[1];
                  let ok = data[2];
                  let reason = data[3] || "";
                  if (id2 in pubListeners) {
                    if (ok)
                      pubListeners[id2].ok.forEach((cb) => cb());
                    else
                      pubListeners[id2].failed.forEach((cb) => cb(reason));
                    pubListeners[id2].ok = [];
                    pubListeners[id2].failed = [];
                  }
                  return;
                }
                case "NOTICE":
                  let notice = data[1];
                  listeners.notice.forEach((cb) => cb(notice));
                  return;
                case "AUTH": {
                  let challenge = data[1];
                  listeners.auth?.forEach((cb) => cb(challenge));
                  return;
                }
              }
            } catch (err) {
              return;
            }
          }
        });
        return connectionPromise;
      }
      function connected() {
        return ws?.readyState === 1;
      }
      async function connect() {
        if (connected())
          return;
        await connectRelay();
      }
      async function trySend(params) {
        let msg = JSON.stringify(params);
        if (!connected()) {
          await new Promise((resolve) => setTimeout(resolve, 1e3));
          if (!connected()) {
            return;
          }
        }
        try {
          ws.send(msg);
        } catch (err) {
          console.log(err);
        }
      }
      const sub = (filters, {
        verb = "REQ",
        skipVerification = false,
        alreadyHaveEvent = null,
        id = Math.random().toString().slice(2)
      } = {}) => {
        let subid = id;
        openSubs[subid] = {
          id: subid,
          filters,
          skipVerification,
          alreadyHaveEvent
        };
        trySend([verb, subid, ...filters]);
        return {
          sub: (newFilters, newOpts = {}) => sub(newFilters || filters, {
            skipVerification: newOpts.skipVerification || skipVerification,
            alreadyHaveEvent: newOpts.alreadyHaveEvent || alreadyHaveEvent,
            id: subid
          }),
          unsub: () => {
            delete openSubs[subid];
            delete subListeners[subid];
            trySend(["CLOSE", subid]);
          },
          on: (type, cb) => {
            subListeners[subid] = subListeners[subid] || {
              event: [],
              count: [],
              eose: []
            };
            subListeners[subid][type].push(cb);
          },
          off: (type, cb) => {
            let listeners2 = subListeners[subid];
            let idx = listeners2[type].indexOf(cb);
            if (idx >= 0)
              listeners2[type].splice(idx, 1);
          }
        };
      };
      function _publishEvent(event, type) {
        if (!event.id)
          throw new Error(`event ${event} has no id`);
        let id = event.id;
        trySend([type, event]);
        return {
          on: (type2, cb) => {
            pubListeners[id] = pubListeners[id] || {
              ok: [],
              failed: []
            };
            pubListeners[id][type2].push(cb);
          },
          off: (type2, cb) => {
            let listeners2 = pubListeners[id];
            if (!listeners2)
              return;
            let idx = listeners2[type2].indexOf(cb);
            if (idx >= 0)
              listeners2[type2].splice(idx, 1);
          }
        };
      }
      return {
        url,
        sub,
        on: (type, cb) => {
          listeners[type].push(cb);
          if (type === "connect" && ws?.readyState === 1) {
            cb();
          }
        },
        off: (type, cb) => {
          let index = listeners[type].indexOf(cb);
          if (index !== -1)
            listeners[type].splice(index, 1);
        },
        list: (filters, opts) => new Promise((resolve) => {
          let s = sub(filters, opts);
          let events = [];
          let timeout = setTimeout(() => {
            s.unsub();
            resolve(events);
          }, listTimeout);
          s.on("eose", () => {
            s.unsub();
            clearTimeout(timeout);
            resolve(events);
          });
          s.on("event", (event) => {
            events.push(event);
          });
        }),
        get: (filter, opts) => new Promise((resolve) => {
          let s = sub([filter], opts);
          let timeout = setTimeout(() => {
            s.unsub();
            resolve(null);
          }, getTimeout);
          s.on("event", (event) => {
            s.unsub();
            clearTimeout(timeout);
            resolve(event);
          });
        }),
        count: (filters) => new Promise((resolve) => {
          let s = sub(filters, { ...sub, verb: "COUNT" });
          let timeout = setTimeout(() => {
            s.unsub();
            resolve(null);
          }, countTimeout);
          s.on("count", (event) => {
            s.unsub();
            clearTimeout(timeout);
            resolve(event);
          });
        }),
        publish(event) {
          return _publishEvent(event, "EVENT");
        },
        auth(event) {
          return _publishEvent(event, "AUTH");
        },
        connect,
        close() {
          listeners = newListeners();
          subListeners = {};
          pubListeners = {};
          if (ws.readyState === WebSocket.OPEN) {
            ws?.close();
          }
        },
        get status() {
          return ws?.readyState ?? 3;
        }
      };
    }

    // pool.ts
    var SimplePool = class {
      _conn;
      _seenOn = {};
      eoseSubTimeout;
      getTimeout;
      constructor(options = {}) {
        this._conn = {};
        this.eoseSubTimeout = options.eoseSubTimeout || 3400;
        this.getTimeout = options.getTimeout || 3400;
      }
      close(relays) {
        relays.forEach((url) => {
          let relay = this._conn[normalizeURL(url)];
          if (relay)
            relay.close();
        });
      }
      async ensureRelay(url) {
        const nm = normalizeURL(url);
        if (!this._conn[nm]) {
          this._conn[nm] = relayInit(nm, {
            getTimeout: this.getTimeout * 0.9,
            listTimeout: this.getTimeout * 0.9
          });
        }
        const relay = this._conn[nm];
        await relay.connect();
        return relay;
      }
      sub(relays, filters, opts) {
        let _knownIds = /* @__PURE__ */ new Set();
        let modifiedOpts = { ...opts || {} };
        modifiedOpts.alreadyHaveEvent = (id, url) => {
          if (opts?.alreadyHaveEvent?.(id, url)) {
            return true;
          }
          let set = this._seenOn[id] || /* @__PURE__ */ new Set();
          set.add(url);
          this._seenOn[id] = set;
          return _knownIds.has(id);
        };
        let subs = [];
        let eventListeners = /* @__PURE__ */ new Set();
        let eoseListeners = /* @__PURE__ */ new Set();
        let eosesMissing = relays.length;
        let eoseSent = false;
        let eoseTimeout = setTimeout(() => {
          eoseSent = true;
          for (let cb of eoseListeners.values())
            cb();
        }, this.eoseSubTimeout);
        relays.forEach(async (relay) => {
          let r;
          try {
            r = await this.ensureRelay(relay);
          } catch (err) {
            handleEose();
            return;
          }
          if (!r)
            return;
          let s = r.sub(filters, modifiedOpts);
          s.on("event", (event) => {
            _knownIds.add(event.id);
            for (let cb of eventListeners.values())
              cb(event);
          });
          s.on("eose", () => {
            if (eoseSent)
              return;
            handleEose();
          });
          subs.push(s);
          function handleEose() {
            eosesMissing--;
            if (eosesMissing === 0) {
              clearTimeout(eoseTimeout);
              for (let cb of eoseListeners.values())
                cb();
            }
          }
        });
        let greaterSub = {
          sub(filters2, opts2) {
            subs.forEach((sub) => sub.sub(filters2, opts2));
            return greaterSub;
          },
          unsub() {
            subs.forEach((sub) => sub.unsub());
          },
          on(type, cb) {
            if (type === "event") {
              eventListeners.add(cb);
            } else if (type === "eose") {
              eoseListeners.add(cb);
            }
          },
          off(type, cb) {
            if (type === "event") {
              eventListeners.delete(cb);
            } else if (type === "eose")
              eoseListeners.delete(cb);
          }
        };
        return greaterSub;
      }
      get(relays, filter, opts) {
        return new Promise((resolve) => {
          let sub = this.sub(relays, [filter], opts);
          let timeout = setTimeout(() => {
            sub.unsub();
            resolve(null);
          }, this.getTimeout);
          sub.on("event", (event) => {
            resolve(event);
            clearTimeout(timeout);
            sub.unsub();
          });
        });
      }
      list(relays, filters, opts) {
        return new Promise((resolve) => {
          let events = [];
          let sub = this.sub(relays, filters, opts);
          sub.on("event", (event) => {
            events.push(event);
          });
          sub.on("eose", () => {
            sub.unsub();
            resolve(events);
          });
        });
      }
      publish(relays, event) {
        const pubPromises = relays.map(async (relay) => {
          let r;
          try {
            r = await this.ensureRelay(relay);
            return r.publish(event);
          } catch (_) {
            return { on() {
            }, off() {
            } };
          }
        });
        const callbackMap = /* @__PURE__ */ new Map();
        return {
          on(type, cb) {
            relays.forEach(async (relay, i) => {
              let pub = await pubPromises[i];
              let callback = () => cb(relay);
              callbackMap.set(cb, callback);
              pub.on(type, callback);
            });
          },
          off(type, cb) {
            relays.forEach(async (_, i) => {
              let callback = callbackMap.get(cb);
              if (callback) {
                let pub = await pubPromises[i];
                pub.off(type, callback);
              }
            });
          }
        };
      }
      seenOn(id) {
        return Array.from(this._seenOn[id]?.values?.() || []);
      }
    };

    // nip19.ts
    var nip19_exports = {};
    __export(nip19_exports, {
      BECH32_REGEX: () => BECH32_REGEX,
      decode: () => decode,
      naddrEncode: () => naddrEncode,
      neventEncode: () => neventEncode,
      noteEncode: () => noteEncode,
      nprofileEncode: () => nprofileEncode,
      npubEncode: () => npubEncode,
      nrelayEncode: () => nrelayEncode,
      nsecEncode: () => nsecEncode
    });
    var Bech32MaxSize = 5e3;
    var BECH32_REGEX = /[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}/;
    function decode(nip19) {
      let { prefix, words } = bech32.decode(nip19, Bech32MaxSize);
      let data = new Uint8Array(bech32.fromWords(words));
      switch (prefix) {
        case "nprofile": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for nprofile");
          if (tlv[0][0].length !== 32)
            throw new Error("TLV 0 should be 32 bytes");
          return {
            type: "nprofile",
            data: {
              pubkey: bytesToHex$1(tlv[0][0]),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : []
            }
          };
        }
        case "nevent": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for nevent");
          if (tlv[0][0].length !== 32)
            throw new Error("TLV 0 should be 32 bytes");
          if (tlv[2] && tlv[2][0].length !== 32)
            throw new Error("TLV 2 should be 32 bytes");
          return {
            type: "nevent",
            data: {
              id: bytesToHex$1(tlv[0][0]),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : [],
              author: tlv[2]?.[0] ? bytesToHex$1(tlv[2][0]) : void 0
            }
          };
        }
        case "naddr": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for naddr");
          if (!tlv[2]?.[0])
            throw new Error("missing TLV 2 for naddr");
          if (tlv[2][0].length !== 32)
            throw new Error("TLV 2 should be 32 bytes");
          if (!tlv[3]?.[0])
            throw new Error("missing TLV 3 for naddr");
          if (tlv[3][0].length !== 4)
            throw new Error("TLV 3 should be 4 bytes");
          return {
            type: "naddr",
            data: {
              identifier: utf8Decoder.decode(tlv[0][0]),
              pubkey: bytesToHex$1(tlv[2][0]),
              kind: parseInt(bytesToHex$1(tlv[3][0]), 16),
              relays: tlv[1] ? tlv[1].map((d) => utf8Decoder.decode(d)) : []
            }
          };
        }
        case "nrelay": {
          let tlv = parseTLV(data);
          if (!tlv[0]?.[0])
            throw new Error("missing TLV 0 for nrelay");
          return {
            type: "nrelay",
            data: utf8Decoder.decode(tlv[0][0])
          };
        }
        case "nsec":
        case "npub":
        case "note":
          return { type: prefix, data: bytesToHex$1(data) };
        default:
          throw new Error(`unknown prefix ${prefix}`);
      }
    }
    function parseTLV(data) {
      let result = {};
      let rest = data;
      while (rest.length > 0) {
        let t = rest[0];
        let l = rest[1];
        if (!l)
          throw new Error(`malformed TLV ${t}`);
        let v = rest.slice(2, 2 + l);
        rest = rest.slice(2 + l);
        if (v.length < l)
          throw new Error(`not enough data to read on TLV ${t}`);
        result[t] = result[t] || [];
        result[t].push(v);
      }
      return result;
    }
    function nsecEncode(hex) {
      return encodeBytes("nsec", hex);
    }
    function npubEncode(hex) {
      return encodeBytes("npub", hex);
    }
    function noteEncode(hex) {
      return encodeBytes("note", hex);
    }
    function encodeBytes(prefix, hex) {
      let data = hexToBytes$1(hex);
      let words = bech32.toWords(data);
      return bech32.encode(prefix, words, Bech32MaxSize);
    }
    function nprofileEncode(profile) {
      let data = encodeTLV({
        0: [hexToBytes$1(profile.pubkey)],
        1: (profile.relays || []).map((url) => utf8Encoder.encode(url))
      });
      let words = bech32.toWords(data);
      return bech32.encode("nprofile", words, Bech32MaxSize);
    }
    function neventEncode(event) {
      let data = encodeTLV({
        0: [hexToBytes$1(event.id)],
        1: (event.relays || []).map((url) => utf8Encoder.encode(url)),
        2: event.author ? [hexToBytes$1(event.author)] : []
      });
      let words = bech32.toWords(data);
      return bech32.encode("nevent", words, Bech32MaxSize);
    }
    function naddrEncode(addr) {
      let kind = new ArrayBuffer(4);
      new DataView(kind).setUint32(0, addr.kind, false);
      let data = encodeTLV({
        0: [utf8Encoder.encode(addr.identifier)],
        1: (addr.relays || []).map((url) => utf8Encoder.encode(url)),
        2: [hexToBytes$1(addr.pubkey)],
        3: [new Uint8Array(kind)]
      });
      let words = bech32.toWords(data);
      return bech32.encode("naddr", words, Bech32MaxSize);
    }
    function nrelayEncode(url) {
      let data = encodeTLV({
        0: [utf8Encoder.encode(url)]
      });
      let words = bech32.toWords(data);
      return bech32.encode("nrelay", words, Bech32MaxSize);
    }
    function encodeTLV(tlv) {
      let entries = [];
      Object.entries(tlv).forEach(([t, vs]) => {
        vs.forEach((v) => {
          let entry = new Uint8Array(v.length + 2);
          entry.set([parseInt(t)], 0);
          entry.set([v.length], 1);
          entry.set(v, 2);
          entries.push(entry);
        });
      });
      return concatBytes$1(...entries);
    }

    // nip04.ts
    var nip04_exports = {};
    __export(nip04_exports, {
      decrypt: () => decrypt,
      encrypt: () => encrypt
    });
    if (typeof crypto !== "undefined" && !crypto.subtle && crypto.webcrypto) {
      crypto.subtle = crypto.webcrypto.subtle;
    }
    async function encrypt(privkey, pubkey, text) {
      const key = secp256k1.getSharedSecret(privkey, "02" + pubkey);
      const normalizedKey = getNormalizedX(key);
      let iv = Uint8Array.from(randomBytes(16));
      let plaintext = utf8Encoder.encode(text);
      let cryptoKey = await crypto.subtle.importKey(
        "raw",
        normalizedKey,
        { name: "AES-CBC" },
        false,
        ["encrypt"]
      );
      let ciphertext = await crypto.subtle.encrypt(
        { name: "AES-CBC", iv },
        cryptoKey,
        plaintext
      );
      let ctb64 = base64.encode(new Uint8Array(ciphertext));
      let ivb64 = base64.encode(new Uint8Array(iv.buffer));
      return `${ctb64}?iv=${ivb64}`;
    }
    async function decrypt(privkey, pubkey, data) {
      let [ctb64, ivb64] = data.split("?iv=");
      let key = secp256k1.getSharedSecret(privkey, "02" + pubkey);
      let normalizedKey = getNormalizedX(key);
      let cryptoKey = await crypto.subtle.importKey(
        "raw",
        normalizedKey,
        { name: "AES-CBC" },
        false,
        ["decrypt"]
      );
      let ciphertext = base64.decode(ctb64);
      let iv = base64.decode(ivb64);
      let plaintext = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv },
        cryptoKey,
        ciphertext
      );
      let text = utf8Decoder.decode(plaintext);
      return text;
    }
    function getNormalizedX(key) {
      return key.slice(1, 33);
    }

    // nip05.ts
    var nip05_exports = {};
    __export(nip05_exports, {
      NIP05_REGEX: () => NIP05_REGEX,
      queryProfile: () => queryProfile,
      searchDomain: () => searchDomain,
      useFetchImplementation: () => useFetchImplementation
    });
    var NIP05_REGEX = /^(?:([\w.+-]+)@)?([\w.-]+)$/;
    var _fetch;
    try {
      _fetch = fetch;
    } catch {
    }
    function useFetchImplementation(fetchImplementation) {
      _fetch = fetchImplementation;
    }
    async function searchDomain(domain, query = "") {
      try {
        let res = await (await _fetch(`https://${domain}/.well-known/nostr.json?name=${query}`)).json();
        return res.names;
      } catch (_) {
        return {};
      }
    }
    async function queryProfile(fullname) {
      const match = fullname.match(NIP05_REGEX);
      if (!match)
        return null;
      const [_, name = "_", domain] = match;
      try {
        const res = await _fetch(`https://${domain}/.well-known/nostr.json?name=${name}`);
        const { names, relays } = parseNIP05Result(await res.json());
        const pubkey = names[name];
        return pubkey ? { pubkey, relays: relays?.[pubkey] } : null;
      } catch (_e) {
        return null;
      }
    }
    function parseNIP05Result(json) {
      const result = {
        names: {}
      };
      for (const [name, pubkey] of Object.entries(json.names)) {
        if (typeof name === "string" && typeof pubkey === "string") {
          result.names[name] = pubkey;
        }
      }
      if (json.relays) {
        result.relays = {};
        for (const [pubkey, relays] of Object.entries(json.relays)) {
          if (typeof pubkey === "string" && Array.isArray(relays)) {
            result.relays[pubkey] = relays.filter((relay) => typeof relay === "string");
          }
        }
      }
      return result;
    }

    // nip06.ts
    var nip06_exports = {};
    __export(nip06_exports, {
      generateSeedWords: () => generateSeedWords,
      privateKeyFromSeedWords: () => privateKeyFromSeedWords,
      validateWords: () => validateWords
    });
    function privateKeyFromSeedWords(mnemonic, passphrase) {
      let root = HDKey.fromMasterSeed(mnemonicToSeedSync_1(mnemonic, passphrase));
      let privateKey = root.derive(`m/44'/1237'/0'/0/0`).privateKey;
      if (!privateKey)
        throw new Error("could not derive private key");
      return bytesToHex$1(privateKey);
    }
    function generateSeedWords() {
      return generateMnemonic_1(wordlist);
    }
    function validateWords(words) {
      return validateMnemonic_1(words, wordlist);
    }

    // nip10.ts
    var nip10_exports = {};
    __export(nip10_exports, {
      parse: () => parse
    });
    function parse(event) {
      const result = {
        reply: void 0,
        root: void 0,
        mentions: [],
        profiles: []
      };
      const eTags = [];
      for (const tag of event.tags) {
        if (tag[0] === "e" && tag[1]) {
          eTags.push(tag);
        }
        if (tag[0] === "p" && tag[1]) {
          result.profiles.push({
            pubkey: tag[1],
            relays: tag[2] ? [tag[2]] : []
          });
        }
      }
      for (let eTagIndex = 0; eTagIndex < eTags.length; eTagIndex++) {
        const eTag = eTags[eTagIndex];
        const [_, eTagEventId, eTagRelayUrl, eTagMarker] = eTag;
        const eventPointer = {
          id: eTagEventId,
          relays: eTagRelayUrl ? [eTagRelayUrl] : []
        };
        const isFirstETag = eTagIndex === 0;
        const isLastETag = eTagIndex === eTags.length - 1;
        if (eTagMarker === "root") {
          result.root = eventPointer;
          continue;
        }
        if (eTagMarker === "reply") {
          result.reply = eventPointer;
          continue;
        }
        if (eTagMarker === "mention") {
          result.mentions.push(eventPointer);
          continue;
        }
        if (isFirstETag) {
          result.root = eventPointer;
          continue;
        }
        if (isLastETag) {
          result.reply = eventPointer;
          continue;
        }
        result.mentions.push(eventPointer);
      }
      return result;
    }

    // nip13.ts
    var nip13_exports = {};
    __export(nip13_exports, {
      getPow: () => getPow
    });
    function getPow(id) {
      return getLeadingZeroBits(hexToBytes$1(id));
    }
    function getLeadingZeroBits(hash) {
      let total, i, bits;
      for (i = 0, total = 0; i < hash.length; i++) {
        bits = msb(hash[i]);
        total += bits;
        if (bits !== 8) {
          break;
        }
      }
      return total;
    }
    function msb(b) {
      let n = 0;
      if (b === 0) {
        return 8;
      }
      while (b >>= 1) {
        n++;
      }
      return 7 - n;
    }

    // nip18.ts
    var nip18_exports = {};
    __export(nip18_exports, {
      finishRepostEvent: () => finishRepostEvent,
      getRepostedEvent: () => getRepostedEvent,
      getRepostedEventPointer: () => getRepostedEventPointer
    });
    function finishRepostEvent(t, reposted, relayUrl, privateKey) {
      return finishEvent({
        kind: 6 /* Repost */,
        tags: [
          ...t.tags ?? [],
          ["e", reposted.id, relayUrl],
          ["p", reposted.pubkey]
        ],
        content: t.content === "" ? "" : JSON.stringify(reposted),
        created_at: t.created_at
      }, privateKey);
    }
    function getRepostedEventPointer(event) {
      if (event.kind !== 6 /* Repost */) {
        return void 0;
      }
      let lastETag;
      let lastPTag;
      for (let i = event.tags.length - 1; i >= 0 && (lastETag === void 0 || lastPTag === void 0); i--) {
        const tag = event.tags[i];
        if (tag.length >= 2) {
          if (tag[0] === "e" && lastETag === void 0) {
            lastETag = tag;
          } else if (tag[0] === "p" && lastPTag === void 0) {
            lastPTag = tag;
          }
        }
      }
      if (lastETag === void 0) {
        return void 0;
      }
      return {
        id: lastETag[1],
        relays: [lastETag[2], lastPTag?.[2]].filter((x) => typeof x === "string"),
        author: lastPTag?.[1]
      };
    }
    function getRepostedEvent(event, { skipVerification } = {}) {
      const pointer = getRepostedEventPointer(event);
      if (pointer === void 0 || event.content === "") {
        return void 0;
      }
      let repostedEvent;
      try {
        repostedEvent = JSON.parse(event.content);
      } catch (error) {
        return void 0;
      }
      if (repostedEvent.id !== pointer.id) {
        return void 0;
      }
      if (!skipVerification && !verifySignature(repostedEvent)) {
        return void 0;
      }
      return repostedEvent;
    }

    // nip21.ts
    var nip21_exports = {};
    __export(nip21_exports, {
      NOSTR_URI_REGEX: () => NOSTR_URI_REGEX,
      parse: () => parse2,
      test: () => test
    });
    var NOSTR_URI_REGEX = new RegExp(`nostr:(${BECH32_REGEX.source})`);
    function test(value) {
      return typeof value === "string" && new RegExp(`^${NOSTR_URI_REGEX.source}$`).test(value);
    }
    function parse2(uri) {
      const match = uri.match(new RegExp(`^${NOSTR_URI_REGEX.source}$`));
      if (!match)
        throw new Error(`Invalid Nostr URI: ${uri}`);
      return {
        uri: match[0],
        value: match[1],
        decoded: decode(match[1])
      };
    }

    // nip25.ts
    var nip25_exports = {};
    __export(nip25_exports, {
      finishReactionEvent: () => finishReactionEvent,
      getReactedEventPointer: () => getReactedEventPointer
    });
    function finishReactionEvent(t, reacted, privateKey) {
      const inheritedTags = reacted.tags.filter(
        (tag) => tag.length >= 2 && (tag[0] === "e" || tag[0] === "p")
      );
      return finishEvent({
        ...t,
        kind: 7 /* Reaction */,
        tags: [
          ...t.tags ?? [],
          ...inheritedTags,
          ["e", reacted.id],
          ["p", reacted.pubkey]
        ],
        content: t.content ?? "+"
      }, privateKey);
    }
    function getReactedEventPointer(event) {
      if (event.kind !== 7 /* Reaction */) {
        return void 0;
      }
      let lastETag;
      let lastPTag;
      for (let i = event.tags.length - 1; i >= 0 && (lastETag === void 0 || lastPTag === void 0); i--) {
        const tag = event.tags[i];
        if (tag.length >= 2) {
          if (tag[0] === "e" && lastETag === void 0) {
            lastETag = tag;
          } else if (tag[0] === "p" && lastPTag === void 0) {
            lastPTag = tag;
          }
        }
      }
      if (lastETag === void 0 || lastPTag === void 0) {
        return void 0;
      }
      return {
        id: lastETag[1],
        relays: [lastETag[2], lastPTag[2]].filter((x) => x !== void 0),
        author: lastPTag[1]
      };
    }

    // nip26.ts
    var nip26_exports = {};
    __export(nip26_exports, {
      createDelegation: () => createDelegation,
      getDelegator: () => getDelegator
    });
    function createDelegation(privateKey, parameters) {
      let conditions = [];
      if ((parameters.kind || -1) >= 0)
        conditions.push(`kind=${parameters.kind}`);
      if (parameters.until)
        conditions.push(`created_at<${parameters.until}`);
      if (parameters.since)
        conditions.push(`created_at>${parameters.since}`);
      let cond = conditions.join("&");
      if (cond === "")
        throw new Error("refusing to create a delegation without any conditions");
      let sighash = sha256$1(
        utf8Encoder.encode(`nostr:delegation:${parameters.pubkey}:${cond}`)
      );
      let sig = bytesToHex$1(
        schnorr.sign(sighash, privateKey)
      );
      return {
        from: getPublicKey(privateKey),
        to: parameters.pubkey,
        cond,
        sig
      };
    }
    function getDelegator(event) {
      let tag = event.tags.find((tag2) => tag2[0] === "delegation" && tag2.length >= 4);
      if (!tag)
        return null;
      let pubkey = tag[1];
      let cond = tag[2];
      let sig = tag[3];
      let conditions = cond.split("&");
      for (let i = 0; i < conditions.length; i++) {
        let [key, operator, value] = conditions[i].split(/\b/);
        if (key === "kind" && operator === "=" && event.kind === parseInt(value))
          continue;
        else if (key === "created_at" && operator === "<" && event.created_at < parseInt(value))
          continue;
        else if (key === "created_at" && operator === ">" && event.created_at > parseInt(value))
          continue;
        else
          return null;
      }
      let sighash = sha256$1(
        utf8Encoder.encode(`nostr:delegation:${event.pubkey}:${cond}`)
      );
      if (!schnorr.verify(sig, sighash, pubkey))
        return null;
      return pubkey;
    }

    // nip27.ts
    var nip27_exports = {};
    __export(nip27_exports, {
      matchAll: () => matchAll,
      regex: () => regex$1,
      replaceAll: () => replaceAll
    });
    var regex$1 = () => new RegExp(`\\b${NOSTR_URI_REGEX.source}\\b`, "g");
    function* matchAll(content) {
      const matches = content.matchAll(regex$1());
      for (const match of matches) {
        const [uri, value] = match;
        yield {
          uri,
          value,
          decoded: decode(value),
          start: match.index,
          end: match.index + uri.length
        };
      }
    }
    function replaceAll(content, replacer) {
      return content.replaceAll(regex$1(), (uri, value) => {
        return replacer({
          uri,
          value,
          decoded: decode(value)
        });
      });
    }

    // nip39.ts
    var nip39_exports = {};
    __export(nip39_exports, {
      useFetchImplementation: () => useFetchImplementation2,
      validateGithub: () => validateGithub
    });
    var _fetch2;
    try {
      _fetch2 = fetch;
    } catch {
    }
    function useFetchImplementation2(fetchImplementation) {
      _fetch2 = fetchImplementation;
    }
    async function validateGithub(pubkey, username, proof) {
      try {
        let res = await (await _fetch2(`https://gist.github.com/${username}/${proof}/raw`)).text();
        return res === `Verifying that I control the following Nostr public key: ${pubkey}`;
      } catch (_) {
        return false;
      }
    }

    // nip42.ts
    var nip42_exports = {};
    __export(nip42_exports, {
      authenticate: () => authenticate
    });
    var authenticate = async ({
      challenge,
      relay,
      sign
    }) => {
      const e = {
        kind: 22242 /* ClientAuth */,
        created_at: Math.floor(Date.now() / 1e3),
        tags: [
          ["relay", relay.url],
          ["challenge", challenge]
        ],
        content: ""
      };
      const pub = relay.auth(await sign(e));
      return new Promise((resolve, reject) => {
        pub.on("ok", function ok() {
          pub.off("ok", ok);
          resolve();
        });
        pub.on("failed", function fail(reason) {
          pub.off("failed", fail);
          reject(reason);
        });
      });
    };

    // nip57.ts
    var nip57_exports = {};
    __export(nip57_exports, {
      getZapEndpoint: () => getZapEndpoint,
      makeZapReceipt: () => makeZapReceipt,
      makeZapRequest: () => makeZapRequest,
      useFetchImplementation: () => useFetchImplementation3,
      validateZapRequest: () => validateZapRequest
    });
    var _fetch3;
    try {
      _fetch3 = fetch;
    } catch {
    }
    function useFetchImplementation3(fetchImplementation) {
      _fetch3 = fetchImplementation;
    }
    async function getZapEndpoint(metadata) {
      try {
        let lnurl = "";
        let { lud06, lud16 } = JSON.parse(metadata.content);
        if (lud06) {
          let { words } = bech32.decode(lud06, 1e3);
          let data = bech32.fromWords(words);
          lnurl = utf8Decoder.decode(data);
        } else if (lud16) {
          let [name, domain] = lud16.split("@");
          lnurl = `https://${domain}/.well-known/lnurlp/${name}`;
        } else {
          return null;
        }
        let res = await _fetch3(lnurl);
        let body = await res.json();
        if (body.allowsNostr && body.nostrPubkey) {
          return body.callback;
        }
      } catch (err) {
      }
      return null;
    }
    function makeZapRequest({
      profile,
      event,
      amount,
      relays,
      comment = ""
    }) {
      if (!amount)
        throw new Error("amount not given");
      if (!profile)
        throw new Error("profile not given");
      let zr = {
        kind: 9734,
        created_at: Math.round(Date.now() / 1e3),
        content: comment,
        tags: [
          ["p", profile],
          ["amount", amount.toString()],
          ["relays", ...relays]
        ]
      };
      if (event) {
        zr.tags.push(["e", event]);
      }
      return zr;
    }
    function validateZapRequest(zapRequestString) {
      let zapRequest;
      try {
        zapRequest = JSON.parse(zapRequestString);
      } catch (err) {
        return "Invalid zap request JSON.";
      }
      if (!validateEvent(zapRequest))
        return "Zap request is not a valid Nostr event.";
      if (!verifySignature(zapRequest))
        return "Invalid signature on zap request.";
      let p = zapRequest.tags.find(([t, v]) => t === "p" && v);
      if (!p)
        return "Zap request doesn't have a 'p' tag.";
      if (!p[1].match(/^[a-f0-9]{64}$/))
        return "Zap request 'p' tag is not valid hex.";
      let e = zapRequest.tags.find(([t, v]) => t === "e" && v);
      if (e && !e[1].match(/^[a-f0-9]{64}$/))
        return "Zap request 'e' tag is not valid hex.";
      let relays = zapRequest.tags.find(([t, v]) => t === "relays" && v);
      if (!relays)
        return "Zap request doesn't have a 'relays' tag.";
      return null;
    }
    function makeZapReceipt({
      zapRequest,
      preimage,
      bolt11,
      paidAt
    }) {
      let zr = JSON.parse(zapRequest);
      let tagsFromZapRequest = zr.tags.filter(
        ([t]) => t === "e" || t === "p" || t === "a"
      );
      let zap = {
        kind: 9735,
        created_at: Math.round(paidAt.getTime() / 1e3),
        content: "",
        tags: [
          ...tagsFromZapRequest,
          ["bolt11", bolt11],
          ["description", zapRequest]
        ]
      };
      if (preimage) {
        zap.tags.push(["preimage", preimage]);
      }
      return zap;
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=} start
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0 && stop) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const _relays = ["wss://relay.damus.io"];
    const pool = new SimplePool();
    const keyStore = writable("");
    const userProfile = writable({});
    let profiles = writable([]);
    let webSites = writable();
    let relays = writable([]);
    let theme = writable("light");
    let webNotifications = writable([]);
    async function loadProfiles() {
        return new Promise((resolve) => {
            web.storage.local.get("profiles", (value) => {
                if (value.profiles) {
                    profiles.set(value.profiles);
                }
                else {
                    web.storage.local.set({ profiles: [] });
                    profiles.set([]);
                }
                resolve();
            });
        });
    }
    async function saveProfiles() {
        return new Promise((resolve) => {
            web.storage.local.set({ profiles: get_store_value(profiles) });
            resolve();
        });
    }
    async function settingProfile(profile) {
        return new Promise((resolve) => {
            web.storage.local.set({ profile: "" });
            web.storage.local.set({ privateKey: profile.data.privateKey });
            web.storage.local.set({ profileName: profile.name });
            web.storage.local.set({ webSites: profile.data.webSites });
            web.storage.local.set({ relays: profile.data.relays });
            resolve();
        });
    }
    async function loadNotifications() {
        return new Promise((resolve) => {
            web.storage.local.get("notificationsSettings", (value) => {
                if (value.notificationsSettings) {
                    webNotifications.set(value.notificationsSettings);
                }
                else {
                    web.storage.local.set({
                        notificationsSettings: defaultWebNotificationSettings,
                    });
                    webNotifications.set(defaultWebNotificationSettings);
                }
                resolve();
            });
        });
    }
    async function updateNotification(name) {
        return new Promise((resolve) => {
            web.storage.local.get("notificationsSettings", (value) => {
                let notifications = value.notificationsSettings;
                notifications.forEach((notification) => {
                    if (notification.name === name) {
                        notification.state = !notification.state;
                    }
                });
                web.storage.local.set({ notificationsSettings: notifications });
                webNotifications.set(notifications);
                resolve();
            });
        });
    }
    async function switchTheme(themeName) {
        return new Promise((resolve) => {
            web.storage.local.set({ theme: themeName });
            theme.set(themeName);
            document.documentElement.setAttribute("data-theme", themeName);
            resolve();
        });
    }
    async function loadTheme() {
        return new Promise((resolve) => {
            web.storage.local.get("theme", (value) => {
                if (value.theme) {
                    theme.set(value.theme);
                    document.documentElement.setAttribute("data-theme", value.theme);
                }
                else {
                    web.storage.local.set({ theme: "cupcake" });
                    theme.set("cupcake");
                    document.documentElement.setAttribute("data-theme", "cupcake");
                }
                resolve();
            });
        });
    }
    function loadKeyInfo() {
        return new Promise(async (resolve) => {
            await Promise.all([getProfile(), loadWebSites(), loadRelays()]);
            resolve();
        });
    }
    function registerPrivateKey(value) {
        return new Promise((resolve) => {
            web.storage.local.set({ privateKey: value }, async () => {
                keyStore.set(value);
                await loadKeyInfo();
                resolve();
            });
        });
    }
    async function loadRelays() {
        return new Promise((resolve) => {
            web.storage.local.get("relays", (value) => {
                relays.set(value.relays || []);
                resolve(value.relays);
            });
        });
    }
    async function loadPrivateKey() {
        return new Promise((resolve) => {
            web.storage.local.get("privateKey", (value) => {
                keyStore.set(value.privateKey);
                resolve(value.privateKey);
                loadKeyInfo();
            });
        });
    }
    async function loadWebSites() {
        return new Promise((resolve) => {
            web.storage.local.get("webSites", (value) => {
                webSites.set(value.webSites);
                resolve(value.webSites);
            });
        });
    }
    webSites.subscribe((value) => {
        web.storage.local.set({ webSites: value });
    });
    async function getProfile() {
        if (!get_store_value(keyStore))
            return;
        try {
            pool
                .get(_relays, {
                authors: [getPublicKey(get_store_value(keyStore))],
                kinds: [0],
            })
                .then((event) => {
                const profile = JSON.parse(event.content);
                userProfile.set(profile);
                web.storage.local.set({ profile: profile });
            });
        }
        catch (error) {
            alert(error.message);
        }
        return new Promise((resolve) => {
            web.storage.local.get("profile", (value) => {
                userProfile.set(value.profile);
                resolve(value.profile);
            });
        });
    }
    async function verifyKey(value) {
        return new Promise(async (resolve, reject) => {
            if (value.length < 63) {
                reject("Invalid key");
                return;
            }
            let decodedValue;
            if (value.toString().startsWith("nsec")) {
                try {
                    decodedValue = nip19_exports.decode(value).data;
                }
                catch (e) {
                    reject("Invalid key");
                    return;
                }
            }
            else if (value.length === 64) {
                decodedValue = value;
            }
            else {
                reject("Invalid key");
                return;
            }
            resolve(decodedValue);
        });
    }
    async function addKey(value) {
        if (!value)
            return;
        return new Promise(async (resolve, reject) => {
            try {
                let decodedValue = await verifyKey(value);
                await registerPrivateKey(decodedValue);
                resolve();
            }
            catch (e) {
                reject(e);
            }
        });
    }
    async function logout() {
        return new Promise(async (resolve) => {
            let value = await web.storage.local.get("profileName");
            await loadPrivateKey();
            await loadKeyInfo();
            let _webSites = await web.storage.local.get("webSites");
            let _relays = await web.storage.local.get("relays");
            console.log(get_store_value(webSites), get_store_value(relays), _webSites, _relays);
            const _profiles = get_store_value(profiles);
            const profile = {
                name: value.profileName,
                data: {
                    privateKey: get_store_value(keyStore),
                    webSites: get_store_value(webSites),
                    relays: get_store_value(relays),
                },
            };
            console.log(profile);
            const index = _profiles.findIndex((p) => p.name === value.profileName);
            _profiles[index] = profile;
            await web.storage.local.set({ profiles: _profiles });
            relays.set([]);
            keyStore.set("");
            userProfile.set({});
            webSites.set({});
            return new Promise(async (resolve) => {
                await web.storage.local.set({ privateKey: "" }, async () => {
                    await web.storage.local.set({ profile: "" }, () => {
                        resolve();
                    });
                });
            });
        });
    }

    /* src/components/Settings.svelte generated by Svelte v3.59.2 */
    const file$7 = "src/components/Settings.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[29] = list[i];
    	return child_ctx;
    }

    function get_each_context_3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[38] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[35] = list[i];
    	child_ctx[37] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[32] = list[i];
    	return child_ctx;
    }

    // (141:29) 
    function create_if_block_2$3(ctx) {
    	let div6;
    	let button0;
    	let svg0;
    	let path0;
    	let path1;
    	let t0;
    	let t1;
    	let hr0;
    	let t2;
    	let div0;
    	let span0;
    	let t4;
    	let input0;
    	let input0_type_value;
    	let input0_value_value;
    	let t5;
    	let button1;
    	let svg1;
    	let g0;
    	let path2;
    	let path3;
    	let t6;
    	let div1;
    	let span1;
    	let t8;
    	let input1;
    	let t9;
    	let button2;
    	let svg2;
    	let g1;
    	let path4;
    	let path5;
    	let t10;
    	let div2;
    	let span2;
    	let t12;
    	let input2;
    	let t13;
    	let button3;
    	let svg3;
    	let g2;
    	let path6;
    	let path7;
    	let t14;
    	let hr1;
    	let t15;
    	let div5;
    	let span3;
    	let t17;
    	let div3;
    	let table;
    	let thead;
    	let tr_1;
    	let th0;
    	let t19;
    	let th1;
    	let t21;
    	let tbody;
    	let t22;
    	let div4;
    	let input3;
    	let t23;
    	let button4;
    	let mounted;
    	let dispose;
    	let each_value_3 = /*$relays*/ ctx[8];
    	validate_each_argument(each_value_3);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_3.length; i += 1) {
    		each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
    	}

    	const block = {
    		c: function create() {
    			div6 = element("div");
    			button0 = element("button");
    			svg0 = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			t0 = text("\n        show profile");
    			t1 = space();
    			hr0 = element("hr");
    			t2 = space();
    			div0 = element("div");
    			span0 = element("span");
    			span0.textContent = "Private Key";
    			t4 = space();
    			input0 = element("input");
    			t5 = space();
    			button1 = element("button");
    			svg1 = svg_element("svg");
    			g0 = svg_element("g");
    			path2 = svg_element("path");
    			path3 = svg_element("path");
    			t6 = space();
    			div1 = element("div");
    			span1 = element("span");
    			span1.textContent = "Public Key (Hex)";
    			t8 = space();
    			input1 = element("input");
    			t9 = space();
    			button2 = element("button");
    			svg2 = svg_element("svg");
    			g1 = svg_element("g");
    			path4 = svg_element("path");
    			path5 = svg_element("path");
    			t10 = space();
    			div2 = element("div");
    			span2 = element("span");
    			span2.textContent = "Public Key (npub)";
    			t12 = space();
    			input2 = element("input");
    			t13 = space();
    			button3 = element("button");
    			svg3 = svg_element("svg");
    			g2 = svg_element("g");
    			path6 = svg_element("path");
    			path7 = svg_element("path");
    			t14 = space();
    			hr1 = element("hr");
    			t15 = space();
    			div5 = element("div");
    			span3 = element("span");
    			span3.textContent = "Relays";
    			t17 = space();
    			div3 = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr_1 = element("tr");
    			th0 = element("th");
    			th0.textContent = "Relay";
    			t19 = space();
    			th1 = element("th");
    			th1.textContent = "Actions";
    			t21 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t22 = space();
    			div4 = element("div");
    			input3 = element("input");
    			t23 = space();
    			button4 = element("button");
    			button4.textContent = "Add";
    			attr_dev(path0, "fill", "currentColor");
    			attr_dev(path0, "d", "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zM7.35 18.5C8.66 17.56 10.26 17 12 17s3.34.56 4.65 1.5c-1.31.94-2.91 1.5-4.65 1.5s-3.34-.56-4.65-1.5zm10.79-1.38a9.947 9.947 0 0 0-12.28 0A7.957 7.957 0 0 1 4 12c0-4.42 3.58-8 8-8s8 3.58 8 8c0 1.95-.7 3.73-1.86 5.12z");
    			add_location(path0, file$7, 155, 11, 4913);
    			attr_dev(path1, "fill", "currentColor");
    			attr_dev(path1, "d", "M12 6c-1.93 0-3.5 1.57-3.5 3.5S10.07 13 12 13s3.5-1.57 3.5-3.5S13.93 6 12 6zm0 5c-.83 0-1.5-.67-1.5-1.5S11.17 8 12 8s1.5.67 1.5 1.5S12.83 11 12 11z");
    			add_location(path1, file$7, 158, 12, 5261);
    			attr_dev(svg0, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg0, "width", "24");
    			attr_dev(svg0, "height", "24");
    			attr_dev(svg0, "viewBox", "0 0 24 24");
    			add_location(svg0, file$7, 150, 8, 4779);
    			attr_dev(button0, "class", "btn btn-base-100 bg-base-100 bordered border-2 border-base-200 my-8 ml-28");
    			add_location(button0, file$7, 142, 6, 4510);
    			add_location(hr0, file$7, 165, 6, 5534);
    			attr_dev(span0, "class", "w-full pb-1 pl-2 font-sans font-bold");
    			add_location(span0, file$7, 167, 8, 5614);

    			attr_dev(input0, "type", input0_type_value = /*secretEchoMode*/ ctx[3] === /*EchoMode*/ ctx[1].Password
    			? "password"
    			: "text");

    			input0.value = input0_value_value = nip19_exports.nsecEncode(/*$keyStore*/ ctx[6]);
    			attr_dev(input0, "placeholder", "nsec");
    			attr_dev(input0, "class", "input input-bordered w-9/12");
    			add_location(input0, file$7, 168, 8, 5692);
    			attr_dev(path2, "d", "M20.998 10c-.012-2.175-.108-3.353-.877-4.121C19.243 5 17.828 5 15 5h-3c-2.828 0-4.243 0-5.121.879C6 6.757 6 8.172 6 11v5c0 2.828 0 4.243.879 5.121C7.757 22 9.172 22 12 22h3c2.828 0 4.243 0 5.121-.879C21 20.243 21 18.828 21 16v-1");
    			add_location(path2, file$7, 193, 15, 6566);
    			attr_dev(path3, "d", "M3 10v6a3 3 0 0 0 3 3M18 5a3 3 0 0 0-3-3h-4C7.229 2 5.343 2 4.172 3.172C3.518 3.825 3.229 4.7 3.102 6");
    			add_location(path3, file$7, 195, 16, 6837);
    			attr_dev(g0, "fill", "none");
    			attr_dev(g0, "stroke", "currentColor");
    			attr_dev(g0, "stroke-linecap", "round");
    			attr_dev(g0, "stroke-width", "1.5");
    			add_location(g0, file$7, 188, 13, 6416);
    			attr_dev(svg1, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg1, "width", "24");
    			attr_dev(svg1, "height", "24");
    			attr_dev(svg1, "viewBox", "0 0 24 24");
    			add_location(svg1, file$7, 183, 10, 6272);
    			attr_dev(button1, "class", "btn w-2/12 p-2");
    			add_location(button1, file$7, 176, 8, 6040);
    			attr_dev(div0, "class", "p-4 w-full flex flex-row flex-wrap space-x-2");
    			add_location(div0, file$7, 166, 6, 5547);
    			attr_dev(span1, "class", "w-full pb-1 pl-2 font-sans font-bold");
    			add_location(span1, file$7, 203, 8, 7120);
    			attr_dev(input1, "type", "text");
    			input1.value = /*hexPubKey*/ ctx[9];
    			attr_dev(input1, "class", "input input-bordered w-9/12");
    			add_location(input1, file$7, 206, 8, 7223);
    			attr_dev(path4, "d", "M20.998 10c-.012-2.175-.108-3.353-.877-4.121C19.243 5 17.828 5 15 5h-3c-2.828 0-4.243 0-5.121.879C6 6.757 6 8.172 6 11v5c0 2.828 0 4.243.879 5.121C7.757 22 9.172 22 12 22h3c2.828 0 4.243 0 5.121-.879C21 20.243 21 18.828 21 16v-1");
    			add_location(path4, file$7, 228, 15, 7865);
    			attr_dev(path5, "d", "M3 10v6a3 3 0 0 0 3 3M18 5a3 3 0 0 0-3-3h-4C7.229 2 5.343 2 4.172 3.172C3.518 3.825 3.229 4.7 3.102 6");
    			add_location(path5, file$7, 230, 16, 8136);
    			attr_dev(g1, "fill", "none");
    			attr_dev(g1, "stroke", "currentColor");
    			attr_dev(g1, "stroke-linecap", "round");
    			attr_dev(g1, "stroke-width", "1.5");
    			add_location(g1, file$7, 223, 13, 7715);
    			attr_dev(svg2, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg2, "width", "24");
    			attr_dev(svg2, "height", "24");
    			attr_dev(svg2, "viewBox", "0 0 24 24");
    			add_location(svg2, file$7, 218, 10, 7571);
    			attr_dev(button2, "class", "btn w-2/12 p-2");
    			add_location(button2, file$7, 211, 8, 7347);
    			attr_dev(div1, "class", "p-4 w-full flex flex-row flex-wrap space-x-2");
    			add_location(div1, file$7, 202, 6, 7053);
    			attr_dev(span2, "class", "w-full pb-1 pl-2 font-sans font-bold");
    			add_location(span2, file$7, 238, 8, 8419);
    			attr_dev(input2, "type", "text");
    			input2.value = /*nPubKey*/ ctx[10];
    			attr_dev(input2, "class", "input input-bordered w-9/12");
    			add_location(input2, file$7, 241, 8, 8523);
    			attr_dev(path6, "d", "M20.998 10c-.012-2.175-.108-3.353-.877-4.121C19.243 5 17.828 5 15 5h-3c-2.828 0-4.243 0-5.121.879C6 6.757 6 8.172 6 11v5c0 2.828 0 4.243.879 5.121C7.757 22 9.172 22 12 22h3c2.828 0 4.243 0 5.121-.879C21 20.243 21 18.828 21 16v-1");
    			add_location(path6, file$7, 263, 15, 9151);
    			attr_dev(path7, "d", "M3 10v6a3 3 0 0 0 3 3M18 5a3 3 0 0 0-3-3h-4C7.229 2 5.343 2 4.172 3.172C3.518 3.825 3.229 4.7 3.102 6");
    			add_location(path7, file$7, 265, 16, 9422);
    			attr_dev(g2, "fill", "none");
    			attr_dev(g2, "stroke", "currentColor");
    			attr_dev(g2, "stroke-linecap", "round");
    			attr_dev(g2, "stroke-width", "1.5");
    			add_location(g2, file$7, 258, 13, 9001);
    			attr_dev(svg3, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg3, "width", "24");
    			attr_dev(svg3, "height", "24");
    			attr_dev(svg3, "viewBox", "0 0 24 24");
    			add_location(svg3, file$7, 253, 10, 8857);
    			attr_dev(button3, "class", "btn w-2/12 p-2");
    			add_location(button3, file$7, 246, 8, 8645);
    			attr_dev(div2, "class", "p-4 w-full flex flex-row flex-wrap space-x-2");
    			add_location(div2, file$7, 237, 6, 8352);
    			add_location(hr1, file$7, 272, 6, 9638);
    			attr_dev(span3, "class", "w-full pb-1 pl-2 font-sans font-bold");
    			add_location(span3, file$7, 274, 8, 9718);
    			add_location(th0, file$7, 280, 16, 9953);
    			attr_dev(th1, "class", "text-center w-16");
    			add_location(th1, file$7, 281, 16, 9984);
    			add_location(tr_1, file$7, 279, 14, 9932);
    			add_location(thead, file$7, 278, 12, 9910);
    			add_location(tbody, file$7, 284, 12, 10079);
    			attr_dev(table, "class", "table table-zebra");
    			add_location(table, file$7, 276, 10, 9838);
    			attr_dev(div3, "class", "overflow-x-auto w-full");
    			add_location(div3, file$7, 275, 8, 9791);
    			attr_dev(input3, "type", "text");
    			attr_dev(input3, "class", "input input-bordered w-9/12 h-10");
    			attr_dev(input3, "id", "value");
    			attr_dev(input3, "placeholder", "Enter relay url");
    			add_location(input3, file$7, 345, 10, 12824);
    			attr_dev(button4, "class", "btn btn-sm w-2/12 h-10");
    			add_location(button4, file$7, 352, 10, 13032);
    			attr_dev(div4, "class", "w-full flex flex-row flex-wrap space-x-2 mt-4");
    			add_location(div4, file$7, 344, 8, 12754);
    			attr_dev(div5, "class", "p-4 w-full flex flex-row flex-wrap space-x-2");
    			add_location(div5, file$7, 273, 6, 9651);
    			attr_dev(div6, "class", "w-full");
    			add_location(div6, file$7, 141, 4, 4483);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div6, anchor);
    			append_dev(div6, button0);
    			append_dev(button0, svg0);
    			append_dev(svg0, path0);
    			append_dev(svg0, path1);
    			append_dev(button0, t0);
    			append_dev(div6, t1);
    			append_dev(div6, hr0);
    			append_dev(div6, t2);
    			append_dev(div6, div0);
    			append_dev(div0, span0);
    			append_dev(div0, t4);
    			append_dev(div0, input0);
    			append_dev(div0, t5);
    			append_dev(div0, button1);
    			append_dev(button1, svg1);
    			append_dev(svg1, g0);
    			append_dev(g0, path2);
    			append_dev(g0, path3);
    			append_dev(div6, t6);
    			append_dev(div6, div1);
    			append_dev(div1, span1);
    			append_dev(div1, t8);
    			append_dev(div1, input1);
    			append_dev(div1, t9);
    			append_dev(div1, button2);
    			append_dev(button2, svg2);
    			append_dev(svg2, g1);
    			append_dev(g1, path4);
    			append_dev(g1, path5);
    			append_dev(div6, t10);
    			append_dev(div6, div2);
    			append_dev(div2, span2);
    			append_dev(div2, t12);
    			append_dev(div2, input2);
    			append_dev(div2, t13);
    			append_dev(div2, button3);
    			append_dev(button3, svg3);
    			append_dev(svg3, g2);
    			append_dev(g2, path6);
    			append_dev(g2, path7);
    			append_dev(div6, t14);
    			append_dev(div6, hr1);
    			append_dev(div6, t15);
    			append_dev(div6, div5);
    			append_dev(div5, span3);
    			append_dev(div5, t17);
    			append_dev(div5, div3);
    			append_dev(div3, table);
    			append_dev(table, thead);
    			append_dev(thead, tr_1);
    			append_dev(tr_1, th0);
    			append_dev(tr_1, t19);
    			append_dev(tr_1, th1);
    			append_dev(table, t21);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(tbody, null);
    				}
    			}

    			append_dev(div5, t22);
    			append_dev(div5, div4);
    			append_dev(div4, input3);
    			set_input_value(input3, /*relayInput*/ ctx[2]);
    			append_dev(div4, t23);
    			append_dev(div4, button4);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler_4*/ ctx[16], false, false, false, false),
    					listen_dev(input0, "focus", /*focus_handler*/ ctx[17], false, false, false, false),
    					listen_dev(input0, "blur", /*blur_handler*/ ctx[18], false, false, false, false),
    					listen_dev(button1, "click", /*click_handler_5*/ ctx[19], false, false, false, false),
    					listen_dev(button2, "click", /*click_handler_6*/ ctx[20], false, false, false, false),
    					listen_dev(button3, "click", /*click_handler_7*/ ctx[21], false, false, false, false),
    					listen_dev(input3, "input", /*input3_input_handler*/ ctx[24]),
    					listen_dev(button4, "click", /*click_handler_10*/ ctx[25], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*secretEchoMode, EchoMode*/ 10 && input0_type_value !== (input0_type_value = /*secretEchoMode*/ ctx[3] === /*EchoMode*/ ctx[1].Password
    			? "password"
    			: "text")) {
    				attr_dev(input0, "type", input0_type_value);
    			}

    			if (dirty[0] & /*$keyStore*/ 64 && input0_value_value !== (input0_value_value = nip19_exports.nsecEncode(/*$keyStore*/ ctx[6])) && input0.value !== input0_value_value) {
    				prop_dev(input0, "value", input0_value_value);
    			}

    			if (dirty[0] & /*$relays, showNotification*/ 2304) {
    				each_value_3 = /*$relays*/ ctx[8];
    				validate_each_argument(each_value_3);
    				let i;

    				for (i = 0; i < each_value_3.length; i += 1) {
    					const child_ctx = get_each_context_3(ctx, each_value_3, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_3.length;
    			}

    			if (dirty[0] & /*relayInput*/ 4 && input3.value !== /*relayInput*/ ctx[2]) {
    				set_input_value(input3, /*relayInput*/ ctx[2]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div6);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$3.name,
    		type: "if",
    		source: "(141:29) ",
    		ctx
    	});

    	return block;
    }

    // (114:29) 
    function create_if_block_1$3(ctx) {
    	let div;
    	let table;
    	let thead;
    	let tr_1;
    	let th0;
    	let t1;
    	let th1;
    	let t3;
    	let th2;
    	let t5;
    	let tbody;
    	let each_value_2 = reverseArray(/*currentSite*/ ctx[5].history);
    	validate_each_argument(each_value_2);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr_1 = element("tr");
    			th0 = element("th");
    			th0.textContent = "Status";
    			t1 = space();
    			th1 = element("th");
    			th1.textContent = "Type";
    			t3 = space();
    			th2 = element("th");
    			th2.textContent = "Time";
    			t5 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(th0, "class", "fond-bold");
    			add_location(th0, file$7, 119, 12, 3781);
    			add_location(th1, file$7, 120, 12, 3827);
    			add_location(th2, file$7, 121, 12, 3853);
    			add_location(tr_1, file$7, 118, 10, 3764);
    			add_location(thead, file$7, 117, 8, 3746);
    			add_location(tbody, file$7, 124, 8, 3908);
    			attr_dev(table, "class", "table table-zebra w-full");
    			add_location(table, file$7, 116, 6, 3697);
    			attr_dev(div, "class", "w-full");
    			add_location(div, file$7, 114, 4, 3632);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, table);
    			append_dev(table, thead);
    			append_dev(thead, tr_1);
    			append_dev(tr_1, th0);
    			append_dev(tr_1, t1);
    			append_dev(tr_1, th1);
    			append_dev(tr_1, t3);
    			append_dev(tr_1, th2);
    			append_dev(table, t5);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(tbody, null);
    				}
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*currentSite*/ 32) {
    				each_value_2 = reverseArray(/*currentSite*/ ctx[5].history);
    				validate_each_argument(each_value_2);
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_2.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(114:29) ",
    		ctx
    	});

    	return block;
    }

    // (63:2) {#if currentTab === 0}
    function create_if_block$4(ctx) {
    	let div2;
    	let div1;
    	let span0;
    	let t1;
    	let div0;
    	let table;
    	let thead;
    	let tr_1;
    	let th0;
    	let t3;
    	let th1;
    	let t5;
    	let th2;
    	let t7;
    	let tbody;
    	let t8;
    	let hr;
    	let t9;
    	let center;
    	let p;
    	let t10;
    	let span1;
    	let each_value_1 = /*$webNotifications*/ ctx[7];
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			span0 = element("span");
    			span0.textContent = "Notifications";
    			t1 = space();
    			div0 = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr_1 = element("tr");
    			th0 = element("th");
    			th0.textContent = "Name";
    			t3 = space();
    			th1 = element("th");
    			th1.textContent = "State";
    			t5 = space();
    			th2 = element("th");
    			th2.textContent = "Actions";
    			t7 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t8 = space();
    			hr = element("hr");
    			t9 = space();
    			center = element("center");
    			p = element("p");
    			t10 = text("keys.band ");
    			span1 = element("span");
    			span1.textContent = "V0.1.0";
    			attr_dev(span0, "class", "w-full pb-1 pl-2 font-sans font-bold");
    			add_location(span0, file$7, 66, 8, 1974);
    			add_location(th0, file$7, 72, 16, 2216);
    			add_location(th1, file$7, 73, 16, 2246);
    			attr_dev(th2, "class", "text-center w-16");
    			add_location(th2, file$7, 74, 16, 2277);
    			add_location(tr_1, file$7, 71, 14, 2195);
    			add_location(thead, file$7, 70, 12, 2173);
    			add_location(tbody, file$7, 77, 12, 2372);
    			attr_dev(table, "class", "table table-zebra");
    			add_location(table, file$7, 68, 10, 2101);
    			attr_dev(div0, "class", "overflow-x-auto w-full");
    			add_location(div0, file$7, 67, 8, 2054);
    			attr_dev(div1, "class", "p-4 w-full flex flex-row flex-wrap space-x-2");
    			add_location(div1, file$7, 65, 6, 1907);
    			add_location(hr, file$7, 106, 6, 3440);
    			attr_dev(span1, "class", "text-primary");
    			add_location(span1, file$7, 109, 20, 3517);
    			attr_dev(p, "class", "pt-4 font-sans");
    			add_location(p, file$7, 108, 8, 3470);
    			add_location(center, file$7, 107, 6, 3453);
    			attr_dev(div2, "class", "w-full");
    			add_location(div2, file$7, 63, 4, 1851);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			append_dev(div1, span0);
    			append_dev(div1, t1);
    			append_dev(div1, div0);
    			append_dev(div0, table);
    			append_dev(table, thead);
    			append_dev(thead, tr_1);
    			append_dev(tr_1, th0);
    			append_dev(tr_1, t3);
    			append_dev(tr_1, th1);
    			append_dev(tr_1, t5);
    			append_dev(tr_1, th2);
    			append_dev(table, t7);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(tbody, null);
    				}
    			}

    			append_dev(div2, t8);
    			append_dev(div2, hr);
    			append_dev(div2, t9);
    			append_dev(div2, center);
    			append_dev(center, p);
    			append_dev(p, t10);
    			append_dev(p, span1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*$webNotifications*/ 128) {
    				each_value_1 = /*$webNotifications*/ ctx[7];
    				validate_each_argument(each_value_1);
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(63:2) {#if currentTab === 0}",
    		ctx
    	});

    	return block;
    }

    // (287:14) {#each $relays as relay}
    function create_each_block_3(ctx) {
    	let tr_1;
    	let td0;
    	let t0_value = /*relay*/ ctx[38].url + "";
    	let t0;
    	let t1;
    	let td1;
    	let button0;
    	let svg0;
    	let g;
    	let path0;
    	let path1;
    	let t2;
    	let button1;
    	let svg1;
    	let path2;
    	let t3;
    	let mounted;
    	let dispose;

    	function click_handler_8() {
    		return /*click_handler_8*/ ctx[22](/*relay*/ ctx[38]);
    	}

    	function click_handler_9() {
    		return /*click_handler_9*/ ctx[23](/*relay*/ ctx[38]);
    	}

    	const block = {
    		c: function create() {
    			tr_1 = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			button0 = element("button");
    			svg0 = svg_element("svg");
    			g = svg_element("g");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			t2 = space();
    			button1 = element("button");
    			svg1 = svg_element("svg");
    			path2 = svg_element("path");
    			t3 = space();
    			add_location(td0, file$7, 288, 18, 10194);
    			attr_dev(path0, "d", "M20.998 10c-.012-2.175-.108-3.353-.877-4.121C19.243 5 17.828 5 15 5h-3c-2.828 0-4.243 0-5.121.879C6 6.757 6 8.172 6 11v5c0 2.828 0 4.243.879 5.121C7.757 22 9.172 22 12 22h3c2.828 0 4.243 0 5.121-.879C21 20.243 21 18.828 21 16v-1");
    			add_location(path0, file$7, 308, 27, 11020);
    			attr_dev(path1, "d", "M3 10v6a3 3 0 0 0 3 3M18 5a3 3 0 0 0-3-3h-4C7.229 2 5.343 2 4.172 3.172C3.518 3.825 3.229 4.7 3.102 6");
    			add_location(path1, file$7, 310, 28, 11315);
    			attr_dev(g, "fill", "none");
    			attr_dev(g, "stroke", "currentColor");
    			attr_dev(g, "stroke-linecap", "round");
    			attr_dev(g, "stroke-width", "1.5");
    			add_location(g, file$7, 303, 25, 10810);
    			attr_dev(svg0, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg0, "width", "24");
    			attr_dev(svg0, "height", "24");
    			attr_dev(svg0, "viewBox", "0 0 24 24");
    			add_location(svg0, file$7, 298, 22, 10606);
    			attr_dev(button0, "class", "btn btn-xs h-8");
    			add_location(button0, file$7, 290, 20, 10281);
    			attr_dev(path2, "fill", "currentColor");
    			attr_dev(path2, "d", "M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59L7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12L5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 1 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z");
    			add_location(path2, file$7, 332, 25, 12250);
    			attr_dev(svg1, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg1, "width", "24");
    			attr_dev(svg1, "height", "24");
    			attr_dev(svg1, "viewBox", "0 0 24 24");
    			add_location(svg1, file$7, 327, 22, 12046);
    			attr_dev(button1, "class", "btn btn-xs h-8");
    			add_location(button1, file$7, 316, 20, 11592);
    			attr_dev(td1, "class", "flex space-x-2");
    			add_location(td1, file$7, 289, 18, 10233);
    			add_location(tr_1, file$7, 287, 16, 10171);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr_1, anchor);
    			append_dev(tr_1, td0);
    			append_dev(td0, t0);
    			append_dev(tr_1, t1);
    			append_dev(tr_1, td1);
    			append_dev(td1, button0);
    			append_dev(button0, svg0);
    			append_dev(svg0, g);
    			append_dev(g, path0);
    			append_dev(g, path1);
    			append_dev(td1, t2);
    			append_dev(td1, button1);
    			append_dev(button1, svg1);
    			append_dev(svg1, path2);
    			append_dev(tr_1, t3);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", click_handler_8, false, false, false, false),
    					listen_dev(button1, "click", click_handler_9, false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*$relays*/ 256 && t0_value !== (t0_value = /*relay*/ ctx[38].url + "")) set_data_dev(t0, t0_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr_1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_3.name,
    		type: "each",
    		source: "(287:14) {#each $relays as relay}",
    		ctx
    	});

    	return block;
    }

    // (126:10) {#each reverseArray(currentSite.history) as site, i}
    function create_each_block_2(ctx) {
    	let tr_1;
    	let td0;
    	let t0_value = (/*site*/ ctx[35].accepted || false ? "Yes" : "No") + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2_value = /*site*/ ctx[35].type + "";
    	let t2;
    	let t3;
    	let td2;
    	let t4_value = timeAgo(new Date(/*site*/ ctx[35].created_at)) + "";
    	let t4;
    	let t5;

    	const block = {
    		c: function create() {
    			tr_1 = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = text(t2_value);
    			t3 = space();
    			td2 = element("td");
    			t4 = text(t4_value);
    			t5 = space();
    			attr_dev(td0, "class", "text fond-bold");
    			toggle_class(td0, "text-accent", /*site*/ ctx[35].accepted || false);
    			toggle_class(td0, "text-secondary", !/*site*/ ctx[35].accepted || false);
    			add_location(td0, file$7, 127, 14, 4010);
    			attr_dev(td1, "class", "text fond-bold");
    			add_location(td1, file$7, 133, 14, 4266);
    			add_location(td2, file$7, 134, 14, 4324);
    			add_location(tr_1, file$7, 126, 12, 3991);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr_1, anchor);
    			append_dev(tr_1, td0);
    			append_dev(td0, t0);
    			append_dev(tr_1, t1);
    			append_dev(tr_1, td1);
    			append_dev(td1, t2);
    			append_dev(tr_1, t3);
    			append_dev(tr_1, td2);
    			append_dev(td2, t4);
    			append_dev(tr_1, t5);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*currentSite*/ 32 && t0_value !== (t0_value = (/*site*/ ctx[35].accepted || false ? "Yes" : "No") + "")) set_data_dev(t0, t0_value);

    			if (dirty[0] & /*currentSite*/ 32) {
    				toggle_class(td0, "text-accent", /*site*/ ctx[35].accepted || false);
    			}

    			if (dirty[0] & /*currentSite*/ 32) {
    				toggle_class(td0, "text-secondary", !/*site*/ ctx[35].accepted || false);
    			}

    			if (dirty[0] & /*currentSite*/ 32 && t2_value !== (t2_value = /*site*/ ctx[35].type + "")) set_data_dev(t2, t2_value);
    			if (dirty[0] & /*currentSite*/ 32 && t4_value !== (t4_value = timeAgo(new Date(/*site*/ ctx[35].created_at)) + "")) set_data_dev(t4, t4_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(126:10) {#each reverseArray(currentSite.history) as site, i}",
    		ctx
    	});

    	return block;
    }

    // (80:14) {#each $webNotifications as notif}
    function create_each_block_1(ctx) {
    	let tr_1;
    	let td0;
    	let t0_value = tr(/*notif*/ ctx[32].name || "") + "";
    	let t0;
    	let t1;
    	let td1;
    	let span;
    	let t2_value = (/*notif*/ ctx[32] ? "enabled" : "disabled") + "";
    	let t2;
    	let t3;
    	let td2;
    	let button;
    	let t4_value = (/*notif*/ ctx[32].state ? "Disable" : "Enable") + "";
    	let t4;
    	let t5;
    	let mounted;
    	let dispose;

    	function click_handler_3() {
    		return /*click_handler_3*/ ctx[15](/*notif*/ ctx[32]);
    	}

    	const block = {
    		c: function create() {
    			tr_1 = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			span = element("span");
    			t2 = text(t2_value);
    			t3 = space();
    			td2 = element("td");
    			button = element("button");
    			t4 = text(t4_value);
    			t5 = space();
    			add_location(td0, file$7, 81, 18, 2497);
    			attr_dev(span, "class", "badge badge-sm");
    			toggle_class(span, "badge-secondary", /*notif*/ ctx[32].state == false);
    			toggle_class(span, "badge-accent", /*notif*/ ctx[32].state == true);
    			add_location(span, file$7, 83, 20, 2573);
    			add_location(td1, file$7, 82, 18, 2548);
    			attr_dev(button, "class", "btn btn-xs h-8 rounded-2");
    			toggle_class(button, "btn-accent", /*notif*/ ctx[32].state == false);
    			toggle_class(button, "btn-secondary", /*notif*/ ctx[32].state == true);
    			add_location(button, file$7, 91, 20, 2928);
    			attr_dev(td2, "class", "flex space-x-2");
    			add_location(td2, file$7, 90, 18, 2880);
    			add_location(tr_1, file$7, 80, 16, 2474);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr_1, anchor);
    			append_dev(tr_1, td0);
    			append_dev(td0, t0);
    			append_dev(tr_1, t1);
    			append_dev(tr_1, td1);
    			append_dev(td1, span);
    			append_dev(span, t2);
    			append_dev(tr_1, t3);
    			append_dev(tr_1, td2);
    			append_dev(td2, button);
    			append_dev(button, t4);
    			append_dev(tr_1, t5);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", click_handler_3, false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*$webNotifications*/ 128 && t0_value !== (t0_value = tr(/*notif*/ ctx[32].name || "") + "")) set_data_dev(t0, t0_value);
    			if (dirty[0] & /*$webNotifications*/ 128 && t2_value !== (t2_value = (/*notif*/ ctx[32] ? "enabled" : "disabled") + "")) set_data_dev(t2, t2_value);

    			if (dirty[0] & /*$webNotifications*/ 128) {
    				toggle_class(span, "badge-secondary", /*notif*/ ctx[32].state == false);
    			}

    			if (dirty[0] & /*$webNotifications*/ 128) {
    				toggle_class(span, "badge-accent", /*notif*/ ctx[32].state == true);
    			}

    			if (dirty[0] & /*$webNotifications*/ 128 && t4_value !== (t4_value = (/*notif*/ ctx[32].state ? "Disable" : "Enable") + "")) set_data_dev(t4, t4_value);

    			if (dirty[0] & /*$webNotifications*/ 128) {
    				toggle_class(button, "btn-accent", /*notif*/ ctx[32].state == false);
    			}

    			if (dirty[0] & /*$webNotifications*/ 128) {
    				toggle_class(button, "btn-secondary", /*notif*/ ctx[32].state == true);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr_1);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(80:14) {#each $webNotifications as notif}",
    		ctx
    	});

    	return block;
    }

    // (381:2) {#each notifications as toast}
    function create_each_block$1(ctx) {
    	let div;
    	let span;
    	let t0_value = /*toast*/ ctx[29].message + "";
    	let t0;
    	let t1;

    	const block = {
    		c: function create() {
    			div = element("div");
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			attr_dev(span, "class", "flex flex-row space-x-4");
    			add_location(span, file$7, 382, 6, 13772);
    			attr_dev(div, "class", "alert alert-white bordered border-1 border-gray-300");
    			add_location(div, file$7, 381, 4, 13700);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, span);
    			append_dev(span, t0);
    			append_dev(div, t1);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*notifications*/ 1 && t0_value !== (t0_value = /*toast*/ ctx[29].message + "")) set_data_dev(t0, t0_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(381:2) {#each notifications as toast}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let div0;
    	let button0;
    	let t1;
    	let button1;
    	let t3;
    	let button2;
    	let t5;
    	let div1;
    	let t6;
    	let div2;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*currentTab*/ ctx[4] === 0) return create_if_block$4;
    		if (/*currentTab*/ ctx[4] === 1) return create_if_block_1$3;
    		if (/*currentTab*/ ctx[4] === 2) return create_if_block_2$3;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);
    	let each_value = /*notifications*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			button0 = element("button");
    			button0.textContent = "General";
    			t1 = space();
    			button1 = element("button");
    			button1.textContent = "History";
    			t3 = space();
    			button2 = element("button");
    			button2.textContent = "Account";
    			t5 = space();
    			div1 = element("div");
    			if (if_block) if_block.c();
    			t6 = space();
    			div2 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(button0, "class", "tab tab-bordered w-1/3");
    			toggle_class(button0, "tab-active", /*currentTab*/ ctx[4] === 0);
    			add_location(button0, file$7, 44, 2, 1366);
    			attr_dev(button1, "class", "tab tab-bordered w-1/3");
    			toggle_class(button1, "tab-active", /*currentTab*/ ctx[4] === 1);
    			add_location(button1, file$7, 49, 2, 1509);
    			attr_dev(button2, "class", "tab tab-bordered w-1/3");
    			toggle_class(button2, "tab-active", /*currentTab*/ ctx[4] === 2);
    			add_location(button2, file$7, 54, 2, 1652);
    			attr_dev(div0, "class", "tabs w-full");
    			add_location(div0, file$7, 43, 0, 1338);
    			attr_dev(div1, "class", "w-full");
    			add_location(div1, file$7, 61, 0, 1801);
    			attr_dev(div2, "class", "toast toast-center opacity-50");
    			add_location(div2, file$7, 379, 0, 13619);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, button0);
    			append_dev(div0, t1);
    			append_dev(div0, button1);
    			append_dev(div0, t3);
    			append_dev(div0, button2);
    			insert_dev(target, t5, anchor);
    			insert_dev(target, div1, anchor);
    			if (if_block) if_block.m(div1, null);
    			insert_dev(target, t6, anchor);
    			insert_dev(target, div2, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div2, null);
    				}
    			}

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[12], false, false, false, false),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[13], false, false, false, false),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[14], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*currentTab*/ 16) {
    				toggle_class(button0, "tab-active", /*currentTab*/ ctx[4] === 0);
    			}

    			if (dirty[0] & /*currentTab*/ 16) {
    				toggle_class(button1, "tab-active", /*currentTab*/ ctx[4] === 1);
    			}

    			if (dirty[0] & /*currentTab*/ 16) {
    				toggle_class(button2, "tab-active", /*currentTab*/ ctx[4] === 2);
    			}

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div1, null);
    				}
    			}

    			if (dirty[0] & /*notifications*/ 1) {
    				each_value = /*notifications*/ ctx[0];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div2, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t5);
    			if (detaching) detach_dev(div1);

    			if (if_block) {
    				if_block.d();
    			}

    			if (detaching) detach_dev(t6);
    			if (detaching) detach_dev(div2);
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let $webSites;
    	let $keyStore;
    	let $webNotifications;
    	let $relays;
    	validate_store(webSites, 'webSites');
    	component_subscribe($$self, webSites, $$value => $$invalidate(27, $webSites = $$value));
    	validate_store(keyStore, 'keyStore');
    	component_subscribe($$self, keyStore, $$value => $$invalidate(6, $keyStore = $$value));
    	validate_store(webNotifications, 'webNotifications');
    	component_subscribe($$self, webNotifications, $$value => $$invalidate(7, $webNotifications = $$value));
    	validate_store(relays, 'relays');
    	component_subscribe($$self, relays, $$value => $$invalidate(8, $relays = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Settings', slots, []);
    	const hexPubKey = getPublicKey($keyStore);
    	const nPubKey = nip19_exports.npubEncode(hexPubKey);
    	let notifications = [];
    	var EchoMode;

    	(function (EchoMode) {
    		EchoMode[EchoMode["Password"] = 0] = "Password";
    		EchoMode[EchoMode["Normal"] = 1] = "Normal";
    	})(EchoMode || (EchoMode = {}));

    	let _currentTab = { url: "" };

    	web.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    		var activeTab = tabs[0];
    		_currentTab = activeTab;
    	});

    	let relayInput = "";
    	let secretEchoMode = EchoMode.Password;
    	let secretHexEchoMode = EchoMode.Password;
    	let currentTab = 0;

    	function showNotification(message) {
    		$$invalidate(0, notifications = [...notifications, { message }]);

    		setTimeout(
    			() => {
    				$$invalidate(0, notifications = notifications.slice(1));
    			},
    			3000
    		);
    	}

    	let currentSite = { history: [] };

    	loadWebSites().then(() => {
    		$$invalidate(5, currentSite = $webSites[domainToUrl(_currentTab.url)]);

    		if (currentSite === undefined) {
    			$$invalidate(5, currentSite = { history: [] });
    		}
    	});

    	loadNotifications();
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Settings> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => $$invalidate(4, currentTab = 0);
    	const click_handler_1 = () => $$invalidate(4, currentTab = 1);
    	const click_handler_2 = () => $$invalidate(4, currentTab = 2);
    	const click_handler_3 = notif => updateNotification(notif.name);

    	const click_handler_4 = () => {
    		web.tabs.create({
    			url: "https://toastr.space/p/" + getPublicKey($keyStore || "")
    		});
    	};

    	const focus_handler = () => $$invalidate(3, secretEchoMode = EchoMode.Normal);
    	const blur_handler = () => $$invalidate(3, secretEchoMode = EchoMode.Password);

    	const click_handler_5 = () => {
    		navigator.clipboard.writeText(nip19_exports.nsecEncode($keyStore));
    		showNotification("nsec copied to clipboard");
    	};

    	const click_handler_6 = () => {
    		navigator.clipboard.writeText(hexPubKey);
    		showNotification("hex public key copied to clipboard");
    	};

    	const click_handler_7 = () => {
    		navigator.clipboard.writeText(nPubKey);
    		showNotification("npub copied to clipboard");
    	};

    	const click_handler_8 = relay => {
    		// copy
    		navigator.clipboard.writeText(relay.url);

    		showNotification("copied to clipboard");
    	};

    	const click_handler_9 = relay => {
    		// remove
    		relays.set($relays.filter(r => r.url !== relay.url));

    		web.storage.local.set({ relays: $relays });
    		showNotification("relay removed");
    	};

    	function input3_input_handler() {
    		relayInput = this.value;
    		$$invalidate(2, relayInput);
    	}

    	const click_handler_10 = () => {
    		relays.set([
    			...$relays,
    			{
    				url: relayInput,
    				enabled: true,
    				created_at: new Date()
    			}
    		]);

    		web.storage.local.set({ relays: $relays });
    		$$invalidate(2, relayInput = "");
    		showNotification("relay added");
    	};

    	$$self.$capture_state = () => ({
    		getPublicKey,
    		nip19: nip19_exports,
    		keyStore,
    		loadWebSites,
    		relays,
    		webNotifications,
    		loadNotifications,
    		updateNotification,
    		webSites,
    		domainToUrl,
    		reverseArray,
    		timeAgo,
    		tr,
    		web,
    		hexPubKey,
    		nPubKey,
    		notifications,
    		EchoMode,
    		_currentTab,
    		relayInput,
    		secretEchoMode,
    		secretHexEchoMode,
    		currentTab,
    		showNotification,
    		currentSite,
    		$webSites,
    		$keyStore,
    		$webNotifications,
    		$relays
    	});

    	$$self.$inject_state = $$props => {
    		if ('notifications' in $$props) $$invalidate(0, notifications = $$props.notifications);
    		if ('EchoMode' in $$props) $$invalidate(1, EchoMode = $$props.EchoMode);
    		if ('_currentTab' in $$props) _currentTab = $$props._currentTab;
    		if ('relayInput' in $$props) $$invalidate(2, relayInput = $$props.relayInput);
    		if ('secretEchoMode' in $$props) $$invalidate(3, secretEchoMode = $$props.secretEchoMode);
    		if ('secretHexEchoMode' in $$props) secretHexEchoMode = $$props.secretHexEchoMode;
    		if ('currentTab' in $$props) $$invalidate(4, currentTab = $$props.currentTab);
    		if ('currentSite' in $$props) $$invalidate(5, currentSite = $$props.currentSite);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		notifications,
    		EchoMode,
    		relayInput,
    		secretEchoMode,
    		currentTab,
    		currentSite,
    		$keyStore,
    		$webNotifications,
    		$relays,
    		hexPubKey,
    		nPubKey,
    		showNotification,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		click_handler_4,
    		focus_handler,
    		blur_handler,
    		click_handler_5,
    		click_handler_6,
    		click_handler_7,
    		click_handler_8,
    		click_handler_9,
    		input3_input_handler,
    		click_handler_10
    	];
    }

    class Settings extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {}, null, [-1, -1]);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Settings",
    			options,
    			id: create_fragment$7.name
    		});
    	}
    }

    /* src/components/Authorization.svelte generated by Svelte v3.59.2 */

    const { Object: Object_1$1 } = globals;
    const file$6 = "src/components/Authorization.svelte";

    // (111:2) {#if login}
    function create_if_block$3(ctx) {
    	let p;
    	let span2;
    	let span0;
    	let t0;
    	let t1;
    	let br;
    	let t2;
    	let span1;
    	let t3;
    	let div6;
    	let div0;
    	let label0;
    	let span3;
    	let t5;
    	let input0;
    	let t6;
    	let div1;
    	let label1;
    	let span4;
    	let t8;
    	let input1;
    	let t9;
    	let div2;
    	let label2;
    	let span5;
    	let t11;
    	let input2;
    	let t12;
    	let div3;
    	let label3;
    	let span6;
    	let t14;
    	let input3;
    	let t15;
    	let div4;
    	let label4;
    	let span7;
    	let t17;
    	let input4;
    	let t18;
    	let div5;
    	let label5;
    	let span8;
    	let t20;
    	let input5;
    	let t21;
    	let div7;
    	let button0;
    	let t23;
    	let button1;
    	let t25;
    	let t26;
    	let binding_group;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (/*isPopup*/ ctx[2]) return create_if_block_3$2;
    		return create_else_block$2;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block0 = current_block_type(ctx);
    	let if_block1 = !/*isPopup*/ ctx[2] && create_if_block_2$2(ctx);
    	let if_block2 = /*isPopup*/ ctx[2] && create_if_block_1$2(ctx);
    	binding_group = init_binding_group(/*$$binding_groups*/ ctx[8][0]);

    	const block = {
    		c: function create() {
    			p = element("p");
    			span2 = element("span");
    			span0 = element("span");
    			t0 = text(/*domain*/ ctx[0]);
    			t1 = space();
    			br = element("br");
    			t2 = space();
    			span1 = element("span");
    			if_block0.c();
    			t3 = space();
    			div6 = element("div");
    			div0 = element("div");
    			label0 = element("label");
    			span3 = element("span");
    			span3.textContent = "One Time";
    			t5 = space();
    			input0 = element("input");
    			t6 = space();
    			div1 = element("div");
    			label1 = element("label");
    			span4 = element("span");
    			span4.textContent = "Always";
    			t8 = space();
    			input1 = element("input");
    			t9 = space();
    			div2 = element("div");
    			label2 = element("label");
    			span5 = element("span");
    			span5.textContent = "Next 5 minutes";
    			t11 = space();
    			input2 = element("input");
    			t12 = space();
    			div3 = element("div");
    			label3 = element("label");
    			span6 = element("span");
    			span6.textContent = "Next hour";
    			t14 = space();
    			input3 = element("input");
    			t15 = space();
    			div4 = element("div");
    			label4 = element("label");
    			span7 = element("span");
    			span7.textContent = "Next 5 hours";
    			t17 = space();
    			input4 = element("input");
    			t18 = space();
    			div5 = element("div");
    			label5 = element("label");
    			span8 = element("span");
    			span8.textContent = "Next 5 days";
    			t20 = space();
    			input5 = element("input");
    			t21 = space();
    			div7 = element("div");
    			button0 = element("button");
    			button0.textContent = "Accept";
    			t23 = space();
    			button1 = element("button");
    			button1.textContent = "Reject";
    			t25 = space();
    			if (if_block1) if_block1.c();
    			t26 = space();
    			if (if_block2) if_block2.c();
    			attr_dev(span0, "class", "text-primary-content font-sans font-italic italic");
    			add_location(span0, file$6, 113, 8, 3788);
    			add_location(br, file$6, 116, 8, 3896);
    			attr_dev(span1, "class", "badge p-4 mt-2 badge-secondary");
    			add_location(span1, file$6, 117, 8, 3911);
    			attr_dev(span2, "class", "text-center text-xl prose prose-lg");
    			add_location(span2, file$6, 112, 6, 3730);
    			attr_dev(p, "class", "w-full text-center p-10 pt-4 pb-6");
    			add_location(p, file$6, 111, 4, 3678);
    			attr_dev(span3, "class", "label-text mr-2");
    			add_location(span3, file$6, 131, 10, 4307);
    			attr_dev(input0, "type", "radio");
    			attr_dev(input0, "class", "radio");
    			input0.__value = 0;
    			input0.value = input0.__value;
    			add_location(input0, file$6, 132, 10, 4363);
    			attr_dev(label0, "class", "cursor-pointer label");
    			add_location(label0, file$6, 130, 8, 4260);
    			attr_dev(div0, "class", "form-control");
    			add_location(div0, file$6, 129, 6, 4225);
    			attr_dev(span4, "class", "label-text mr-2");
    			add_location(span4, file$6, 137, 10, 4548);
    			attr_dev(input1, "type", "radio");
    			attr_dev(input1, "class", "radio");
    			input1.__value = 1;
    			input1.value = input1.__value;
    			add_location(input1, file$6, 138, 10, 4602);
    			attr_dev(label1, "class", "cursor-pointer label");
    			add_location(label1, file$6, 136, 8, 4501);
    			attr_dev(div1, "class", "form-control");
    			add_location(div1, file$6, 135, 6, 4466);
    			attr_dev(span5, "class", "label-text mr-2");
    			add_location(span5, file$6, 143, 10, 4787);
    			attr_dev(input2, "type", "radio");
    			attr_dev(input2, "class", "radio");
    			input2.__value = 2;
    			input2.value = input2.__value;
    			add_location(input2, file$6, 144, 10, 4849);
    			attr_dev(label2, "class", "cursor-pointer label");
    			add_location(label2, file$6, 142, 8, 4740);
    			attr_dev(div2, "class", "form-control");
    			add_location(div2, file$6, 141, 6, 4705);
    			attr_dev(span6, "class", "label-text mr-2");
    			add_location(span6, file$6, 149, 10, 5034);
    			attr_dev(input3, "type", "radio");
    			attr_dev(input3, "class", "radio");
    			input3.__value = 3;
    			input3.value = input3.__value;
    			add_location(input3, file$6, 150, 10, 5091);
    			attr_dev(label3, "class", "cursor-pointer label");
    			add_location(label3, file$6, 148, 8, 4987);
    			attr_dev(div3, "class", "form-control");
    			add_location(div3, file$6, 147, 6, 4952);
    			attr_dev(span7, "class", "label-text mr-2");
    			add_location(span7, file$6, 156, 10, 5277);
    			attr_dev(input4, "type", "radio");
    			attr_dev(input4, "class", "radio");
    			input4.__value = 4;
    			input4.value = input4.__value;
    			add_location(input4, file$6, 157, 10, 5337);
    			attr_dev(label4, "class", "cursor-pointer label");
    			add_location(label4, file$6, 155, 8, 5230);
    			attr_dev(div4, "class", "form-control");
    			add_location(div4, file$6, 154, 6, 5195);
    			attr_dev(span8, "class", "label-text mr-2");
    			add_location(span8, file$6, 163, 10, 5523);
    			attr_dev(input5, "type", "radio");
    			attr_dev(input5, "class", "radio");
    			input5.__value = 5;
    			input5.value = input5.__value;
    			add_location(input5, file$6, 164, 10, 5582);
    			attr_dev(label5, "class", "cursor-pointer label");
    			add_location(label5, file$6, 162, 8, 5476);
    			attr_dev(div5, "class", "form-control");
    			add_location(div5, file$6, 161, 6, 5441);
    			attr_dev(div6, "class", "w-full p-4 pt-2 flex flex-row flex-wrap justify-center space-x-2");
    			add_location(div6, file$6, 126, 4, 4129);
    			attr_dev(button0, "class", "w-full btn btn-accent mb-2");
    			add_location(button0, file$6, 169, 6, 5773);
    			attr_dev(button1, "class", "w-full btn btn-secondary mb-2");
    			add_location(button1, file$6, 175, 6, 5919);
    			attr_dev(div7, "class", "w-full flex flex-col justify-center items-center p-10 pt-0");
    			add_location(div7, file$6, 168, 4, 5694);
    			binding_group.p(input0, input1, input2, input3, input4, input5);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, span2);
    			append_dev(span2, span0);
    			append_dev(span0, t0);
    			append_dev(span2, t1);
    			append_dev(span2, br);
    			append_dev(span2, t2);
    			append_dev(span2, span1);
    			if_block0.m(span1, null);
    			insert_dev(target, t3, anchor);
    			insert_dev(target, div6, anchor);
    			append_dev(div6, div0);
    			append_dev(div0, label0);
    			append_dev(label0, span3);
    			append_dev(label0, t5);
    			append_dev(label0, input0);
    			input0.checked = input0.__value === /*choice*/ ctx[4];
    			append_dev(div6, t6);
    			append_dev(div6, div1);
    			append_dev(div1, label1);
    			append_dev(label1, span4);
    			append_dev(label1, t8);
    			append_dev(label1, input1);
    			input1.checked = input1.__value === /*choice*/ ctx[4];
    			append_dev(div6, t9);
    			append_dev(div6, div2);
    			append_dev(div2, label2);
    			append_dev(label2, span5);
    			append_dev(label2, t11);
    			append_dev(label2, input2);
    			input2.checked = input2.__value === /*choice*/ ctx[4];
    			append_dev(div6, t12);
    			append_dev(div6, div3);
    			append_dev(div3, label3);
    			append_dev(label3, span6);
    			append_dev(label3, t14);
    			append_dev(label3, input3);
    			input3.checked = input3.__value === /*choice*/ ctx[4];
    			append_dev(div6, t15);
    			append_dev(div6, div4);
    			append_dev(div4, label4);
    			append_dev(label4, span7);
    			append_dev(label4, t17);
    			append_dev(label4, input4);
    			input4.checked = input4.__value === /*choice*/ ctx[4];
    			append_dev(div6, t18);
    			append_dev(div6, div5);
    			append_dev(div5, label5);
    			append_dev(label5, span8);
    			append_dev(label5, t20);
    			append_dev(label5, input5);
    			input5.checked = input5.__value === /*choice*/ ctx[4];
    			insert_dev(target, t21, anchor);
    			insert_dev(target, div7, anchor);
    			append_dev(div7, button0);
    			append_dev(div7, t23);
    			append_dev(div7, button1);
    			append_dev(div7, t25);
    			if (if_block1) if_block1.m(div7, null);
    			append_dev(div7, t26);
    			if (if_block2) if_block2.m(div7, null);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input0, "change", /*input0_change_handler*/ ctx[7]),
    					listen_dev(input1, "change", /*input1_change_handler*/ ctx[9]),
    					listen_dev(input2, "change", /*input2_change_handler*/ ctx[10]),
    					listen_dev(input3, "change", /*input3_change_handler*/ ctx[11]),
    					listen_dev(input4, "change", /*input4_change_handler*/ ctx[12]),
    					listen_dev(input5, "change", /*input5_change_handler*/ ctx[13]),
    					listen_dev(button0, "click", /*click_handler*/ ctx[14], false, false, false, false),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[15], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*domain*/ 1) set_data_dev(t0, /*domain*/ ctx[0]);

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(span1, null);
    				}
    			}

    			if (dirty & /*choice*/ 16) {
    				input0.checked = input0.__value === /*choice*/ ctx[4];
    			}

    			if (dirty & /*choice*/ 16) {
    				input1.checked = input1.__value === /*choice*/ ctx[4];
    			}

    			if (dirty & /*choice*/ 16) {
    				input2.checked = input2.__value === /*choice*/ ctx[4];
    			}

    			if (dirty & /*choice*/ 16) {
    				input3.checked = input3.__value === /*choice*/ ctx[4];
    			}

    			if (dirty & /*choice*/ 16) {
    				input4.checked = input4.__value === /*choice*/ ctx[4];
    			}

    			if (dirty & /*choice*/ 16) {
    				input5.checked = input5.__value === /*choice*/ ctx[4];
    			}

    			if (!/*isPopup*/ ctx[2]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2$2(ctx);
    					if_block1.c();
    					if_block1.m(div7, t26);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*isPopup*/ ctx[2]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_1$2(ctx);
    					if_block2.c();
    					if_block2.m(div7, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    			if_block0.d();
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div6);
    			if (detaching) detach_dev(t21);
    			if (detaching) detach_dev(div7);
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			binding_group.r();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(111:2) {#if login}",
    		ctx
    	});

    	return block;
    }

    // (121:10) {:else}
    function create_else_block$2(ctx) {
    	let t_value = tr("permission") + "";
    	let t;

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(121:10) {:else}",
    		ctx
    	});

    	return block;
    }

    // (119:10) {#if isPopup}
    function create_if_block_3$2(ctx) {
    	let t_value = tr(/*parameter*/ ctx[1].get("type")) + "";
    	let t;

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*parameter*/ 2 && t_value !== (t_value = tr(/*parameter*/ ctx[1].get("type")) + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$2.name,
    		type: "if",
    		source: "(119:10) {#if isPopup}",
    		ctx
    	});

    	return block;
    }

    // (183:6) {#if !isPopup}
    function create_if_block_2$2(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Cancel";
    			attr_dev(button, "class", "w-full btn btn-neutral");
    			add_location(button, file$6, 183, 8, 6093);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler_2*/ ctx[16], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$2.name,
    		type: "if",
    		source: "(183:6) {#if !isPopup}",
    		ctx
    	});

    	return block;
    }

    // (189:6) {#if isPopup}
    function create_if_block_1$2(ctx) {
    	let div;
    	let code;
    	let t_value = unescape(/*parameter*/ ctx[1].get("data")) + "";
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			code = element("code");
    			t = text(t_value);
    			attr_dev(code, "class", "prose break-words p-4");
    			add_location(code, file$6, 190, 10, 6304);
    			attr_dev(div, "class", "mockup-code justify-center mt-4 w-11/12 mx-2");
    			add_location(div, file$6, 189, 8, 6235);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, code);
    			append_dev(code, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*parameter*/ 2 && t_value !== (t_value = unescape(/*parameter*/ ctx[1].get("data")) + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(189:6) {#if isPopup}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let div;
    	let if_block = /*login*/ ctx[3] && create_if_block$3(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block) if_block.c();
    			attr_dev(div, "class", "w-full h-full flex flex-wrap fixed-width");
    			add_location(div, file$6, 109, 0, 3605);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*login*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let $webSites;
    	validate_store(webSites, 'webSites');
    	component_subscribe($$self, webSites, $$value => $$invalidate(17, $webSites = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Authorization', slots, []);
    	let login = false;
    	let { parameter } = $$props;
    	let { isPopup = false } = $$props;
    	let { domain } = $$props;

    	if (isPopup) {
    		domain = domainToUrl(parameter.get("url"));

    		if (parameter.get("action") === "login") {
    			login = true;
    		} else {
    			parameter.set("action", "register");
    		}
    	} else {
    		login = true;
    	}

    	const dispatch = createEventDispatcher();

    	function cancel() {
    		dispatch("cancel", {});
    	}

    	let choice = 0;

    	function accept(accept, duration = new Date()) {
    		if (isPopup) {
    			loadPrivateKey().then(() => {
    				web.runtime.sendMessage({
    					prompt: true,
    					response: {
    						status: "success",
    						error: accept ? false : true,
    						permission: {
    							always: choice === 1,
    							duration: getDuration(choice),
    							accept,
    							reject: !accept
    						}
    					},
    					ext: "nos2x",
    					url: parameter.get("url"),
    					requestId: parameter.get("requestId")
    				});
    			});
    		} else {
    			loadPrivateKey().then(async () => {
    				let _webSites = await loadWebSites();

    				if (_webSites === undefined || _webSites === null) {
    					_webSites = {};
    				}

    				if (Object.keys(_webSites).indexOf(domain) !== -1) {
    					let site = $webSites;

    					if (site === undefined || site === null) {
    						site = {};
    					}

    					let st = site[domain];

    					st.permission = {
    						always: choice === 1,
    						authorizationStop: getDuration(choice).toString(),
    						accept,
    						reject: !accept
    					};

    					let array = st.history || [];

    					array.push({
    						accepted: accept,
    						type: "permission",
    						created_at: new Date().toString(),
    						data: undefined
    					});

    					st["history"] = array;
    					site[domain] = st;
    					_webSites[domain] = st;
    					await web.storage.local.set({ webSites: _webSites });
    					await loadWebSites();
    				} else {
    					let site = $webSites;

    					if (site === undefined || site === null) {
    						site = {};
    					}

    					let st = {
    						auth: true,
    						history: [
    							{
    								accepted: accept,
    								type: "permission",
    								created_at: new Date().toString(),
    								data: undefined
    							}
    						],
    						permission: {
    							always: choice === 1,
    							authorizationStop: getDuration(choice).toString(),
    							accept,
    							reject: !accept
    						}
    					};

    					site[domain] = st;
    					await web.storage.local.set({ webSites: site });
    					await loadWebSites();
    				}

    				cancel();
    			});
    		}
    	}

    	$$self.$$.on_mount.push(function () {
    		if (parameter === undefined && !('parameter' in $$props || $$self.$$.bound[$$self.$$.props['parameter']])) {
    			console.warn("<Authorization> was created without expected prop 'parameter'");
    		}

    		if (domain === undefined && !('domain' in $$props || $$self.$$.bound[$$self.$$.props['domain']])) {
    			console.warn("<Authorization> was created without expected prop 'domain'");
    		}
    	});

    	const writable_props = ['parameter', 'isPopup', 'domain'];

    	Object_1$1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Authorization> was created with unknown prop '${key}'`);
    	});

    	const $$binding_groups = [[]];

    	function input0_change_handler() {
    		choice = this.__value;
    		$$invalidate(4, choice);
    	}

    	function input1_change_handler() {
    		choice = this.__value;
    		$$invalidate(4, choice);
    	}

    	function input2_change_handler() {
    		choice = this.__value;
    		$$invalidate(4, choice);
    	}

    	function input3_change_handler() {
    		choice = this.__value;
    		$$invalidate(4, choice);
    	}

    	function input4_change_handler() {
    		choice = this.__value;
    		$$invalidate(4, choice);
    	}

    	function input5_change_handler() {
    		choice = this.__value;
    		$$invalidate(4, choice);
    	}

    	const click_handler = () => accept(true, new Date());
    	const click_handler_1 = () => accept(false, new Date());
    	const click_handler_2 = () => cancel();

    	$$self.$$set = $$props => {
    		if ('parameter' in $$props) $$invalidate(1, parameter = $$props.parameter);
    		if ('isPopup' in $$props) $$invalidate(2, isPopup = $$props.isPopup);
    		if ('domain' in $$props) $$invalidate(0, domain = $$props.domain);
    	};

    	$$self.$capture_state = () => ({
    		domainToUrl,
    		getDuration,
    		web,
    		loadPrivateKey,
    		loadWebSites,
    		webSites,
    		createEventDispatcher,
    		tr,
    		login,
    		parameter,
    		isPopup,
    		domain,
    		dispatch,
    		cancel,
    		choice,
    		accept,
    		$webSites
    	});

    	$$self.$inject_state = $$props => {
    		if ('login' in $$props) $$invalidate(3, login = $$props.login);
    		if ('parameter' in $$props) $$invalidate(1, parameter = $$props.parameter);
    		if ('isPopup' in $$props) $$invalidate(2, isPopup = $$props.isPopup);
    		if ('domain' in $$props) $$invalidate(0, domain = $$props.domain);
    		if ('choice' in $$props) $$invalidate(4, choice = $$props.choice);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		domain,
    		parameter,
    		isPopup,
    		login,
    		choice,
    		cancel,
    		accept,
    		input0_change_handler,
    		$$binding_groups,
    		input1_change_handler,
    		input2_change_handler,
    		input3_change_handler,
    		input4_change_handler,
    		input5_change_handler,
    		click_handler,
    		click_handler_1,
    		click_handler_2
    	];
    }

    class Authorization extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { parameter: 1, isPopup: 2, domain: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Authorization",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get parameter() {
    		throw new Error("<Authorization>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set parameter(value) {
    		throw new Error("<Authorization>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isPopup() {
    		throw new Error("<Authorization>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isPopup(value) {
    		throw new Error("<Authorization>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get domain() {
    		throw new Error("<Authorization>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set domain(value) {
    		throw new Error("<Authorization>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/components/AuthAlert.svelte generated by Svelte v3.59.2 */
    const file$5 = "src/components/AuthAlert.svelte";

    // (49:2) {#if countdown}
    function create_if_block$2(ctx) {
    	let span3;
    	let span0;
    	let t0;
    	let span1;
    	let t1;
    	let span2;

    	const block = {
    		c: function create() {
    			span3 = element("span");
    			span0 = element("span");
    			t0 = text(":\n      ");
    			span1 = element("span");
    			t1 = text(":\n      ");
    			span2 = element("span");
    			set_style(span0, "--value", /*hour*/ ctx[0]);
    			add_location(span0, file$5, 50, 6, 1307);
    			set_style(span1, "--value", /*minute*/ ctx[1]);
    			add_location(span1, file$5, 51, 6, 1347);
    			set_style(span2, "--value", /*second*/ ctx[2]);
    			add_location(span2, file$5, 52, 6, 1389);
    			attr_dev(span3, "class", "countdown font-mono text-2xl");
    			add_location(span3, file$5, 49, 4, 1257);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span3, anchor);
    			append_dev(span3, span0);
    			append_dev(span3, t0);
    			append_dev(span3, span1);
    			append_dev(span3, t1);
    			append_dev(span3, span2);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*hour*/ 1) {
    				set_style(span0, "--value", /*hour*/ ctx[0]);
    			}

    			if (dirty & /*minute*/ 2) {
    				set_style(span1, "--value", /*minute*/ ctx[1]);
    			}

    			if (dirty & /*second*/ 4) {
    				set_style(span2, "--value", /*second*/ ctx[2]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span3);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(49:2) {#if countdown}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let div1;
    	let svg;
    	let path;
    	let svg_class_value;
    	let t0;
    	let span;
    	let t1;
    	let t2;
    	let t3;
    	let div0;
    	let button;
    	let mounted;
    	let dispose;
    	let if_block = /*countdown*/ ctx[5] && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t0 = space();
    			span = element("span");
    			t1 = text(/*message*/ ctx[4]);
    			t2 = space();
    			if (if_block) if_block.c();
    			t3 = space();
    			div0 = element("div");
    			button = element("button");
    			button.textContent = "Update";
    			attr_dev(path, "stroke-linecap", "round");
    			attr_dev(path, "stroke-linejoin", "round");
    			attr_dev(path, "stroke-width", "2");
    			attr_dev(path, "d", "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z");
    			add_location(path, file$5, 40, 5, 1012);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "fill", "none");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			attr_dev(svg, "class", svg_class_value = `stroke-${/*alertColor*/ ctx[3]} shrink-0 w-6 h-6`);
    			add_location(svg, file$5, 35, 2, 871);
    			attr_dev(span, "class", "text-lg font-sans");
    			add_location(span, file$5, 47, 2, 1186);
    			attr_dev(button, "class", "btn btn-outline btn-sm px-4");
    			add_location(button, file$5, 56, 4, 1456);
    			add_location(div0, file$5, 55, 2, 1446);
    			attr_dev(div1, "class", "alert");
    			add_location(div1, file$5, 34, 0, 849);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, svg);
    			append_dev(svg, path);
    			append_dev(div1, t0);
    			append_dev(div1, span);
    			append_dev(span, t1);
    			append_dev(div1, t2);
    			if (if_block) if_block.m(div1, null);
    			append_dev(div1, t3);
    			append_dev(div1, div0);
    			append_dev(div0, button);

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*onButtonClick*/ ctx[6])) /*onButtonClick*/ ctx[6].apply(this, arguments);
    					},
    					false,
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (dirty & /*alertColor*/ 8 && svg_class_value !== (svg_class_value = `stroke-${/*alertColor*/ ctx[3]} shrink-0 w-6 h-6`)) {
    				attr_dev(svg, "class", svg_class_value);
    			}

    			if (dirty & /*message*/ 16) set_data_dev(t1, /*message*/ ctx[4]);

    			if (/*countdown*/ ctx[5]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					if_block.m(div1, t3);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('AuthAlert', slots, []);
    	let currentTab = { url: "" };

    	web.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    		var activeTab = tabs[0];
    		currentTab = activeTab;
    	});

    	let { alertColor = "" } = $$props;
    	let { message = "" } = $$props;
    	let { countdown = false } = $$props;
    	let { hour = 0 } = $$props;
    	let { minute = 0 } = $$props;
    	let { second = 0 } = $$props;
    	let timer;

    	function startTimer() {
    		timer = setInterval(
    			() => {
    				if (second > 0) {
    					$$invalidate(2, second--, second);
    				} else if (minute > 0) {
    					$$invalidate(1, minute--, minute);
    					$$invalidate(2, second = 59);
    				} else if (hour > 0) {
    					$$invalidate(0, hour--, hour);
    					$$invalidate(1, minute = 59);
    					$$invalidate(2, second = 59);
    				}
    			},
    			1000
    		);
    	}

    	startTimer();

    	let { onButtonClick = () => {
    		
    	} } = $$props;

    	const writable_props = [
    		'alertColor',
    		'message',
    		'countdown',
    		'hour',
    		'minute',
    		'second',
    		'onButtonClick'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<AuthAlert> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('alertColor' in $$props) $$invalidate(3, alertColor = $$props.alertColor);
    		if ('message' in $$props) $$invalidate(4, message = $$props.message);
    		if ('countdown' in $$props) $$invalidate(5, countdown = $$props.countdown);
    		if ('hour' in $$props) $$invalidate(0, hour = $$props.hour);
    		if ('minute' in $$props) $$invalidate(1, minute = $$props.minute);
    		if ('second' in $$props) $$invalidate(2, second = $$props.second);
    		if ('onButtonClick' in $$props) $$invalidate(6, onButtonClick = $$props.onButtonClick);
    	};

    	$$self.$capture_state = () => ({
    		webSites,
    		web,
    		domainToUrl,
    		remainingTime,
    		currentTab,
    		alertColor,
    		message,
    		countdown,
    		hour,
    		minute,
    		second,
    		timer,
    		startTimer,
    		onButtonClick
    	});

    	$$self.$inject_state = $$props => {
    		if ('currentTab' in $$props) currentTab = $$props.currentTab;
    		if ('alertColor' in $$props) $$invalidate(3, alertColor = $$props.alertColor);
    		if ('message' in $$props) $$invalidate(4, message = $$props.message);
    		if ('countdown' in $$props) $$invalidate(5, countdown = $$props.countdown);
    		if ('hour' in $$props) $$invalidate(0, hour = $$props.hour);
    		if ('minute' in $$props) $$invalidate(1, minute = $$props.minute);
    		if ('second' in $$props) $$invalidate(2, second = $$props.second);
    		if ('timer' in $$props) timer = $$props.timer;
    		if ('onButtonClick' in $$props) $$invalidate(6, onButtonClick = $$props.onButtonClick);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [hour, minute, second, alertColor, message, countdown, onButtonClick];
    }

    class AuthAlert extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {
    			alertColor: 3,
    			message: 4,
    			countdown: 5,
    			hour: 0,
    			minute: 1,
    			second: 2,
    			onButtonClick: 6
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AuthAlert",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get alertColor() {
    		throw new Error("<AuthAlert>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set alertColor(value) {
    		throw new Error("<AuthAlert>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get message() {
    		throw new Error("<AuthAlert>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set message(value) {
    		throw new Error("<AuthAlert>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get countdown() {
    		throw new Error("<AuthAlert>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set countdown(value) {
    		throw new Error("<AuthAlert>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hour() {
    		throw new Error("<AuthAlert>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hour(value) {
    		throw new Error("<AuthAlert>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get minute() {
    		throw new Error("<AuthAlert>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set minute(value) {
    		throw new Error("<AuthAlert>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get second() {
    		throw new Error("<AuthAlert>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set second(value) {
    		throw new Error("<AuthAlert>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onButtonClick() {
    		throw new Error("<AuthAlert>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onButtonClick(value) {
    		throw new Error("<AuthAlert>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/components/Footer.svelte generated by Svelte v3.59.2 */

    const file$4 = "src/components/Footer.svelte";

    function create_fragment$4(ctx) {
    	let div;
    	let t0;
    	let a;
    	let t2;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t0 = text("Built with ❤️ by the ");
    			a = element("a");
    			a.textContent = "toastr.space";
    			t2 = text(" team");
    			attr_dev(a, "href", "https://toastr.space");
    			attr_dev(a, "target", "_blank");
    			attr_dev(a, "class", "link link-hover text-secondary");
    			add_location(a, file$4, 3, 23, 113);
    			attr_dev(div, "class", "absolute bottom-0 left-0 w-full text-center text-gray-500 font-sans pb-1");
    			add_location(div, file$4, 0, 0, 0);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t0);
    			append_dev(div, a);
    			append_dev(div, t2);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Footer', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Footer> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class Footer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Footer",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    /* src/components/Home.svelte generated by Svelte v3.59.2 */

    const { Object: Object_1 } = globals;
    const file$3 = "src/components/Home.svelte";

    // (80:0) {:else}
    function create_else_block$1(ctx) {
    	let div;
    	let h1;
    	let t0_value = domainToUrl(/*currentTab*/ ctx[0].url) + "";
    	let t0;
    	let t1;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block_1$1, create_else_block_2$1];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*webSite*/ ctx[1].auth === true) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type_1(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			h1 = element("h1");
    			t0 = text(t0_value);
    			t1 = space();
    			if_block.c();
    			attr_dev(h1, "class", "text-center text-2xl font-bold font-sans");
    			add_location(h1, file$3, 81, 4, 2841);
    			attr_dev(div, "class", "w-full h-full flex flex-row flex-col p-10 pt-5 space-y-6");
    			add_location(div, file$3, 80, 2, 2766);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, h1);
    			append_dev(h1, t0);
    			append_dev(div, t1);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if ((!current || dirty & /*currentTab*/ 1) && t0_value !== (t0_value = domainToUrl(/*currentTab*/ ctx[0].url) + "")) set_data_dev(t0, t0_value);
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(80:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (67:0) {#if showAuthorization}
    function create_if_block$1(ctx) {
    	let authorization;
    	let current;

    	authorization = new Authorization({
    			props: {
    				domain: domainToUrl(/*currentTab*/ ctx[0].url),
    				isPopup: false,
    				parameter: null
    			},
    			$$inline: true
    		});

    	authorization.$on("cancel", /*cancel_handler*/ ctx[8]);

    	const block = {
    		c: function create() {
    			create_component(authorization.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(authorization, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const authorization_changes = {};
    			if (dirty & /*currentTab*/ 1) authorization_changes.domain = domainToUrl(/*currentTab*/ ctx[0].url);
    			authorization.$set(authorization_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(authorization.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(authorization.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(authorization, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(67:0) {#if showAuthorization}",
    		ctx
    	});

    	return block;
    }

    // (166:4) {:else}
    function create_else_block_2$1(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "Authorize now";
    			attr_dev(button, "class", "btn rounded-full ml-20 text-center align-center justify-center item-center badge border-1 border-gray-300 px-5 py-3");
    			add_location(button, file$3, 166, 6, 5533);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler*/ ctx[16], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_2$1.name,
    		type: "else",
    		source: "(166:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (85:4) {#if webSite.auth === true}
    function create_if_block_1$1(ctx) {
    	let div3;
    	let div2;
    	let div0;
    	let t1;
    	let div1;
    	let center;
    	let span1;
    	let span0;
    	let t2;
    	let show_if;
    	let show_if_1;
    	let show_if_2;
    	let show_if_3;
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;

    	const if_block_creators = [
    		create_if_block_2$1,
    		create_if_block_3$1,
    		create_if_block_4$1,
    		create_if_block_5$1,
    		create_if_block_6$1,
    		create_if_block_7$1,
    		create_else_block_1$1
    	];

    	const if_blocks = [];

    	function select_block_type_2(ctx, dirty) {
    		if (dirty & /*webSite*/ 2) show_if = null;
    		if (dirty & /*webSite*/ 2) show_if_1 = null;
    		if (dirty & /*webSite*/ 2) show_if_2 = null;
    		if (dirty & /*webSite*/ 2) show_if_3 = null;
    		if (/*webSite*/ ctx[1].permission.always === true && /*webSite*/ ctx[1].permission.accept === true) return 0;
    		if (/*webSite*/ ctx[1].permission.always === true && /*webSite*/ ctx[1].permission.reject === true) return 1;
    		if (show_if == null) show_if = !!(new Date(/*webSite*/ ctx[1].permission.authorizationStop) < new Date());
    		if (show_if) return 2;
    		if (show_if_1 == null) show_if_1 = !!(new Date(/*webSite*/ ctx[1].permission.authorizationStop) > new Date() && /*webSite*/ ctx[1].permission.accept === true);
    		if (show_if_1) return 3;
    		if (show_if_2 == null) show_if_2 = !!(new Date(/*webSite*/ ctx[1].permission.authorizationStop) > new Date() && /*webSite*/ ctx[1].permission.reject === true);
    		if (show_if_2) return 4;
    		if (show_if_3 == null) show_if_3 = !!(new Date(/*webSite*/ ctx[1].permission.authorizationStop) < new Date() && /*webSite*/ ctx[1].permission.accept === true);
    		if (show_if_3) return 5;
    		return 6;
    	}

    	current_block_type_index = select_block_type_2(ctx, -1);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div2 = element("div");
    			div0 = element("div");
    			div0.textContent = "Total Requests";
    			t1 = space();
    			div1 = element("div");
    			center = element("center");
    			span1 = element("span");
    			span0 = element("span");
    			t2 = space();
    			if_block.c();
    			if_block_anchor = empty();
    			attr_dev(div0, "class", "stat-title text-center");
    			add_location(div0, file$3, 87, 10, 3058);
    			set_style(span0, "--value", /*webSite*/ ctx[1].history.length.toLocaleString());
    			add_location(span0, file$3, 91, 16, 3245);
    			attr_dev(span1, "class", "countdown font-mono text-6xl");
    			add_location(span1, file$3, 90, 14, 3185);
    			add_location(center, file$3, 89, 12, 3162);
    			attr_dev(div1, "class", "stat-value");
    			add_location(div1, file$3, 88, 10, 3125);
    			attr_dev(div2, "class", "stat");
    			add_location(div2, file$3, 86, 8, 3029);
    			attr_dev(div3, "class", "stats shadow-sm bg-base-200");
    			add_location(div3, file$3, 85, 6, 2979);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div2);
    			append_dev(div2, div0);
    			append_dev(div2, t1);
    			append_dev(div2, div1);
    			append_dev(div1, center);
    			append_dev(center, span1);
    			append_dev(span1, span0);
    			insert_dev(target, t2, anchor);
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*webSite*/ 2) {
    				set_style(span0, "--value", /*webSite*/ ctx[1].history.length.toLocaleString());
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_2(ctx, dirty);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			if (detaching) detach_dev(t2);
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(85:4) {#if webSite.auth === true}",
    		ctx
    	});

    	return block;
    }

    // (157:6) {:else}
    function create_else_block_1$1(ctx) {
    	let authalert;
    	let current;

    	authalert = new AuthAlert({
    			props: {
    				alertColor: "secondary",
    				message: "Not authorized",
    				onButtonClick: /*func_6*/ ctx[15]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(authalert.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(authalert, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const authalert_changes = {};
    			if (dirty & /*showAuthorization*/ 32) authalert_changes.onButtonClick = /*func_6*/ ctx[15];
    			authalert.$set(authalert_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(authalert.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(authalert.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(authalert, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1$1.name,
    		type: "else",
    		source: "(157:6) {:else}",
    		ctx
    	});

    	return block;
    }

    // (149:114) 
    function create_if_block_7$1(ctx) {
    	let authalert;
    	let current;

    	authalert = new AuthAlert({
    			props: {
    				alertColor: "secondary",
    				message: "Authorization expired",
    				onButtonClick: /*func_5*/ ctx[14]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(authalert.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(authalert, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const authalert_changes = {};
    			if (dirty & /*showAuthorization*/ 32) authalert_changes.onButtonClick = /*func_5*/ ctx[14];
    			authalert.$set(authalert_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(authalert.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(authalert.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(authalert, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_7$1.name,
    		type: "if",
    		source: "(149:114) ",
    		ctx
    	});

    	return block;
    }

    // (137:114) 
    function create_if_block_6$1(ctx) {
    	let authalert;
    	let current;

    	authalert = new AuthAlert({
    			props: {
    				alertColor: "secondary",
    				countdown: true,
    				hour: /*hour*/ ctx[2],
    				minute: /*minute*/ ctx[3],
    				second: /*second*/ ctx[4],
    				message: /*authAlertMessage*/ ctx[6],
    				onButtonClick: /*func_4*/ ctx[13]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(authalert.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(authalert, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const authalert_changes = {};
    			if (dirty & /*hour*/ 4) authalert_changes.hour = /*hour*/ ctx[2];
    			if (dirty & /*minute*/ 8) authalert_changes.minute = /*minute*/ ctx[3];
    			if (dirty & /*second*/ 16) authalert_changes.second = /*second*/ ctx[4];
    			if (dirty & /*authAlertMessage*/ 64) authalert_changes.message = /*authAlertMessage*/ ctx[6];
    			if (dirty & /*showAuthorization*/ 32) authalert_changes.onButtonClick = /*func_4*/ ctx[13];
    			authalert.$set(authalert_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(authalert.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(authalert.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(authalert, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_6$1.name,
    		type: "if",
    		source: "(137:114) ",
    		ctx
    	});

    	return block;
    }

    // (125:114) 
    function create_if_block_5$1(ctx) {
    	let authalert;
    	let current;

    	authalert = new AuthAlert({
    			props: {
    				alertColor: "accent",
    				countdown: true,
    				hour: /*hour*/ ctx[2],
    				minute: /*minute*/ ctx[3],
    				second: /*second*/ ctx[4],
    				message: /*authAlertMessage*/ ctx[6],
    				onButtonClick: /*func_3*/ ctx[12]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(authalert.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(authalert, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const authalert_changes = {};
    			if (dirty & /*hour*/ 4) authalert_changes.hour = /*hour*/ ctx[2];
    			if (dirty & /*minute*/ 8) authalert_changes.minute = /*minute*/ ctx[3];
    			if (dirty & /*second*/ 16) authalert_changes.second = /*second*/ ctx[4];
    			if (dirty & /*authAlertMessage*/ 64) authalert_changes.message = /*authAlertMessage*/ ctx[6];
    			if (dirty & /*showAuthorization*/ 32) authalert_changes.onButtonClick = /*func_3*/ ctx[12];
    			authalert.$set(authalert_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(authalert.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(authalert.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(authalert, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5$1.name,
    		type: "if",
    		source: "(125:114) ",
    		ctx
    	});

    	return block;
    }

    // (117:76) 
    function create_if_block_4$1(ctx) {
    	let authalert;
    	let current;

    	authalert = new AuthAlert({
    			props: {
    				alertColor: "secondary",
    				message: "Authorization expired",
    				onButtonClick: /*func_2*/ ctx[11]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(authalert.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(authalert, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const authalert_changes = {};
    			if (dirty & /*showAuthorization*/ 32) authalert_changes.onButtonClick = /*func_2*/ ctx[11];
    			authalert.$set(authalert_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(authalert.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(authalert.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(authalert, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4$1.name,
    		type: "if",
    		source: "(117:76) ",
    		ctx
    	});

    	return block;
    }

    // (109:89) 
    function create_if_block_3$1(ctx) {
    	let authalert;
    	let current;

    	authalert = new AuthAlert({
    			props: {
    				alertColor: "secondary",
    				message: "Always rejected",
    				onButtonClick: /*func_1*/ ctx[10]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(authalert.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(authalert, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const authalert_changes = {};
    			if (dirty & /*showAuthorization*/ 32) authalert_changes.onButtonClick = /*func_1*/ ctx[10];
    			authalert.$set(authalert_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(authalert.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(authalert.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(authalert, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$1.name,
    		type: "if",
    		source: "(109:89) ",
    		ctx
    	});

    	return block;
    }

    // (101:6) {#if webSite.permission.always === true && webSite.permission.accept === true}
    function create_if_block_2$1(ctx) {
    	let authalert;
    	let current;

    	authalert = new AuthAlert({
    			props: {
    				alertColor: "accent",
    				message: "Always authorized",
    				onButtonClick: /*func*/ ctx[9]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(authalert.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(authalert, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const authalert_changes = {};
    			if (dirty & /*showAuthorization*/ 32) authalert_changes.onButtonClick = /*func*/ ctx[9];
    			authalert.$set(authalert_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(authalert.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(authalert.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(authalert, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(101:6) {#if webSite.permission.always === true && webSite.permission.accept === true}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let t;
    	let footer;
    	let current;
    	const if_block_creators = [create_if_block$1, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*showAuthorization*/ ctx[5]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	footer = new Footer({ $$inline: true });

    	const block = {
    		c: function create() {
    			if_block.c();
    			t = space();
    			create_component(footer.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, t, anchor);
    			mount_component(footer, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(t.parentNode, t);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			transition_in(footer.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			transition_out(footer.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(t);
    			destroy_component(footer, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let authAlertMessage;
    	let $webSites;
    	validate_store(webSites, 'webSites');
    	component_subscribe($$self, webSites, $$value => $$invalidate(7, $webSites = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Home', slots, []);
    	let currentTab = { url: "" };

    	web.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    		var activeTab = tabs[0];
    		$$invalidate(0, currentTab = activeTab);
    	});

    	let webSite = {
    		auth: false,
    		history: [],
    		permission: {
    			always: false,
    			accept: true,
    			reject: false,
    			authorizationStop: new Date()
    		}
    	};

    	let timerExpire = remainingTime(new Date(webSite.permission.authorizationStop));
    	let splitedTimerExpire = timerExpire.split(":");
    	let hour = 0;
    	let minute = 0;
    	let second = 0;

    	webSites.subscribe(value => {
    		if (value === null || value === undefined) {
    			return;
    		}

    		let _webSite;
    		if (Object.keys(value).indexOf(domainToUrl(currentTab.url)) !== -1) _webSite = value[domainToUrl(currentTab.url)]; else return;

    		timerExpire = remainingTime(new Date(_webSite === null || _webSite === void 0
    			? void 0
    			: _webSite.permission.authorizationStop));

    		const splitedTimerExpire = timerExpire.split(":");
    		$$invalidate(2, hour = parseInt(splitedTimerExpire[0]));
    		$$invalidate(3, minute = parseInt(splitedTimerExpire[1]));
    		$$invalidate(4, second = parseInt(splitedTimerExpire[2]));
    	});

    	if (new Date(webSite.permission.authorizationStop) > new Date()) {
    		const i = setInterval(
    			() => {
    				if (new Date(webSite.permission.authorizationStop) < new Date()) {
    					clearInterval(i);
    				} else {
    					timerExpire = remainingTime(new Date(webSite.permission.authorizationStop));
    				}
    			},
    			1000
    		);
    	}

    	let showAuthorization = false;

    	loadWebSites().then(_webSites => {
    		if (_webSites === null || _webSites === undefined) {
    			_webSites = {};
    		}

    		if (Object.keys(_webSites).indexOf(domainToUrl(currentTab.url)) !== -1) $$invalidate(1, webSite = _webSites[domainToUrl(currentTab.url)]);
    		timerExpire = remainingTime(new Date(webSite.permission.authorizationStop));
    		const splitedTimerExpire = timerExpire.split(":");
    		$$invalidate(2, hour = parseInt(splitedTimerExpire[0]));
    		$$invalidate(3, minute = parseInt(splitedTimerExpire[1]));
    		$$invalidate(4, second = parseInt(splitedTimerExpire[2]));
    	});

    	const writable_props = [];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Home> was created with unknown prop '${key}'`);
    	});

    	const cancel_handler = () => {
    		loadWebSites().then(() => {
    			if (Object.keys($webSites).indexOf(domainToUrl(currentTab.url)) !== -1) $$invalidate(1, webSite = $webSites[domainToUrl(currentTab.url)]);
    		});

    		$$invalidate(5, showAuthorization = false);
    	};

    	const func = () => {
    		$$invalidate(5, showAuthorization = true);
    	};

    	const func_1 = () => {
    		$$invalidate(5, showAuthorization = true);
    	};

    	const func_2 = () => {
    		$$invalidate(5, showAuthorization = true);
    	};

    	const func_3 = () => {
    		$$invalidate(5, showAuthorization = true);
    	};

    	const func_4 = () => {
    		$$invalidate(5, showAuthorization = true);
    	};

    	const func_5 = () => {
    		$$invalidate(5, showAuthorization = true);
    	};

    	const func_6 = () => {
    		$$invalidate(5, showAuthorization = true);
    	};

    	const click_handler = () => {
    		$$invalidate(5, showAuthorization = true);
    	};

    	$$self.$capture_state = () => ({
    		web,
    		domainToUrl,
    		remainingTime,
    		loadWebSites,
    		webSites,
    		Authorization,
    		AuthAlert,
    		Footer,
    		currentTab,
    		webSite,
    		timerExpire,
    		splitedTimerExpire,
    		hour,
    		minute,
    		second,
    		showAuthorization,
    		authAlertMessage,
    		$webSites
    	});

    	$$self.$inject_state = $$props => {
    		if ('currentTab' in $$props) $$invalidate(0, currentTab = $$props.currentTab);
    		if ('webSite' in $$props) $$invalidate(1, webSite = $$props.webSite);
    		if ('timerExpire' in $$props) timerExpire = $$props.timerExpire;
    		if ('splitedTimerExpire' in $$props) splitedTimerExpire = $$props.splitedTimerExpire;
    		if ('hour' in $$props) $$invalidate(2, hour = $$props.hour);
    		if ('minute' in $$props) $$invalidate(3, minute = $$props.minute);
    		if ('second' in $$props) $$invalidate(4, second = $$props.second);
    		if ('showAuthorization' in $$props) $$invalidate(5, showAuthorization = $$props.showAuthorization);
    		if ('authAlertMessage' in $$props) $$invalidate(6, authAlertMessage = $$props.authAlertMessage);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$invalidate(6, authAlertMessage = `Authorization expires in`);

    	return [
    		currentTab,
    		webSite,
    		hour,
    		minute,
    		second,
    		showAuthorization,
    		authAlertMessage,
    		$webSites,
    		cancel_handler,
    		func,
    		func_1,
    		func_2,
    		func_3,
    		func_4,
    		func_5,
    		func_6,
    		click_handler
    	];
    }

    class Home extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Home",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    var browser$1 = {};

    // can-promise has a crash in some versions of react native that dont have
    // standard global objects
    // https://github.com/soldair/node-qrcode/issues/157

    var canPromise$1 = function () {
      return typeof Promise === 'function' && Promise.prototype && Promise.prototype.then
    };

    var qrcode = {};

    var utils$1 = {};

    let toSJISFunction;
    const CODEWORDS_COUNT = [
      0, // Not used
      26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
      404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
      1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
      2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706
    ];

    /**
     * Returns the QR Code size for the specified version
     *
     * @param  {Number} version QR Code version
     * @return {Number}         size of QR code
     */
    utils$1.getSymbolSize = function getSymbolSize (version) {
      if (!version) throw new Error('"version" cannot be null or undefined')
      if (version < 1 || version > 40) throw new Error('"version" should be in range from 1 to 40')
      return version * 4 + 17
    };

    /**
     * Returns the total number of codewords used to store data and EC information.
     *
     * @param  {Number} version QR Code version
     * @return {Number}         Data length in bits
     */
    utils$1.getSymbolTotalCodewords = function getSymbolTotalCodewords (version) {
      return CODEWORDS_COUNT[version]
    };

    /**
     * Encode data with Bose-Chaudhuri-Hocquenghem
     *
     * @param  {Number} data Value to encode
     * @return {Number}      Encoded value
     */
    utils$1.getBCHDigit = function (data) {
      let digit = 0;

      while (data !== 0) {
        digit++;
        data >>>= 1;
      }

      return digit
    };

    utils$1.setToSJISFunction = function setToSJISFunction (f) {
      if (typeof f !== 'function') {
        throw new Error('"toSJISFunc" is not a valid function.')
      }

      toSJISFunction = f;
    };

    utils$1.isKanjiModeEnabled = function () {
      return typeof toSJISFunction !== 'undefined'
    };

    utils$1.toSJIS = function toSJIS (kanji) {
      return toSJISFunction(kanji)
    };

    var errorCorrectionLevel = {};

    (function (exports) {
    	exports.L = { bit: 1 };
    	exports.M = { bit: 0 };
    	exports.Q = { bit: 3 };
    	exports.H = { bit: 2 };

    	function fromString (string) {
    	  if (typeof string !== 'string') {
    	    throw new Error('Param is not a string')
    	  }

    	  const lcStr = string.toLowerCase();

    	  switch (lcStr) {
    	    case 'l':
    	    case 'low':
    	      return exports.L

    	    case 'm':
    	    case 'medium':
    	      return exports.M

    	    case 'q':
    	    case 'quartile':
    	      return exports.Q

    	    case 'h':
    	    case 'high':
    	      return exports.H

    	    default:
    	      throw new Error('Unknown EC Level: ' + string)
    	  }
    	}

    	exports.isValid = function isValid (level) {
    	  return level && typeof level.bit !== 'undefined' &&
    	    level.bit >= 0 && level.bit < 4
    	};

    	exports.from = function from (value, defaultValue) {
    	  if (exports.isValid(value)) {
    	    return value
    	  }

    	  try {
    	    return fromString(value)
    	  } catch (e) {
    	    return defaultValue
    	  }
    	}; 
    } (errorCorrectionLevel));

    function BitBuffer$1 () {
      this.buffer = [];
      this.length = 0;
    }

    BitBuffer$1.prototype = {

      get: function (index) {
        const bufIndex = Math.floor(index / 8);
        return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) === 1
      },

      put: function (num, length) {
        for (let i = 0; i < length; i++) {
          this.putBit(((num >>> (length - i - 1)) & 1) === 1);
        }
      },

      getLengthInBits: function () {
        return this.length
      },

      putBit: function (bit) {
        const bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
          this.buffer.push(0);
        }

        if (bit) {
          this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
        }

        this.length++;
      }
    };

    var bitBuffer = BitBuffer$1;

    /**
     * Helper class to handle QR Code symbol modules
     *
     * @param {Number} size Symbol size
     */

    function BitMatrix$1 (size) {
      if (!size || size < 1) {
        throw new Error('BitMatrix size must be defined and greater than 0')
      }

      this.size = size;
      this.data = new Uint8Array(size * size);
      this.reservedBit = new Uint8Array(size * size);
    }

    /**
     * Set bit value at specified location
     * If reserved flag is set, this bit will be ignored during masking process
     *
     * @param {Number}  row
     * @param {Number}  col
     * @param {Boolean} value
     * @param {Boolean} reserved
     */
    BitMatrix$1.prototype.set = function (row, col, value, reserved) {
      const index = row * this.size + col;
      this.data[index] = value;
      if (reserved) this.reservedBit[index] = true;
    };

    /**
     * Returns bit value at specified location
     *
     * @param  {Number}  row
     * @param  {Number}  col
     * @return {Boolean}
     */
    BitMatrix$1.prototype.get = function (row, col) {
      return this.data[row * this.size + col]
    };

    /**
     * Applies xor operator at specified location
     * (used during masking process)
     *
     * @param {Number}  row
     * @param {Number}  col
     * @param {Boolean} value
     */
    BitMatrix$1.prototype.xor = function (row, col, value) {
      this.data[row * this.size + col] ^= value;
    };

    /**
     * Check if bit at specified location is reserved
     *
     * @param {Number}   row
     * @param {Number}   col
     * @return {Boolean}
     */
    BitMatrix$1.prototype.isReserved = function (row, col) {
      return this.reservedBit[row * this.size + col]
    };

    var bitMatrix = BitMatrix$1;

    var alignmentPattern = {};

    /**
     * Alignment pattern are fixed reference pattern in defined positions
     * in a matrix symbology, which enables the decode software to re-synchronise
     * the coordinate mapping of the image modules in the event of moderate amounts
     * of distortion of the image.
     *
     * Alignment patterns are present only in QR Code symbols of version 2 or larger
     * and their number depends on the symbol version.
     */

    (function (exports) {
    	const getSymbolSize = utils$1.getSymbolSize;

    	/**
    	 * Calculate the row/column coordinates of the center module of each alignment pattern
    	 * for the specified QR Code version.
    	 *
    	 * The alignment patterns are positioned symmetrically on either side of the diagonal
    	 * running from the top left corner of the symbol to the bottom right corner.
    	 *
    	 * Since positions are simmetrical only half of the coordinates are returned.
    	 * Each item of the array will represent in turn the x and y coordinate.
    	 * @see {@link getPositions}
    	 *
    	 * @param  {Number} version QR Code version
    	 * @return {Array}          Array of coordinate
    	 */
    	exports.getRowColCoords = function getRowColCoords (version) {
    	  if (version === 1) return []

    	  const posCount = Math.floor(version / 7) + 2;
    	  const size = getSymbolSize(version);
    	  const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
    	  const positions = [size - 7]; // Last coord is always (size - 7)

    	  for (let i = 1; i < posCount - 1; i++) {
    	    positions[i] = positions[i - 1] - intervals;
    	  }

    	  positions.push(6); // First coord is always 6

    	  return positions.reverse()
    	};

    	/**
    	 * Returns an array containing the positions of each alignment pattern.
    	 * Each array's element represent the center point of the pattern as (x, y) coordinates
    	 *
    	 * Coordinates are calculated expanding the row/column coordinates returned by {@link getRowColCoords}
    	 * and filtering out the items that overlaps with finder pattern
    	 *
    	 * @example
    	 * For a Version 7 symbol {@link getRowColCoords} returns values 6, 22 and 38.
    	 * The alignment patterns, therefore, are to be centered on (row, column)
    	 * positions (6,22), (22,6), (22,22), (22,38), (38,22), (38,38).
    	 * Note that the coordinates (6,6), (6,38), (38,6) are occupied by finder patterns
    	 * and are not therefore used for alignment patterns.
    	 *
    	 * let pos = getPositions(7)
    	 * // [[6,22], [22,6], [22,22], [22,38], [38,22], [38,38]]
    	 *
    	 * @param  {Number} version QR Code version
    	 * @return {Array}          Array of coordinates
    	 */
    	exports.getPositions = function getPositions (version) {
    	  const coords = [];
    	  const pos = exports.getRowColCoords(version);
    	  const posLength = pos.length;

    	  for (let i = 0; i < posLength; i++) {
    	    for (let j = 0; j < posLength; j++) {
    	      // Skip if position is occupied by finder patterns
    	      if ((i === 0 && j === 0) || // top-left
    	          (i === 0 && j === posLength - 1) || // bottom-left
    	          (i === posLength - 1 && j === 0)) { // top-right
    	        continue
    	      }

    	      coords.push([pos[i], pos[j]]);
    	    }
    	  }

    	  return coords
    	}; 
    } (alignmentPattern));

    var finderPattern = {};

    const getSymbolSize = utils$1.getSymbolSize;
    const FINDER_PATTERN_SIZE = 7;

    /**
     * Returns an array containing the positions of each finder pattern.
     * Each array's element represent the top-left point of the pattern as (x, y) coordinates
     *
     * @param  {Number} version QR Code version
     * @return {Array}          Array of coordinates
     */
    finderPattern.getPositions = function getPositions (version) {
      const size = getSymbolSize(version);

      return [
        // top-left
        [0, 0],
        // top-right
        [size - FINDER_PATTERN_SIZE, 0],
        // bottom-left
        [0, size - FINDER_PATTERN_SIZE]
      ]
    };

    var maskPattern = {};

    /**
     * Data mask pattern reference
     * @type {Object}
     */

    (function (exports) {
    	exports.Patterns = {
    	  PATTERN000: 0,
    	  PATTERN001: 1,
    	  PATTERN010: 2,
    	  PATTERN011: 3,
    	  PATTERN100: 4,
    	  PATTERN101: 5,
    	  PATTERN110: 6,
    	  PATTERN111: 7
    	};

    	/**
    	 * Weighted penalty scores for the undesirable features
    	 * @type {Object}
    	 */
    	const PenaltyScores = {
    	  N1: 3,
    	  N2: 3,
    	  N3: 40,
    	  N4: 10
    	};

    	/**
    	 * Check if mask pattern value is valid
    	 *
    	 * @param  {Number}  mask    Mask pattern
    	 * @return {Boolean}         true if valid, false otherwise
    	 */
    	exports.isValid = function isValid (mask) {
    	  return mask != null && mask !== '' && !isNaN(mask) && mask >= 0 && mask <= 7
    	};

    	/**
    	 * Returns mask pattern from a value.
    	 * If value is not valid, returns undefined
    	 *
    	 * @param  {Number|String} value        Mask pattern value
    	 * @return {Number}                     Valid mask pattern or undefined
    	 */
    	exports.from = function from (value) {
    	  return exports.isValid(value) ? parseInt(value, 10) : undefined
    	};

    	/**
    	* Find adjacent modules in row/column with the same color
    	* and assign a penalty value.
    	*
    	* Points: N1 + i
    	* i is the amount by which the number of adjacent modules of the same color exceeds 5
    	*/
    	exports.getPenaltyN1 = function getPenaltyN1 (data) {
    	  const size = data.size;
    	  let points = 0;
    	  let sameCountCol = 0;
    	  let sameCountRow = 0;
    	  let lastCol = null;
    	  let lastRow = null;

    	  for (let row = 0; row < size; row++) {
    	    sameCountCol = sameCountRow = 0;
    	    lastCol = lastRow = null;

    	    for (let col = 0; col < size; col++) {
    	      let module = data.get(row, col);
    	      if (module === lastCol) {
    	        sameCountCol++;
    	      } else {
    	        if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
    	        lastCol = module;
    	        sameCountCol = 1;
    	      }

    	      module = data.get(col, row);
    	      if (module === lastRow) {
    	        sameCountRow++;
    	      } else {
    	        if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
    	        lastRow = module;
    	        sameCountRow = 1;
    	      }
    	    }

    	    if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
    	    if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
    	  }

    	  return points
    	};

    	/**
    	 * Find 2x2 blocks with the same color and assign a penalty value
    	 *
    	 * Points: N2 * (m - 1) * (n - 1)
    	 */
    	exports.getPenaltyN2 = function getPenaltyN2 (data) {
    	  const size = data.size;
    	  let points = 0;

    	  for (let row = 0; row < size - 1; row++) {
    	    for (let col = 0; col < size - 1; col++) {
    	      const last = data.get(row, col) +
    	        data.get(row, col + 1) +
    	        data.get(row + 1, col) +
    	        data.get(row + 1, col + 1);

    	      if (last === 4 || last === 0) points++;
    	    }
    	  }

    	  return points * PenaltyScores.N2
    	};

    	/**
    	 * Find 1:1:3:1:1 ratio (dark:light:dark:light:dark) pattern in row/column,
    	 * preceded or followed by light area 4 modules wide
    	 *
    	 * Points: N3 * number of pattern found
    	 */
    	exports.getPenaltyN3 = function getPenaltyN3 (data) {
    	  const size = data.size;
    	  let points = 0;
    	  let bitsCol = 0;
    	  let bitsRow = 0;

    	  for (let row = 0; row < size; row++) {
    	    bitsCol = bitsRow = 0;
    	    for (let col = 0; col < size; col++) {
    	      bitsCol = ((bitsCol << 1) & 0x7FF) | data.get(row, col);
    	      if (col >= 10 && (bitsCol === 0x5D0 || bitsCol === 0x05D)) points++;

    	      bitsRow = ((bitsRow << 1) & 0x7FF) | data.get(col, row);
    	      if (col >= 10 && (bitsRow === 0x5D0 || bitsRow === 0x05D)) points++;
    	    }
    	  }

    	  return points * PenaltyScores.N3
    	};

    	/**
    	 * Calculate proportion of dark modules in entire symbol
    	 *
    	 * Points: N4 * k
    	 *
    	 * k is the rating of the deviation of the proportion of dark modules
    	 * in the symbol from 50% in steps of 5%
    	 */
    	exports.getPenaltyN4 = function getPenaltyN4 (data) {
    	  let darkCount = 0;
    	  const modulesCount = data.data.length;

    	  for (let i = 0; i < modulesCount; i++) darkCount += data.data[i];

    	  const k = Math.abs(Math.ceil((darkCount * 100 / modulesCount) / 5) - 10);

    	  return k * PenaltyScores.N4
    	};

    	/**
    	 * Return mask value at given position
    	 *
    	 * @param  {Number} maskPattern Pattern reference value
    	 * @param  {Number} i           Row
    	 * @param  {Number} j           Column
    	 * @return {Boolean}            Mask value
    	 */
    	function getMaskAt (maskPattern, i, j) {
    	  switch (maskPattern) {
    	    case exports.Patterns.PATTERN000: return (i + j) % 2 === 0
    	    case exports.Patterns.PATTERN001: return i % 2 === 0
    	    case exports.Patterns.PATTERN010: return j % 3 === 0
    	    case exports.Patterns.PATTERN011: return (i + j) % 3 === 0
    	    case exports.Patterns.PATTERN100: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0
    	    case exports.Patterns.PATTERN101: return (i * j) % 2 + (i * j) % 3 === 0
    	    case exports.Patterns.PATTERN110: return ((i * j) % 2 + (i * j) % 3) % 2 === 0
    	    case exports.Patterns.PATTERN111: return ((i * j) % 3 + (i + j) % 2) % 2 === 0

    	    default: throw new Error('bad maskPattern:' + maskPattern)
    	  }
    	}

    	/**
    	 * Apply a mask pattern to a BitMatrix
    	 *
    	 * @param  {Number}    pattern Pattern reference number
    	 * @param  {BitMatrix} data    BitMatrix data
    	 */
    	exports.applyMask = function applyMask (pattern, data) {
    	  const size = data.size;

    	  for (let col = 0; col < size; col++) {
    	    for (let row = 0; row < size; row++) {
    	      if (data.isReserved(row, col)) continue
    	      data.xor(row, col, getMaskAt(pattern, row, col));
    	    }
    	  }
    	};

    	/**
    	 * Returns the best mask pattern for data
    	 *
    	 * @param  {BitMatrix} data
    	 * @return {Number} Mask pattern reference number
    	 */
    	exports.getBestMask = function getBestMask (data, setupFormatFunc) {
    	  const numPatterns = Object.keys(exports.Patterns).length;
    	  let bestPattern = 0;
    	  let lowerPenalty = Infinity;

    	  for (let p = 0; p < numPatterns; p++) {
    	    setupFormatFunc(p);
    	    exports.applyMask(p, data);

    	    // Calculate penalty
    	    const penalty =
    	      exports.getPenaltyN1(data) +
    	      exports.getPenaltyN2(data) +
    	      exports.getPenaltyN3(data) +
    	      exports.getPenaltyN4(data);

    	    // Undo previously applied mask
    	    exports.applyMask(p, data);

    	    if (penalty < lowerPenalty) {
    	      lowerPenalty = penalty;
    	      bestPattern = p;
    	    }
    	  }

    	  return bestPattern
    	}; 
    } (maskPattern));

    var errorCorrectionCode = {};

    const ECLevel$1 = errorCorrectionLevel;

    const EC_BLOCKS_TABLE = [
    // L  M  Q  H
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 2, 2,
      1, 2, 2, 4,
      1, 2, 4, 4,
      2, 4, 4, 4,
      2, 4, 6, 5,
      2, 4, 6, 6,
      2, 5, 8, 8,
      4, 5, 8, 8,
      4, 5, 8, 11,
      4, 8, 10, 11,
      4, 9, 12, 16,
      4, 9, 16, 16,
      6, 10, 12, 18,
      6, 10, 17, 16,
      6, 11, 16, 19,
      6, 13, 18, 21,
      7, 14, 21, 25,
      8, 16, 20, 25,
      8, 17, 23, 25,
      9, 17, 23, 34,
      9, 18, 25, 30,
      10, 20, 27, 32,
      12, 21, 29, 35,
      12, 23, 34, 37,
      12, 25, 34, 40,
      13, 26, 35, 42,
      14, 28, 38, 45,
      15, 29, 40, 48,
      16, 31, 43, 51,
      17, 33, 45, 54,
      18, 35, 48, 57,
      19, 37, 51, 60,
      19, 38, 53, 63,
      20, 40, 56, 66,
      21, 43, 59, 70,
      22, 45, 62, 74,
      24, 47, 65, 77,
      25, 49, 68, 81
    ];

    const EC_CODEWORDS_TABLE = [
    // L  M  Q  H
      7, 10, 13, 17,
      10, 16, 22, 28,
      15, 26, 36, 44,
      20, 36, 52, 64,
      26, 48, 72, 88,
      36, 64, 96, 112,
      40, 72, 108, 130,
      48, 88, 132, 156,
      60, 110, 160, 192,
      72, 130, 192, 224,
      80, 150, 224, 264,
      96, 176, 260, 308,
      104, 198, 288, 352,
      120, 216, 320, 384,
      132, 240, 360, 432,
      144, 280, 408, 480,
      168, 308, 448, 532,
      180, 338, 504, 588,
      196, 364, 546, 650,
      224, 416, 600, 700,
      224, 442, 644, 750,
      252, 476, 690, 816,
      270, 504, 750, 900,
      300, 560, 810, 960,
      312, 588, 870, 1050,
      336, 644, 952, 1110,
      360, 700, 1020, 1200,
      390, 728, 1050, 1260,
      420, 784, 1140, 1350,
      450, 812, 1200, 1440,
      480, 868, 1290, 1530,
      510, 924, 1350, 1620,
      540, 980, 1440, 1710,
      570, 1036, 1530, 1800,
      570, 1064, 1590, 1890,
      600, 1120, 1680, 1980,
      630, 1204, 1770, 2100,
      660, 1260, 1860, 2220,
      720, 1316, 1950, 2310,
      750, 1372, 2040, 2430
    ];

    /**
     * Returns the number of error correction block that the QR Code should contain
     * for the specified version and error correction level.
     *
     * @param  {Number} version              QR Code version
     * @param  {Number} errorCorrectionLevel Error correction level
     * @return {Number}                      Number of error correction blocks
     */
    errorCorrectionCode.getBlocksCount = function getBlocksCount (version, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case ECLevel$1.L:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 0]
        case ECLevel$1.M:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 1]
        case ECLevel$1.Q:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 2]
        case ECLevel$1.H:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 3]
        default:
          return undefined
      }
    };

    /**
     * Returns the number of error correction codewords to use for the specified
     * version and error correction level.
     *
     * @param  {Number} version              QR Code version
     * @param  {Number} errorCorrectionLevel Error correction level
     * @return {Number}                      Number of error correction codewords
     */
    errorCorrectionCode.getTotalCodewordsCount = function getTotalCodewordsCount (version, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case ECLevel$1.L:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 0]
        case ECLevel$1.M:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 1]
        case ECLevel$1.Q:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 2]
        case ECLevel$1.H:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 3]
        default:
          return undefined
      }
    };

    var polynomial = {};

    var galoisField = {};

    const EXP_TABLE = new Uint8Array(512);
    const LOG_TABLE = new Uint8Array(256)
    /**
     * Precompute the log and anti-log tables for faster computation later
     *
     * For each possible value in the galois field 2^8, we will pre-compute
     * the logarithm and anti-logarithm (exponential) of this value
     *
     * ref {@link https://en.wikiversity.org/wiki/Reed%E2%80%93Solomon_codes_for_coders#Introduction_to_mathematical_fields}
     */
    ;(function initTables () {
      let x = 1;
      for (let i = 0; i < 255; i++) {
        EXP_TABLE[i] = x;
        LOG_TABLE[x] = i;

        x <<= 1; // multiply by 2

        // The QR code specification says to use byte-wise modulo 100011101 arithmetic.
        // This means that when a number is 256 or larger, it should be XORed with 0x11D.
        if (x & 0x100) { // similar to x >= 256, but a lot faster (because 0x100 == 256)
          x ^= 0x11D;
        }
      }

      // Optimization: double the size of the anti-log table so that we don't need to mod 255 to
      // stay inside the bounds (because we will mainly use this table for the multiplication of
      // two GF numbers, no more).
      // @see {@link mul}
      for (let i = 255; i < 512; i++) {
        EXP_TABLE[i] = EXP_TABLE[i - 255];
      }
    }());

    /**
     * Returns log value of n inside Galois Field
     *
     * @param  {Number} n
     * @return {Number}
     */
    galoisField.log = function log (n) {
      if (n < 1) throw new Error('log(' + n + ')')
      return LOG_TABLE[n]
    };

    /**
     * Returns anti-log value of n inside Galois Field
     *
     * @param  {Number} n
     * @return {Number}
     */
    galoisField.exp = function exp (n) {
      return EXP_TABLE[n]
    };

    /**
     * Multiplies two number inside Galois Field
     *
     * @param  {Number} x
     * @param  {Number} y
     * @return {Number}
     */
    galoisField.mul = function mul (x, y) {
      if (x === 0 || y === 0) return 0

      // should be EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255] if EXP_TABLE wasn't oversized
      // @see {@link initTables}
      return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]]
    };

    (function (exports) {
    	const GF = galoisField;

    	/**
    	 * Multiplies two polynomials inside Galois Field
    	 *
    	 * @param  {Uint8Array} p1 Polynomial
    	 * @param  {Uint8Array} p2 Polynomial
    	 * @return {Uint8Array}    Product of p1 and p2
    	 */
    	exports.mul = function mul (p1, p2) {
    	  const coeff = new Uint8Array(p1.length + p2.length - 1);

    	  for (let i = 0; i < p1.length; i++) {
    	    for (let j = 0; j < p2.length; j++) {
    	      coeff[i + j] ^= GF.mul(p1[i], p2[j]);
    	    }
    	  }

    	  return coeff
    	};

    	/**
    	 * Calculate the remainder of polynomials division
    	 *
    	 * @param  {Uint8Array} divident Polynomial
    	 * @param  {Uint8Array} divisor  Polynomial
    	 * @return {Uint8Array}          Remainder
    	 */
    	exports.mod = function mod (divident, divisor) {
    	  let result = new Uint8Array(divident);

    	  while ((result.length - divisor.length) >= 0) {
    	    const coeff = result[0];

    	    for (let i = 0; i < divisor.length; i++) {
    	      result[i] ^= GF.mul(divisor[i], coeff);
    	    }

    	    // remove all zeros from buffer head
    	    let offset = 0;
    	    while (offset < result.length && result[offset] === 0) offset++;
    	    result = result.slice(offset);
    	  }

    	  return result
    	};

    	/**
    	 * Generate an irreducible generator polynomial of specified degree
    	 * (used by Reed-Solomon encoder)
    	 *
    	 * @param  {Number} degree Degree of the generator polynomial
    	 * @return {Uint8Array}    Buffer containing polynomial coefficients
    	 */
    	exports.generateECPolynomial = function generateECPolynomial (degree) {
    	  let poly = new Uint8Array([1]);
    	  for (let i = 0; i < degree; i++) {
    	    poly = exports.mul(poly, new Uint8Array([1, GF.exp(i)]));
    	  }

    	  return poly
    	}; 
    } (polynomial));

    const Polynomial = polynomial;

    function ReedSolomonEncoder$1 (degree) {
      this.genPoly = undefined;
      this.degree = degree;

      if (this.degree) this.initialize(this.degree);
    }

    /**
     * Initialize the encoder.
     * The input param should correspond to the number of error correction codewords.
     *
     * @param  {Number} degree
     */
    ReedSolomonEncoder$1.prototype.initialize = function initialize (degree) {
      // create an irreducible generator polynomial
      this.degree = degree;
      this.genPoly = Polynomial.generateECPolynomial(this.degree);
    };

    /**
     * Encodes a chunk of data
     *
     * @param  {Uint8Array} data Buffer containing input data
     * @return {Uint8Array}      Buffer containing encoded data
     */
    ReedSolomonEncoder$1.prototype.encode = function encode (data) {
      if (!this.genPoly) {
        throw new Error('Encoder not initialized')
      }

      // Calculate EC for this data block
      // extends data size to data+genPoly size
      const paddedData = new Uint8Array(data.length + this.degree);
      paddedData.set(data);

      // The error correction codewords are the remainder after dividing the data codewords
      // by a generator polynomial
      const remainder = Polynomial.mod(paddedData, this.genPoly);

      // return EC data blocks (last n byte, where n is the degree of genPoly)
      // If coefficients number in remainder are less than genPoly degree,
      // pad with 0s to the left to reach the needed number of coefficients
      const start = this.degree - remainder.length;
      if (start > 0) {
        const buff = new Uint8Array(this.degree);
        buff.set(remainder, start);

        return buff
      }

      return remainder
    };

    var reedSolomonEncoder = ReedSolomonEncoder$1;

    var version = {};

    var mode = {};

    var versionCheck = {};

    /**
     * Check if QR Code version is valid
     *
     * @param  {Number}  version QR Code version
     * @return {Boolean}         true if valid version, false otherwise
     */

    versionCheck.isValid = function isValid (version) {
      return !isNaN(version) && version >= 1 && version <= 40
    };

    var regex = {};

    const numeric = '[0-9]+';
    const alphanumeric = '[A-Z $%*+\\-./:]+';
    let kanji = '(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|' +
      '[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|' +
      '[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|' +
      '[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+';
    kanji = kanji.replace(/u/g, '\\u');

    const byte = '(?:(?![A-Z0-9 $%*+\\-./:]|' + kanji + ')(?:.|[\r\n]))+';

    regex.KANJI = new RegExp(kanji, 'g');
    regex.BYTE_KANJI = new RegExp('[^A-Z0-9 $%*+\\-./:]+', 'g');
    regex.BYTE = new RegExp(byte, 'g');
    regex.NUMERIC = new RegExp(numeric, 'g');
    regex.ALPHANUMERIC = new RegExp(alphanumeric, 'g');

    const TEST_KANJI = new RegExp('^' + kanji + '$');
    const TEST_NUMERIC = new RegExp('^' + numeric + '$');
    const TEST_ALPHANUMERIC = new RegExp('^[A-Z0-9 $%*+\\-./:]+$');

    regex.testKanji = function testKanji (str) {
      return TEST_KANJI.test(str)
    };

    regex.testNumeric = function testNumeric (str) {
      return TEST_NUMERIC.test(str)
    };

    regex.testAlphanumeric = function testAlphanumeric (str) {
      return TEST_ALPHANUMERIC.test(str)
    };

    (function (exports) {
    	const VersionCheck = versionCheck;
    	const Regex = regex;

    	/**
    	 * Numeric mode encodes data from the decimal digit set (0 - 9)
    	 * (byte values 30HEX to 39HEX).
    	 * Normally, 3 data characters are represented by 10 bits.
    	 *
    	 * @type {Object}
    	 */
    	exports.NUMERIC = {
    	  id: 'Numeric',
    	  bit: 1 << 0,
    	  ccBits: [10, 12, 14]
    	};

    	/**
    	 * Alphanumeric mode encodes data from a set of 45 characters,
    	 * i.e. 10 numeric digits (0 - 9),
    	 *      26 alphabetic characters (A - Z),
    	 *   and 9 symbols (SP, $, %, *, +, -, ., /, :).
    	 * Normally, two input characters are represented by 11 bits.
    	 *
    	 * @type {Object}
    	 */
    	exports.ALPHANUMERIC = {
    	  id: 'Alphanumeric',
    	  bit: 1 << 1,
    	  ccBits: [9, 11, 13]
    	};

    	/**
    	 * In byte mode, data is encoded at 8 bits per character.
    	 *
    	 * @type {Object}
    	 */
    	exports.BYTE = {
    	  id: 'Byte',
    	  bit: 1 << 2,
    	  ccBits: [8, 16, 16]
    	};

    	/**
    	 * The Kanji mode efficiently encodes Kanji characters in accordance with
    	 * the Shift JIS system based on JIS X 0208.
    	 * The Shift JIS values are shifted from the JIS X 0208 values.
    	 * JIS X 0208 gives details of the shift coded representation.
    	 * Each two-byte character value is compacted to a 13-bit binary codeword.
    	 *
    	 * @type {Object}
    	 */
    	exports.KANJI = {
    	  id: 'Kanji',
    	  bit: 1 << 3,
    	  ccBits: [8, 10, 12]
    	};

    	/**
    	 * Mixed mode will contain a sequences of data in a combination of any of
    	 * the modes described above
    	 *
    	 * @type {Object}
    	 */
    	exports.MIXED = {
    	  bit: -1
    	};

    	/**
    	 * Returns the number of bits needed to store the data length
    	 * according to QR Code specifications.
    	 *
    	 * @param  {Mode}   mode    Data mode
    	 * @param  {Number} version QR Code version
    	 * @return {Number}         Number of bits
    	 */
    	exports.getCharCountIndicator = function getCharCountIndicator (mode, version) {
    	  if (!mode.ccBits) throw new Error('Invalid mode: ' + mode)

    	  if (!VersionCheck.isValid(version)) {
    	    throw new Error('Invalid version: ' + version)
    	  }

    	  if (version >= 1 && version < 10) return mode.ccBits[0]
    	  else if (version < 27) return mode.ccBits[1]
    	  return mode.ccBits[2]
    	};

    	/**
    	 * Returns the most efficient mode to store the specified data
    	 *
    	 * @param  {String} dataStr Input data string
    	 * @return {Mode}           Best mode
    	 */
    	exports.getBestModeForData = function getBestModeForData (dataStr) {
    	  if (Regex.testNumeric(dataStr)) return exports.NUMERIC
    	  else if (Regex.testAlphanumeric(dataStr)) return exports.ALPHANUMERIC
    	  else if (Regex.testKanji(dataStr)) return exports.KANJI
    	  else return exports.BYTE
    	};

    	/**
    	 * Return mode name as string
    	 *
    	 * @param {Mode} mode Mode object
    	 * @returns {String}  Mode name
    	 */
    	exports.toString = function toString (mode) {
    	  if (mode && mode.id) return mode.id
    	  throw new Error('Invalid mode')
    	};

    	/**
    	 * Check if input param is a valid mode object
    	 *
    	 * @param   {Mode}    mode Mode object
    	 * @returns {Boolean} True if valid mode, false otherwise
    	 */
    	exports.isValid = function isValid (mode) {
    	  return mode && mode.bit && mode.ccBits
    	};

    	/**
    	 * Get mode object from its name
    	 *
    	 * @param   {String} string Mode name
    	 * @returns {Mode}          Mode object
    	 */
    	function fromString (string) {
    	  if (typeof string !== 'string') {
    	    throw new Error('Param is not a string')
    	  }

    	  const lcStr = string.toLowerCase();

    	  switch (lcStr) {
    	    case 'numeric':
    	      return exports.NUMERIC
    	    case 'alphanumeric':
    	      return exports.ALPHANUMERIC
    	    case 'kanji':
    	      return exports.KANJI
    	    case 'byte':
    	      return exports.BYTE
    	    default:
    	      throw new Error('Unknown mode: ' + string)
    	  }
    	}

    	/**
    	 * Returns mode from a value.
    	 * If value is not a valid mode, returns defaultValue
    	 *
    	 * @param  {Mode|String} value        Encoding mode
    	 * @param  {Mode}        defaultValue Fallback value
    	 * @return {Mode}                     Encoding mode
    	 */
    	exports.from = function from (value, defaultValue) {
    	  if (exports.isValid(value)) {
    	    return value
    	  }

    	  try {
    	    return fromString(value)
    	  } catch (e) {
    	    return defaultValue
    	  }
    	}; 
    } (mode));

    (function (exports) {
    	const Utils = utils$1;
    	const ECCode = errorCorrectionCode;
    	const ECLevel = errorCorrectionLevel;
    	const Mode = mode;
    	const VersionCheck = versionCheck;

    	// Generator polynomial used to encode version information
    	const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    	const G18_BCH = Utils.getBCHDigit(G18);

    	function getBestVersionForDataLength (mode, length, errorCorrectionLevel) {
    	  for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
    	    if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, mode)) {
    	      return currentVersion
    	    }
    	  }

    	  return undefined
    	}

    	function getReservedBitsCount (mode, version) {
    	  // Character count indicator + mode indicator bits
    	  return Mode.getCharCountIndicator(mode, version) + 4
    	}

    	function getTotalBitsFromDataArray (segments, version) {
    	  let totalBits = 0;

    	  segments.forEach(function (data) {
    	    const reservedBits = getReservedBitsCount(data.mode, version);
    	    totalBits += reservedBits + data.getBitsLength();
    	  });

    	  return totalBits
    	}

    	function getBestVersionForMixedData (segments, errorCorrectionLevel) {
    	  for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
    	    const length = getTotalBitsFromDataArray(segments, currentVersion);
    	    if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED)) {
    	      return currentVersion
    	    }
    	  }

    	  return undefined
    	}

    	/**
    	 * Returns version number from a value.
    	 * If value is not a valid version, returns defaultValue
    	 *
    	 * @param  {Number|String} value        QR Code version
    	 * @param  {Number}        defaultValue Fallback value
    	 * @return {Number}                     QR Code version number
    	 */
    	exports.from = function from (value, defaultValue) {
    	  if (VersionCheck.isValid(value)) {
    	    return parseInt(value, 10)
    	  }

    	  return defaultValue
    	};

    	/**
    	 * Returns how much data can be stored with the specified QR code version
    	 * and error correction level
    	 *
    	 * @param  {Number} version              QR Code version (1-40)
    	 * @param  {Number} errorCorrectionLevel Error correction level
    	 * @param  {Mode}   mode                 Data mode
    	 * @return {Number}                      Quantity of storable data
    	 */
    	exports.getCapacity = function getCapacity (version, errorCorrectionLevel, mode) {
    	  if (!VersionCheck.isValid(version)) {
    	    throw new Error('Invalid QR Code version')
    	  }

    	  // Use Byte mode as default
    	  if (typeof mode === 'undefined') mode = Mode.BYTE;

    	  // Total codewords for this QR code version (Data + Error correction)
    	  const totalCodewords = Utils.getSymbolTotalCodewords(version);

    	  // Total number of error correction codewords
    	  const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);

    	  // Total number of data codewords
    	  const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;

    	  if (mode === Mode.MIXED) return dataTotalCodewordsBits

    	  const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version);

    	  // Return max number of storable codewords
    	  switch (mode) {
    	    case Mode.NUMERIC:
    	      return Math.floor((usableBits / 10) * 3)

    	    case Mode.ALPHANUMERIC:
    	      return Math.floor((usableBits / 11) * 2)

    	    case Mode.KANJI:
    	      return Math.floor(usableBits / 13)

    	    case Mode.BYTE:
    	    default:
    	      return Math.floor(usableBits / 8)
    	  }
    	};

    	/**
    	 * Returns the minimum version needed to contain the amount of data
    	 *
    	 * @param  {Segment} data                    Segment of data
    	 * @param  {Number} [errorCorrectionLevel=H] Error correction level
    	 * @param  {Mode} mode                       Data mode
    	 * @return {Number}                          QR Code version
    	 */
    	exports.getBestVersionForData = function getBestVersionForData (data, errorCorrectionLevel) {
    	  let seg;

    	  const ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);

    	  if (Array.isArray(data)) {
    	    if (data.length > 1) {
    	      return getBestVersionForMixedData(data, ecl)
    	    }

    	    if (data.length === 0) {
    	      return 1
    	    }

    	    seg = data[0];
    	  } else {
    	    seg = data;
    	  }

    	  return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl)
    	};

    	/**
    	 * Returns version information with relative error correction bits
    	 *
    	 * The version information is included in QR Code symbols of version 7 or larger.
    	 * It consists of an 18-bit sequence containing 6 data bits,
    	 * with 12 error correction bits calculated using the (18, 6) Golay code.
    	 *
    	 * @param  {Number} version QR Code version
    	 * @return {Number}         Encoded version info bits
    	 */
    	exports.getEncodedBits = function getEncodedBits (version) {
    	  if (!VersionCheck.isValid(version) || version < 7) {
    	    throw new Error('Invalid QR Code version')
    	  }

    	  let d = version << 12;

    	  while (Utils.getBCHDigit(d) - G18_BCH >= 0) {
    	    d ^= (G18 << (Utils.getBCHDigit(d) - G18_BCH));
    	  }

    	  return (version << 12) | d
    	}; 
    } (version));

    var formatInfo = {};

    const Utils$3 = utils$1;

    const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
    const G15_BCH = Utils$3.getBCHDigit(G15);

    /**
     * Returns format information with relative error correction bits
     *
     * The format information is a 15-bit sequence containing 5 data bits,
     * with 10 error correction bits calculated using the (15, 5) BCH code.
     *
     * @param  {Number} errorCorrectionLevel Error correction level
     * @param  {Number} mask                 Mask pattern
     * @return {Number}                      Encoded format information bits
     */
    formatInfo.getEncodedBits = function getEncodedBits (errorCorrectionLevel, mask) {
      const data = ((errorCorrectionLevel.bit << 3) | mask);
      let d = data << 10;

      while (Utils$3.getBCHDigit(d) - G15_BCH >= 0) {
        d ^= (G15 << (Utils$3.getBCHDigit(d) - G15_BCH));
      }

      // xor final data with mask pattern in order to ensure that
      // no combination of Error Correction Level and data mask pattern
      // will result in an all-zero data string
      return ((data << 10) | d) ^ G15_MASK
    };

    var segments = {};

    const Mode$4 = mode;

    function NumericData (data) {
      this.mode = Mode$4.NUMERIC;
      this.data = data.toString();
    }

    NumericData.getBitsLength = function getBitsLength (length) {
      return 10 * Math.floor(length / 3) + ((length % 3) ? ((length % 3) * 3 + 1) : 0)
    };

    NumericData.prototype.getLength = function getLength () {
      return this.data.length
    };

    NumericData.prototype.getBitsLength = function getBitsLength () {
      return NumericData.getBitsLength(this.data.length)
    };

    NumericData.prototype.write = function write (bitBuffer) {
      let i, group, value;

      // The input data string is divided into groups of three digits,
      // and each group is converted to its 10-bit binary equivalent.
      for (i = 0; i + 3 <= this.data.length; i += 3) {
        group = this.data.substr(i, 3);
        value = parseInt(group, 10);

        bitBuffer.put(value, 10);
      }

      // If the number of input digits is not an exact multiple of three,
      // the final one or two digits are converted to 4 or 7 bits respectively.
      const remainingNum = this.data.length - i;
      if (remainingNum > 0) {
        group = this.data.substr(i);
        value = parseInt(group, 10);

        bitBuffer.put(value, remainingNum * 3 + 1);
      }
    };

    var numericData = NumericData;

    const Mode$3 = mode;

    /**
     * Array of characters available in alphanumeric mode
     *
     * As per QR Code specification, to each character
     * is assigned a value from 0 to 44 which in this case coincides
     * with the array index
     *
     * @type {Array}
     */
    const ALPHA_NUM_CHARS = [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      ' ', '$', '%', '*', '+', '-', '.', '/', ':'
    ];

    function AlphanumericData (data) {
      this.mode = Mode$3.ALPHANUMERIC;
      this.data = data;
    }

    AlphanumericData.getBitsLength = function getBitsLength (length) {
      return 11 * Math.floor(length / 2) + 6 * (length % 2)
    };

    AlphanumericData.prototype.getLength = function getLength () {
      return this.data.length
    };

    AlphanumericData.prototype.getBitsLength = function getBitsLength () {
      return AlphanumericData.getBitsLength(this.data.length)
    };

    AlphanumericData.prototype.write = function write (bitBuffer) {
      let i;

      // Input data characters are divided into groups of two characters
      // and encoded as 11-bit binary codes.
      for (i = 0; i + 2 <= this.data.length; i += 2) {
        // The character value of the first character is multiplied by 45
        let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;

        // The character value of the second digit is added to the product
        value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]);

        // The sum is then stored as 11-bit binary number
        bitBuffer.put(value, 11);
      }

      // If the number of input data characters is not a multiple of two,
      // the character value of the final character is encoded as a 6-bit binary number.
      if (this.data.length % 2) {
        bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
      }
    };

    var alphanumericData = AlphanumericData;

    var encodeUtf8$1 = function encodeUtf8 (input) {
      var result = [];
      var size = input.length;

      for (var index = 0; index < size; index++) {
        var point = input.charCodeAt(index);

        if (point >= 0xD800 && point <= 0xDBFF && size > index + 1) {
          var second = input.charCodeAt(index + 1);

          if (second >= 0xDC00 && second <= 0xDFFF) {
            // https://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
            point = (point - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
            index += 1;
          }
        }

        // US-ASCII
        if (point < 0x80) {
          result.push(point);
          continue
        }

        // 2-byte UTF-8
        if (point < 0x800) {
          result.push((point >> 6) | 192);
          result.push((point & 63) | 128);
          continue
        }

        // 3-byte UTF-8
        if (point < 0xD800 || (point >= 0xE000 && point < 0x10000)) {
          result.push((point >> 12) | 224);
          result.push(((point >> 6) & 63) | 128);
          result.push((point & 63) | 128);
          continue
        }

        // 4-byte UTF-8
        if (point >= 0x10000 && point <= 0x10FFFF) {
          result.push((point >> 18) | 240);
          result.push(((point >> 12) & 63) | 128);
          result.push(((point >> 6) & 63) | 128);
          result.push((point & 63) | 128);
          continue
        }

        // Invalid character
        result.push(0xEF, 0xBF, 0xBD);
      }

      return new Uint8Array(result).buffer
    };

    const encodeUtf8 = encodeUtf8$1;
    const Mode$2 = mode;

    function ByteData (data) {
      this.mode = Mode$2.BYTE;
      if (typeof (data) === 'string') {
        data = encodeUtf8(data);
      }
      this.data = new Uint8Array(data);
    }

    ByteData.getBitsLength = function getBitsLength (length) {
      return length * 8
    };

    ByteData.prototype.getLength = function getLength () {
      return this.data.length
    };

    ByteData.prototype.getBitsLength = function getBitsLength () {
      return ByteData.getBitsLength(this.data.length)
    };

    ByteData.prototype.write = function (bitBuffer) {
      for (let i = 0, l = this.data.length; i < l; i++) {
        bitBuffer.put(this.data[i], 8);
      }
    };

    var byteData = ByteData;

    const Mode$1 = mode;
    const Utils$2 = utils$1;

    function KanjiData (data) {
      this.mode = Mode$1.KANJI;
      this.data = data;
    }

    KanjiData.getBitsLength = function getBitsLength (length) {
      return length * 13
    };

    KanjiData.prototype.getLength = function getLength () {
      return this.data.length
    };

    KanjiData.prototype.getBitsLength = function getBitsLength () {
      return KanjiData.getBitsLength(this.data.length)
    };

    KanjiData.prototype.write = function (bitBuffer) {
      let i;

      // In the Shift JIS system, Kanji characters are represented by a two byte combination.
      // These byte values are shifted from the JIS X 0208 values.
      // JIS X 0208 gives details of the shift coded representation.
      for (i = 0; i < this.data.length; i++) {
        let value = Utils$2.toSJIS(this.data[i]);

        // For characters with Shift JIS values from 0x8140 to 0x9FFC:
        if (value >= 0x8140 && value <= 0x9FFC) {
          // Subtract 0x8140 from Shift JIS value
          value -= 0x8140;

        // For characters with Shift JIS values from 0xE040 to 0xEBBF
        } else if (value >= 0xE040 && value <= 0xEBBF) {
          // Subtract 0xC140 from Shift JIS value
          value -= 0xC140;
        } else {
          throw new Error(
            'Invalid SJIS character: ' + this.data[i] + '\n' +
            'Make sure your charset is UTF-8')
        }

        // Multiply most significant byte of result by 0xC0
        // and add least significant byte to product
        value = (((value >>> 8) & 0xff) * 0xC0) + (value & 0xff);

        // Convert result to a 13-bit binary string
        bitBuffer.put(value, 13);
      }
    };

    var kanjiData = KanjiData;

    var dijkstra = {exports: {}};

    (function (module) {

    	/******************************************************************************
    	 * Created 2008-08-19.
    	 *
    	 * Dijkstra path-finding functions. Adapted from the Dijkstar Python project.
    	 *
    	 * Copyright (C) 2008
    	 *   Wyatt Baldwin <self@wyattbaldwin.com>
    	 *   All rights reserved
    	 *
    	 * Licensed under the MIT license.
    	 *
    	 *   http://www.opensource.org/licenses/mit-license.php
    	 *
    	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    	 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    	 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    	 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    	 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    	 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    	 * THE SOFTWARE.
    	 *****************************************************************************/
    	var dijkstra = {
    	  single_source_shortest_paths: function(graph, s, d) {
    	    // Predecessor map for each node that has been encountered.
    	    // node ID => predecessor node ID
    	    var predecessors = {};

    	    // Costs of shortest paths from s to all nodes encountered.
    	    // node ID => cost
    	    var costs = {};
    	    costs[s] = 0;

    	    // Costs of shortest paths from s to all nodes encountered; differs from
    	    // `costs` in that it provides easy access to the node that currently has
    	    // the known shortest path from s.
    	    // XXX: Do we actually need both `costs` and `open`?
    	    var open = dijkstra.PriorityQueue.make();
    	    open.push(s, 0);

    	    var closest,
    	        u, v,
    	        cost_of_s_to_u,
    	        adjacent_nodes,
    	        cost_of_e,
    	        cost_of_s_to_u_plus_cost_of_e,
    	        cost_of_s_to_v,
    	        first_visit;
    	    while (!open.empty()) {
    	      // In the nodes remaining in graph that have a known cost from s,
    	      // find the node, u, that currently has the shortest path from s.
    	      closest = open.pop();
    	      u = closest.value;
    	      cost_of_s_to_u = closest.cost;

    	      // Get nodes adjacent to u...
    	      adjacent_nodes = graph[u] || {};

    	      // ...and explore the edges that connect u to those nodes, updating
    	      // the cost of the shortest paths to any or all of those nodes as
    	      // necessary. v is the node across the current edge from u.
    	      for (v in adjacent_nodes) {
    	        if (adjacent_nodes.hasOwnProperty(v)) {
    	          // Get the cost of the edge running from u to v.
    	          cost_of_e = adjacent_nodes[v];

    	          // Cost of s to u plus the cost of u to v across e--this is *a*
    	          // cost from s to v that may or may not be less than the current
    	          // known cost to v.
    	          cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;

    	          // If we haven't visited v yet OR if the current known cost from s to
    	          // v is greater than the new cost we just found (cost of s to u plus
    	          // cost of u to v across e), update v's cost in the cost list and
    	          // update v's predecessor in the predecessor list (it's now u).
    	          cost_of_s_to_v = costs[v];
    	          first_visit = (typeof costs[v] === 'undefined');
    	          if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
    	            costs[v] = cost_of_s_to_u_plus_cost_of_e;
    	            open.push(v, cost_of_s_to_u_plus_cost_of_e);
    	            predecessors[v] = u;
    	          }
    	        }
    	      }
    	    }

    	    if (typeof d !== 'undefined' && typeof costs[d] === 'undefined') {
    	      var msg = ['Could not find a path from ', s, ' to ', d, '.'].join('');
    	      throw new Error(msg);
    	    }

    	    return predecessors;
    	  },

    	  extract_shortest_path_from_predecessor_list: function(predecessors, d) {
    	    var nodes = [];
    	    var u = d;
    	    while (u) {
    	      nodes.push(u);
    	      predecessors[u];
    	      u = predecessors[u];
    	    }
    	    nodes.reverse();
    	    return nodes;
    	  },

    	  find_path: function(graph, s, d) {
    	    var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
    	    return dijkstra.extract_shortest_path_from_predecessor_list(
    	      predecessors, d);
    	  },

    	  /**
    	   * A very naive priority queue implementation.
    	   */
    	  PriorityQueue: {
    	    make: function (opts) {
    	      var T = dijkstra.PriorityQueue,
    	          t = {},
    	          key;
    	      opts = opts || {};
    	      for (key in T) {
    	        if (T.hasOwnProperty(key)) {
    	          t[key] = T[key];
    	        }
    	      }
    	      t.queue = [];
    	      t.sorter = opts.sorter || T.default_sorter;
    	      return t;
    	    },

    	    default_sorter: function (a, b) {
    	      return a.cost - b.cost;
    	    },

    	    /**
    	     * Add a new item to the queue and ensure the highest priority element
    	     * is at the front of the queue.
    	     */
    	    push: function (value, cost) {
    	      var item = {value: value, cost: cost};
    	      this.queue.push(item);
    	      this.queue.sort(this.sorter);
    	    },

    	    /**
    	     * Return the highest priority element in the queue.
    	     */
    	    pop: function () {
    	      return this.queue.shift();
    	    },

    	    empty: function () {
    	      return this.queue.length === 0;
    	    }
    	  }
    	};


    	// node.js module exports
    	{
    	  module.exports = dijkstra;
    	} 
    } (dijkstra));

    var dijkstraExports = dijkstra.exports;

    (function (exports) {
    	const Mode = mode;
    	const NumericData = numericData;
    	const AlphanumericData = alphanumericData;
    	const ByteData = byteData;
    	const KanjiData = kanjiData;
    	const Regex = regex;
    	const Utils = utils$1;
    	const dijkstra = dijkstraExports;

    	/**
    	 * Returns UTF8 byte length
    	 *
    	 * @param  {String} str Input string
    	 * @return {Number}     Number of byte
    	 */
    	function getStringByteLength (str) {
    	  return unescape(encodeURIComponent(str)).length
    	}

    	/**
    	 * Get a list of segments of the specified mode
    	 * from a string
    	 *
    	 * @param  {Mode}   mode Segment mode
    	 * @param  {String} str  String to process
    	 * @return {Array}       Array of object with segments data
    	 */
    	function getSegments (regex, mode, str) {
    	  const segments = [];
    	  let result;

    	  while ((result = regex.exec(str)) !== null) {
    	    segments.push({
    	      data: result[0],
    	      index: result.index,
    	      mode: mode,
    	      length: result[0].length
    	    });
    	  }

    	  return segments
    	}

    	/**
    	 * Extracts a series of segments with the appropriate
    	 * modes from a string
    	 *
    	 * @param  {String} dataStr Input string
    	 * @return {Array}          Array of object with segments data
    	 */
    	function getSegmentsFromString (dataStr) {
    	  const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
    	  const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
    	  let byteSegs;
    	  let kanjiSegs;

    	  if (Utils.isKanjiModeEnabled()) {
    	    byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
    	    kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
    	  } else {
    	    byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
    	    kanjiSegs = [];
    	  }

    	  const segs = numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs);

    	  return segs
    	    .sort(function (s1, s2) {
    	      return s1.index - s2.index
    	    })
    	    .map(function (obj) {
    	      return {
    	        data: obj.data,
    	        mode: obj.mode,
    	        length: obj.length
    	      }
    	    })
    	}

    	/**
    	 * Returns how many bits are needed to encode a string of
    	 * specified length with the specified mode
    	 *
    	 * @param  {Number} length String length
    	 * @param  {Mode} mode     Segment mode
    	 * @return {Number}        Bit length
    	 */
    	function getSegmentBitsLength (length, mode) {
    	  switch (mode) {
    	    case Mode.NUMERIC:
    	      return NumericData.getBitsLength(length)
    	    case Mode.ALPHANUMERIC:
    	      return AlphanumericData.getBitsLength(length)
    	    case Mode.KANJI:
    	      return KanjiData.getBitsLength(length)
    	    case Mode.BYTE:
    	      return ByteData.getBitsLength(length)
    	  }
    	}

    	/**
    	 * Merges adjacent segments which have the same mode
    	 *
    	 * @param  {Array} segs Array of object with segments data
    	 * @return {Array}      Array of object with segments data
    	 */
    	function mergeSegments (segs) {
    	  return segs.reduce(function (acc, curr) {
    	    const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
    	    if (prevSeg && prevSeg.mode === curr.mode) {
    	      acc[acc.length - 1].data += curr.data;
    	      return acc
    	    }

    	    acc.push(curr);
    	    return acc
    	  }, [])
    	}

    	/**
    	 * Generates a list of all possible nodes combination which
    	 * will be used to build a segments graph.
    	 *
    	 * Nodes are divided by groups. Each group will contain a list of all the modes
    	 * in which is possible to encode the given text.
    	 *
    	 * For example the text '12345' can be encoded as Numeric, Alphanumeric or Byte.
    	 * The group for '12345' will contain then 3 objects, one for each
    	 * possible encoding mode.
    	 *
    	 * Each node represents a possible segment.
    	 *
    	 * @param  {Array} segs Array of object with segments data
    	 * @return {Array}      Array of object with segments data
    	 */
    	function buildNodes (segs) {
    	  const nodes = [];
    	  for (let i = 0; i < segs.length; i++) {
    	    const seg = segs[i];

    	    switch (seg.mode) {
    	      case Mode.NUMERIC:
    	        nodes.push([seg,
    	          { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
    	          { data: seg.data, mode: Mode.BYTE, length: seg.length }
    	        ]);
    	        break
    	      case Mode.ALPHANUMERIC:
    	        nodes.push([seg,
    	          { data: seg.data, mode: Mode.BYTE, length: seg.length }
    	        ]);
    	        break
    	      case Mode.KANJI:
    	        nodes.push([seg,
    	          { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
    	        ]);
    	        break
    	      case Mode.BYTE:
    	        nodes.push([
    	          { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
    	        ]);
    	    }
    	  }

    	  return nodes
    	}

    	/**
    	 * Builds a graph from a list of nodes.
    	 * All segments in each node group will be connected with all the segments of
    	 * the next group and so on.
    	 *
    	 * At each connection will be assigned a weight depending on the
    	 * segment's byte length.
    	 *
    	 * @param  {Array} nodes    Array of object with segments data
    	 * @param  {Number} version QR Code version
    	 * @return {Object}         Graph of all possible segments
    	 */
    	function buildGraph (nodes, version) {
    	  const table = {};
    	  const graph = { start: {} };
    	  let prevNodeIds = ['start'];

    	  for (let i = 0; i < nodes.length; i++) {
    	    const nodeGroup = nodes[i];
    	    const currentNodeIds = [];

    	    for (let j = 0; j < nodeGroup.length; j++) {
    	      const node = nodeGroup[j];
    	      const key = '' + i + j;

    	      currentNodeIds.push(key);
    	      table[key] = { node: node, lastCount: 0 };
    	      graph[key] = {};

    	      for (let n = 0; n < prevNodeIds.length; n++) {
    	        const prevNodeId = prevNodeIds[n];

    	        if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
    	          graph[prevNodeId][key] =
    	            getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) -
    	            getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);

    	          table[prevNodeId].lastCount += node.length;
    	        } else {
    	          if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;

    	          graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) +
    	            4 + Mode.getCharCountIndicator(node.mode, version); // switch cost
    	        }
    	      }
    	    }

    	    prevNodeIds = currentNodeIds;
    	  }

    	  for (let n = 0; n < prevNodeIds.length; n++) {
    	    graph[prevNodeIds[n]].end = 0;
    	  }

    	  return { map: graph, table: table }
    	}

    	/**
    	 * Builds a segment from a specified data and mode.
    	 * If a mode is not specified, the more suitable will be used.
    	 *
    	 * @param  {String} data             Input data
    	 * @param  {Mode | String} modesHint Data mode
    	 * @return {Segment}                 Segment
    	 */
    	function buildSingleSegment (data, modesHint) {
    	  let mode;
    	  const bestMode = Mode.getBestModeForData(data);

    	  mode = Mode.from(modesHint, bestMode);

    	  // Make sure data can be encoded
    	  if (mode !== Mode.BYTE && mode.bit < bestMode.bit) {
    	    throw new Error('"' + data + '"' +
    	      ' cannot be encoded with mode ' + Mode.toString(mode) +
    	      '.\n Suggested mode is: ' + Mode.toString(bestMode))
    	  }

    	  // Use Mode.BYTE if Kanji support is disabled
    	  if (mode === Mode.KANJI && !Utils.isKanjiModeEnabled()) {
    	    mode = Mode.BYTE;
    	  }

    	  switch (mode) {
    	    case Mode.NUMERIC:
    	      return new NumericData(data)

    	    case Mode.ALPHANUMERIC:
    	      return new AlphanumericData(data)

    	    case Mode.KANJI:
    	      return new KanjiData(data)

    	    case Mode.BYTE:
    	      return new ByteData(data)
    	  }
    	}

    	/**
    	 * Builds a list of segments from an array.
    	 * Array can contain Strings or Objects with segment's info.
    	 *
    	 * For each item which is a string, will be generated a segment with the given
    	 * string and the more appropriate encoding mode.
    	 *
    	 * For each item which is an object, will be generated a segment with the given
    	 * data and mode.
    	 * Objects must contain at least the property "data".
    	 * If property "mode" is not present, the more suitable mode will be used.
    	 *
    	 * @param  {Array} array Array of objects with segments data
    	 * @return {Array}       Array of Segments
    	 */
    	exports.fromArray = function fromArray (array) {
    	  return array.reduce(function (acc, seg) {
    	    if (typeof seg === 'string') {
    	      acc.push(buildSingleSegment(seg, null));
    	    } else if (seg.data) {
    	      acc.push(buildSingleSegment(seg.data, seg.mode));
    	    }

    	    return acc
    	  }, [])
    	};

    	/**
    	 * Builds an optimized sequence of segments from a string,
    	 * which will produce the shortest possible bitstream.
    	 *
    	 * @param  {String} data    Input string
    	 * @param  {Number} version QR Code version
    	 * @return {Array}          Array of segments
    	 */
    	exports.fromString = function fromString (data, version) {
    	  const segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled());

    	  const nodes = buildNodes(segs);
    	  const graph = buildGraph(nodes, version);
    	  const path = dijkstra.find_path(graph.map, 'start', 'end');

    	  const optimizedSegs = [];
    	  for (let i = 1; i < path.length - 1; i++) {
    	    optimizedSegs.push(graph.table[path[i]].node);
    	  }

    	  return exports.fromArray(mergeSegments(optimizedSegs))
    	};

    	/**
    	 * Splits a string in various segments with the modes which
    	 * best represent their content.
    	 * The produced segments are far from being optimized.
    	 * The output of this function is only used to estimate a QR Code version
    	 * which may contain the data.
    	 *
    	 * @param  {string} data Input string
    	 * @return {Array}       Array of segments
    	 */
    	exports.rawSplit = function rawSplit (data) {
    	  return exports.fromArray(
    	    getSegmentsFromString(data, Utils.isKanjiModeEnabled())
    	  )
    	}; 
    } (segments));

    const Utils$1 = utils$1;
    const ECLevel = errorCorrectionLevel;
    const BitBuffer = bitBuffer;
    const BitMatrix = bitMatrix;
    const AlignmentPattern = alignmentPattern;
    const FinderPattern = finderPattern;
    const MaskPattern = maskPattern;
    const ECCode = errorCorrectionCode;
    const ReedSolomonEncoder = reedSolomonEncoder;
    const Version = version;
    const FormatInfo = formatInfo;
    const Mode = mode;
    const Segments = segments;

    /**
     * QRCode for JavaScript
     *
     * modified by Ryan Day for nodejs support
     * Copyright (c) 2011 Ryan Day
     *
     * Licensed under the MIT license:
     *   http://www.opensource.org/licenses/mit-license.php
     *
    //---------------------------------------------------------------------
    // QRCode for JavaScript
    //
    // Copyright (c) 2009 Kazuhiko Arase
    //
    // URL: http://www.d-project.com/
    //
    // Licensed under the MIT license:
    //   http://www.opensource.org/licenses/mit-license.php
    //
    // The word "QR Code" is registered trademark of
    // DENSO WAVE INCORPORATED
    //   http://www.denso-wave.com/qrcode/faqpatent-e.html
    //
    //---------------------------------------------------------------------
    */

    /**
     * Add finder patterns bits to matrix
     *
     * @param  {BitMatrix} matrix  Modules matrix
     * @param  {Number}    version QR Code version
     */
    function setupFinderPattern (matrix, version) {
      const size = matrix.size;
      const pos = FinderPattern.getPositions(version);

      for (let i = 0; i < pos.length; i++) {
        const row = pos[i][0];
        const col = pos[i][1];

        for (let r = -1; r <= 7; r++) {
          if (row + r <= -1 || size <= row + r) continue

          for (let c = -1; c <= 7; c++) {
            if (col + c <= -1 || size <= col + c) continue

            if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
              (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
              (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
              matrix.set(row + r, col + c, true, true);
            } else {
              matrix.set(row + r, col + c, false, true);
            }
          }
        }
      }
    }

    /**
     * Add timing pattern bits to matrix
     *
     * Note: this function must be called before {@link setupAlignmentPattern}
     *
     * @param  {BitMatrix} matrix Modules matrix
     */
    function setupTimingPattern (matrix) {
      const size = matrix.size;

      for (let r = 8; r < size - 8; r++) {
        const value = r % 2 === 0;
        matrix.set(r, 6, value, true);
        matrix.set(6, r, value, true);
      }
    }

    /**
     * Add alignment patterns bits to matrix
     *
     * Note: this function must be called after {@link setupTimingPattern}
     *
     * @param  {BitMatrix} matrix  Modules matrix
     * @param  {Number}    version QR Code version
     */
    function setupAlignmentPattern (matrix, version) {
      const pos = AlignmentPattern.getPositions(version);

      for (let i = 0; i < pos.length; i++) {
        const row = pos[i][0];
        const col = pos[i][1];

        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            if (r === -2 || r === 2 || c === -2 || c === 2 ||
              (r === 0 && c === 0)) {
              matrix.set(row + r, col + c, true, true);
            } else {
              matrix.set(row + r, col + c, false, true);
            }
          }
        }
      }
    }

    /**
     * Add version info bits to matrix
     *
     * @param  {BitMatrix} matrix  Modules matrix
     * @param  {Number}    version QR Code version
     */
    function setupVersionInfo (matrix, version) {
      const size = matrix.size;
      const bits = Version.getEncodedBits(version);
      let row, col, mod;

      for (let i = 0; i < 18; i++) {
        row = Math.floor(i / 3);
        col = i % 3 + size - 8 - 3;
        mod = ((bits >> i) & 1) === 1;

        matrix.set(row, col, mod, true);
        matrix.set(col, row, mod, true);
      }
    }

    /**
     * Add format info bits to matrix
     *
     * @param  {BitMatrix} matrix               Modules matrix
     * @param  {ErrorCorrectionLevel}    errorCorrectionLevel Error correction level
     * @param  {Number}    maskPattern          Mask pattern reference value
     */
    function setupFormatInfo (matrix, errorCorrectionLevel, maskPattern) {
      const size = matrix.size;
      const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern);
      let i, mod;

      for (i = 0; i < 15; i++) {
        mod = ((bits >> i) & 1) === 1;

        // vertical
        if (i < 6) {
          matrix.set(i, 8, mod, true);
        } else if (i < 8) {
          matrix.set(i + 1, 8, mod, true);
        } else {
          matrix.set(size - 15 + i, 8, mod, true);
        }

        // horizontal
        if (i < 8) {
          matrix.set(8, size - i - 1, mod, true);
        } else if (i < 9) {
          matrix.set(8, 15 - i - 1 + 1, mod, true);
        } else {
          matrix.set(8, 15 - i - 1, mod, true);
        }
      }

      // fixed module
      matrix.set(size - 8, 8, 1, true);
    }

    /**
     * Add encoded data bits to matrix
     *
     * @param  {BitMatrix}  matrix Modules matrix
     * @param  {Uint8Array} data   Data codewords
     */
    function setupData (matrix, data) {
      const size = matrix.size;
      let inc = -1;
      let row = size - 1;
      let bitIndex = 7;
      let byteIndex = 0;

      for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;

        while (true) {
          for (let c = 0; c < 2; c++) {
            if (!matrix.isReserved(row, col - c)) {
              let dark = false;

              if (byteIndex < data.length) {
                dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
              }

              matrix.set(row, col - c, dark);
              bitIndex--;

              if (bitIndex === -1) {
                byteIndex++;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || size <= row) {
            row -= inc;
            inc = -inc;
            break
          }
        }
      }
    }

    /**
     * Create encoded codewords from data input
     *
     * @param  {Number}   version              QR Code version
     * @param  {ErrorCorrectionLevel}   errorCorrectionLevel Error correction level
     * @param  {ByteData} data                 Data input
     * @return {Uint8Array}                    Buffer containing encoded codewords
     */
    function createData (version, errorCorrectionLevel, segments) {
      // Prepare data buffer
      const buffer = new BitBuffer();

      segments.forEach(function (data) {
        // prefix data with mode indicator (4 bits)
        buffer.put(data.mode.bit, 4);

        // Prefix data with character count indicator.
        // The character count indicator is a string of bits that represents the
        // number of characters that are being encoded.
        // The character count indicator must be placed after the mode indicator
        // and must be a certain number of bits long, depending on the QR version
        // and data mode
        // @see {@link Mode.getCharCountIndicator}.
        buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version));

        // add binary data sequence to buffer
        data.write(buffer);
      });

      // Calculate required number of bits
      const totalCodewords = Utils$1.getSymbolTotalCodewords(version);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;

      // Add a terminator.
      // If the bit string is shorter than the total number of required bits,
      // a terminator of up to four 0s must be added to the right side of the string.
      // If the bit string is more than four bits shorter than the required number of bits,
      // add four 0s to the end.
      if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) {
        buffer.put(0, 4);
      }

      // If the bit string is fewer than four bits shorter, add only the number of 0s that
      // are needed to reach the required number of bits.

      // After adding the terminator, if the number of bits in the string is not a multiple of 8,
      // pad the string on the right with 0s to make the string's length a multiple of 8.
      while (buffer.getLengthInBits() % 8 !== 0) {
        buffer.putBit(0);
      }

      // Add pad bytes if the string is still shorter than the total number of required bits.
      // Extend the buffer to fill the data capacity of the symbol corresponding to
      // the Version and Error Correction Level by adding the Pad Codewords 11101100 (0xEC)
      // and 00010001 (0x11) alternately.
      const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
      for (let i = 0; i < remainingByte; i++) {
        buffer.put(i % 2 ? 0x11 : 0xEC, 8);
      }

      return createCodewords(buffer, version, errorCorrectionLevel)
    }

    /**
     * Encode input data with Reed-Solomon and return codewords with
     * relative error correction bits
     *
     * @param  {BitBuffer} bitBuffer            Data to encode
     * @param  {Number}    version              QR Code version
     * @param  {ErrorCorrectionLevel} errorCorrectionLevel Error correction level
     * @return {Uint8Array}                     Buffer containing encoded codewords
     */
    function createCodewords (bitBuffer, version, errorCorrectionLevel) {
      // Total codewords for this QR code version (Data + Error correction)
      const totalCodewords = Utils$1.getSymbolTotalCodewords(version);

      // Total number of error correction codewords
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);

      // Total number of data codewords
      const dataTotalCodewords = totalCodewords - ecTotalCodewords;

      // Total number of blocks
      const ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel);

      // Calculate how many blocks each group should contain
      const blocksInGroup2 = totalCodewords % ecTotalBlocks;
      const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;

      const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);

      const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
      const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;

      // Number of EC codewords is the same for both groups
      const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;

      // Initialize a Reed-Solomon encoder with a generator polynomial of degree ecCount
      const rs = new ReedSolomonEncoder(ecCount);

      let offset = 0;
      const dcData = new Array(ecTotalBlocks);
      const ecData = new Array(ecTotalBlocks);
      let maxDataSize = 0;
      const buffer = new Uint8Array(bitBuffer.buffer);

      // Divide the buffer into the required number of blocks
      for (let b = 0; b < ecTotalBlocks; b++) {
        const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;

        // extract a block of data from buffer
        dcData[b] = buffer.slice(offset, offset + dataSize);

        // Calculate EC codewords for this data block
        ecData[b] = rs.encode(dcData[b]);

        offset += dataSize;
        maxDataSize = Math.max(maxDataSize, dataSize);
      }

      // Create final data
      // Interleave the data and error correction codewords from each block
      const data = new Uint8Array(totalCodewords);
      let index = 0;
      let i, r;

      // Add data codewords
      for (i = 0; i < maxDataSize; i++) {
        for (r = 0; r < ecTotalBlocks; r++) {
          if (i < dcData[r].length) {
            data[index++] = dcData[r][i];
          }
        }
      }

      // Apped EC codewords
      for (i = 0; i < ecCount; i++) {
        for (r = 0; r < ecTotalBlocks; r++) {
          data[index++] = ecData[r][i];
        }
      }

      return data
    }

    /**
     * Build QR Code symbol
     *
     * @param  {String} data                 Input string
     * @param  {Number} version              QR Code version
     * @param  {ErrorCorretionLevel} errorCorrectionLevel Error level
     * @param  {MaskPattern} maskPattern     Mask pattern
     * @return {Object}                      Object containing symbol data
     */
    function createSymbol (data, version, errorCorrectionLevel, maskPattern) {
      let segments;

      if (Array.isArray(data)) {
        segments = Segments.fromArray(data);
      } else if (typeof data === 'string') {
        let estimatedVersion = version;

        if (!estimatedVersion) {
          const rawSegments = Segments.rawSplit(data);

          // Estimate best version that can contain raw splitted segments
          estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
        }

        // Build optimized segments
        // If estimated version is undefined, try with the highest version
        segments = Segments.fromString(data, estimatedVersion || 40);
      } else {
        throw new Error('Invalid data')
      }

      // Get the min version that can contain data
      const bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel);

      // If no version is found, data cannot be stored
      if (!bestVersion) {
        throw new Error('The amount of data is too big to be stored in a QR Code')
      }

      // If not specified, use min version as default
      if (!version) {
        version = bestVersion;

      // Check if the specified version can contain the data
      } else if (version < bestVersion) {
        throw new Error('\n' +
          'The chosen QR Code version cannot contain this amount of data.\n' +
          'Minimum version required to store current data is: ' + bestVersion + '.\n'
        )
      }

      const dataBits = createData(version, errorCorrectionLevel, segments);

      // Allocate matrix buffer
      const moduleCount = Utils$1.getSymbolSize(version);
      const modules = new BitMatrix(moduleCount);

      // Add function modules
      setupFinderPattern(modules, version);
      setupTimingPattern(modules);
      setupAlignmentPattern(modules, version);

      // Add temporary dummy bits for format info just to set them as reserved.
      // This is needed to prevent these bits from being masked by {@link MaskPattern.applyMask}
      // since the masking operation must be performed only on the encoding region.
      // These blocks will be replaced with correct values later in code.
      setupFormatInfo(modules, errorCorrectionLevel, 0);

      if (version >= 7) {
        setupVersionInfo(modules, version);
      }

      // Add data codewords
      setupData(modules, dataBits);

      if (isNaN(maskPattern)) {
        // Find best mask pattern
        maskPattern = MaskPattern.getBestMask(modules,
          setupFormatInfo.bind(null, modules, errorCorrectionLevel));
      }

      // Apply mask pattern
      MaskPattern.applyMask(maskPattern, modules);

      // Replace format info bits with correct values
      setupFormatInfo(modules, errorCorrectionLevel, maskPattern);

      return {
        modules: modules,
        version: version,
        errorCorrectionLevel: errorCorrectionLevel,
        maskPattern: maskPattern,
        segments: segments
      }
    }

    /**
     * QR Code
     *
     * @param {String | Array} data                 Input data
     * @param {Object} options                      Optional configurations
     * @param {Number} options.version              QR Code version
     * @param {String} options.errorCorrectionLevel Error correction level
     * @param {Function} options.toSJISFunc         Helper func to convert utf8 to sjis
     */
    qrcode.create = function create (data, options) {
      if (typeof data === 'undefined' || data === '') {
        throw new Error('No input text')
      }

      let errorCorrectionLevel = ECLevel.M;
      let version;
      let mask;

      if (typeof options !== 'undefined') {
        // Use higher error correction level as default
        errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
        version = Version.from(options.version);
        mask = MaskPattern.from(options.maskPattern);

        if (options.toSJISFunc) {
          Utils$1.setToSJISFunction(options.toSJISFunc);
        }
      }

      return createSymbol(data, version, errorCorrectionLevel, mask)
    };

    var canvas = {};

    var utils = {};

    (function (exports) {
    	function hex2rgba (hex) {
    	  if (typeof hex === 'number') {
    	    hex = hex.toString();
    	  }

    	  if (typeof hex !== 'string') {
    	    throw new Error('Color should be defined as hex string')
    	  }

    	  let hexCode = hex.slice().replace('#', '').split('');
    	  if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) {
    	    throw new Error('Invalid hex color: ' + hex)
    	  }

    	  // Convert from short to long form (fff -> ffffff)
    	  if (hexCode.length === 3 || hexCode.length === 4) {
    	    hexCode = Array.prototype.concat.apply([], hexCode.map(function (c) {
    	      return [c, c]
    	    }));
    	  }

    	  // Add default alpha value
    	  if (hexCode.length === 6) hexCode.push('F', 'F');

    	  const hexValue = parseInt(hexCode.join(''), 16);

    	  return {
    	    r: (hexValue >> 24) & 255,
    	    g: (hexValue >> 16) & 255,
    	    b: (hexValue >> 8) & 255,
    	    a: hexValue & 255,
    	    hex: '#' + hexCode.slice(0, 6).join('')
    	  }
    	}

    	exports.getOptions = function getOptions (options) {
    	  if (!options) options = {};
    	  if (!options.color) options.color = {};

    	  const margin = typeof options.margin === 'undefined' ||
    	    options.margin === null ||
    	    options.margin < 0
    	    ? 4
    	    : options.margin;

    	  const width = options.width && options.width >= 21 ? options.width : undefined;
    	  const scale = options.scale || 4;

    	  return {
    	    width: width,
    	    scale: width ? 4 : scale,
    	    margin: margin,
    	    color: {
    	      dark: hex2rgba(options.color.dark || '#000000ff'),
    	      light: hex2rgba(options.color.light || '#ffffffff')
    	    },
    	    type: options.type,
    	    rendererOpts: options.rendererOpts || {}
    	  }
    	};

    	exports.getScale = function getScale (qrSize, opts) {
    	  return opts.width && opts.width >= qrSize + opts.margin * 2
    	    ? opts.width / (qrSize + opts.margin * 2)
    	    : opts.scale
    	};

    	exports.getImageWidth = function getImageWidth (qrSize, opts) {
    	  const scale = exports.getScale(qrSize, opts);
    	  return Math.floor((qrSize + opts.margin * 2) * scale)
    	};

    	exports.qrToImageData = function qrToImageData (imgData, qr, opts) {
    	  const size = qr.modules.size;
    	  const data = qr.modules.data;
    	  const scale = exports.getScale(size, opts);
    	  const symbolSize = Math.floor((size + opts.margin * 2) * scale);
    	  const scaledMargin = opts.margin * scale;
    	  const palette = [opts.color.light, opts.color.dark];

    	  for (let i = 0; i < symbolSize; i++) {
    	    for (let j = 0; j < symbolSize; j++) {
    	      let posDst = (i * symbolSize + j) * 4;
    	      let pxColor = opts.color.light;

    	      if (i >= scaledMargin && j >= scaledMargin &&
    	        i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
    	        const iSrc = Math.floor((i - scaledMargin) / scale);
    	        const jSrc = Math.floor((j - scaledMargin) / scale);
    	        pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
    	      }

    	      imgData[posDst++] = pxColor.r;
    	      imgData[posDst++] = pxColor.g;
    	      imgData[posDst++] = pxColor.b;
    	      imgData[posDst] = pxColor.a;
    	    }
    	  }
    	}; 
    } (utils));

    (function (exports) {
    	const Utils = utils;

    	function clearCanvas (ctx, canvas, size) {
    	  ctx.clearRect(0, 0, canvas.width, canvas.height);

    	  if (!canvas.style) canvas.style = {};
    	  canvas.height = size;
    	  canvas.width = size;
    	  canvas.style.height = size + 'px';
    	  canvas.style.width = size + 'px';
    	}

    	function getCanvasElement () {
    	  try {
    	    return document.createElement('canvas')
    	  } catch (e) {
    	    throw new Error('You need to specify a canvas element')
    	  }
    	}

    	exports.render = function render (qrData, canvas, options) {
    	  let opts = options;
    	  let canvasEl = canvas;

    	  if (typeof opts === 'undefined' && (!canvas || !canvas.getContext)) {
    	    opts = canvas;
    	    canvas = undefined;
    	  }

    	  if (!canvas) {
    	    canvasEl = getCanvasElement();
    	  }

    	  opts = Utils.getOptions(opts);
    	  const size = Utils.getImageWidth(qrData.modules.size, opts);

    	  const ctx = canvasEl.getContext('2d');
    	  const image = ctx.createImageData(size, size);
    	  Utils.qrToImageData(image.data, qrData, opts);

    	  clearCanvas(ctx, canvasEl, size);
    	  ctx.putImageData(image, 0, 0);

    	  return canvasEl
    	};

    	exports.renderToDataURL = function renderToDataURL (qrData, canvas, options) {
    	  let opts = options;

    	  if (typeof opts === 'undefined' && (!canvas || !canvas.getContext)) {
    	    opts = canvas;
    	    canvas = undefined;
    	  }

    	  if (!opts) opts = {};

    	  const canvasEl = exports.render(qrData, canvas, opts);

    	  const type = opts.type || 'image/png';
    	  const rendererOpts = opts.rendererOpts || {};

    	  return canvasEl.toDataURL(type, rendererOpts.quality)
    	}; 
    } (canvas));

    var svgTag = {};

    const Utils = utils;

    function getColorAttrib (color, attrib) {
      const alpha = color.a / 255;
      const str = attrib + '="' + color.hex + '"';

      return alpha < 1
        ? str + ' ' + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"'
        : str
    }

    function svgCmd (cmd, x, y) {
      let str = cmd + x;
      if (typeof y !== 'undefined') str += ' ' + y;

      return str
    }

    function qrToPath (data, size, margin) {
      let path = '';
      let moveBy = 0;
      let newRow = false;
      let lineLength = 0;

      for (let i = 0; i < data.length; i++) {
        const col = Math.floor(i % size);
        const row = Math.floor(i / size);

        if (!col && !newRow) newRow = true;

        if (data[i]) {
          lineLength++;

          if (!(i > 0 && col > 0 && data[i - 1])) {
            path += newRow
              ? svgCmd('M', col + margin, 0.5 + row + margin)
              : svgCmd('m', moveBy, 0);

            moveBy = 0;
            newRow = false;
          }

          if (!(col + 1 < size && data[i + 1])) {
            path += svgCmd('h', lineLength);
            lineLength = 0;
          }
        } else {
          moveBy++;
        }
      }

      return path
    }

    svgTag.render = function render (qrData, options, cb) {
      const opts = Utils.getOptions(options);
      const size = qrData.modules.size;
      const data = qrData.modules.data;
      const qrcodesize = size + opts.margin * 2;

      const bg = !opts.color.light.a
        ? ''
        : '<path ' + getColorAttrib(opts.color.light, 'fill') +
          ' d="M0 0h' + qrcodesize + 'v' + qrcodesize + 'H0z"/>';

      const path =
        '<path ' + getColorAttrib(opts.color.dark, 'stroke') +
        ' d="' + qrToPath(data, size, opts.margin) + '"/>';

      const viewBox = 'viewBox="' + '0 0 ' + qrcodesize + ' ' + qrcodesize + '"';

      const width = !opts.width ? '' : 'width="' + opts.width + '" height="' + opts.width + '" ';

      const svgTag = '<svg xmlns="http://www.w3.org/2000/svg" ' + width + viewBox + ' shape-rendering="crispEdges">' + bg + path + '</svg>\n';

      if (typeof cb === 'function') {
        cb(null, svgTag);
      }

      return svgTag
    };

    const canPromise = canPromise$1;

    const QRCode = qrcode;
    const CanvasRenderer = canvas;
    const SvgRenderer = svgTag;

    function renderCanvas (renderFunc, canvas, text, opts, cb) {
      const args = [].slice.call(arguments, 1);
      const argsNum = args.length;
      const isLastArgCb = typeof args[argsNum - 1] === 'function';

      if (!isLastArgCb && !canPromise()) {
        throw new Error('Callback required as last argument')
      }

      if (isLastArgCb) {
        if (argsNum < 2) {
          throw new Error('Too few arguments provided')
        }

        if (argsNum === 2) {
          cb = text;
          text = canvas;
          canvas = opts = undefined;
        } else if (argsNum === 3) {
          if (canvas.getContext && typeof cb === 'undefined') {
            cb = opts;
            opts = undefined;
          } else {
            cb = opts;
            opts = text;
            text = canvas;
            canvas = undefined;
          }
        }
      } else {
        if (argsNum < 1) {
          throw new Error('Too few arguments provided')
        }

        if (argsNum === 1) {
          text = canvas;
          canvas = opts = undefined;
        } else if (argsNum === 2 && !canvas.getContext) {
          opts = text;
          text = canvas;
          canvas = undefined;
        }

        return new Promise(function (resolve, reject) {
          try {
            const data = QRCode.create(text, opts);
            resolve(renderFunc(data, canvas, opts));
          } catch (e) {
            reject(e);
          }
        })
      }

      try {
        const data = QRCode.create(text, opts);
        cb(null, renderFunc(data, canvas, opts));
      } catch (e) {
        cb(e);
      }
    }

    browser$1.create = QRCode.create;
    browser$1.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
    browser$1.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);

    // only svg for now.
    browser$1.toString = renderCanvas.bind(null, function (data, _, opts) {
      return SvgRenderer.render(data, opts)
    });

    /* src/components/QrCode.svelte generated by Svelte v3.59.2 */

    const { console: console_1 } = globals;
    const file$2 = "src/components/QrCode.svelte";

    function create_fragment$2(ctx) {
    	let div1;
    	let h1;
    	let t1;
    	let div0;
    	let center;
    	let img;
    	let img_src_value;
    	let t2;
    	let footer;
    	let current;
    	footer = new Footer({ $$inline: true });

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Public Key QR Code";
    			t1 = space();
    			div0 = element("div");
    			center = element("center");
    			img = element("img");
    			t2 = space();
    			create_component(footer.$$.fragment);
    			attr_dev(h1, "class", "text-center text-2xl font-bold font-sans");
    			add_location(h1, file$2, 23, 2, 692);
    			if (!src_url_equal(img.src, img_src_value = /*qrcodeUrl*/ ctx[0])) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "qrcode");
    			attr_dev(img, "width", "190");
    			add_location(img, file$2, 25, 12, 804);
    			add_location(center, file$2, 25, 4, 796);
    			attr_dev(div0, "class", "w-full");
    			add_location(div0, file$2, 24, 2, 771);
    			attr_dev(div1, "class", "w-full h-full flex flex-row flex-col p-10 pt-5 space-y-6");
    			add_location(div1, file$2, 22, 0, 619);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, h1);
    			append_dev(div1, t1);
    			append_dev(div1, div0);
    			append_dev(div0, center);
    			append_dev(center, img);
    			insert_dev(target, t2, anchor);
    			mount_component(footer, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*qrcodeUrl*/ 1 && !src_url_equal(img.src, img_src_value = /*qrcodeUrl*/ ctx[0])) {
    				attr_dev(img, "src", img_src_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(footer.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(footer.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t2);
    			destroy_component(footer, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $keyStore;
    	validate_store(keyStore, 'keyStore');
    	component_subscribe($$self, keyStore, $$value => $$invalidate(2, $keyStore = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('QrCode', slots, []);
    	let currentTab = { url: "" };

    	web.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    		var activeTab = tabs[0];
    		currentTab = activeTab;
    	});

    	let qrcodeUrl = "";

    	browser$1.toDataURL(getPublicKey($keyStore)).then(url => {
    		console.log(url);
    		$$invalidate(0, qrcodeUrl = url);
    	}).catch(err => {
    		console.error(err);
    	});

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<QrCode> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		Footer,
    		domainToUrl,
    		QRCode: browser$1,
    		keyStore,
    		getPublicKey,
    		web,
    		currentTab,
    		qrcodeUrl,
    		$keyStore
    	});

    	$$self.$inject_state = $$props => {
    		if ('currentTab' in $$props) currentTab = $$props.currentTab;
    		if ('qrcodeUrl' in $$props) $$invalidate(0, qrcodeUrl = $$props.qrcodeUrl);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [qrcodeUrl];
    }

    class QrCode extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "QrCode",
    			options,
    			id: create_fragment$2.name
    		});
    	}
    }

    /* src/components/About.svelte generated by Svelte v3.59.2 */

    const file$1 = "src/components/About.svelte";

    function create_fragment$1(ctx) {
    	let div1;
    	let center;
    	let h1;
    	let t1;
    	let br0;
    	let t2;
    	let div0;
    	let t3;
    	let br1;
    	let t4;
    	let br2;
    	let t5;
    	let hr;
    	let t6;
    	let p;
    	let t7;
    	let a;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			center = element("center");
    			h1 = element("h1");
    			h1.textContent = "About";
    			t1 = space();
    			br0 = element("br");
    			t2 = space();
    			div0 = element("div");
    			t3 = text("keys.band doesn't collect any personal data, doesn't track websites you\n      visit, doesn't collect any form of usage analytics, doesn't sends any\n      information to any service over the internet -- in fact, it doesn't even\n      have a server anywhere, it's just an extension installed on your computer.\n      ");
    			br1 = element("br");
    			t4 = space();
    			br2 = element("br");
    			t5 = space();
    			hr = element("hr");
    			t6 = space();
    			p = element("p");
    			t7 = text("You can contribute on GitHub ");
    			a = element("a");
    			a.textContent = "here";
    			attr_dev(h1, "class", "text-center text-2xl font-bold font-sans");
    			add_location(h1, file$1, 7, 4, 163);
    			add_location(br0, file$1, 8, 4, 231);
    			add_location(br1, file$1, 14, 6, 583);
    			add_location(br2, file$1, 15, 6, 596);
    			attr_dev(hr, "class", "py-4");
    			add_location(hr, file$1, 16, 6, 609);
    			attr_dev(a, "class", "link link-hover text-secondary");
    			attr_dev(a, "href", "https://github.com/toastr-space/keys-band");
    			attr_dev(a, "target", "_blank");
    			add_location(a, file$1, 18, 37, 692);
    			attr_dev(p, "class", "text-lg");
    			add_location(p, file$1, 17, 6, 635);
    			attr_dev(div0, "class", "w-full");
    			add_location(div0, file$1, 9, 4, 242);
    			add_location(center, file$1, 6, 2, 150);
    			attr_dev(div1, "class", "w-full h-full flex flex-row flex-col p-10 pt-5 space-y-6");
    			add_location(div1, file$1, 5, 0, 77);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, center);
    			append_dev(center, h1);
    			append_dev(center, t1);
    			append_dev(center, br0);
    			append_dev(center, t2);
    			append_dev(center, div0);
    			append_dev(div0, t3);
    			append_dev(div0, br1);
    			append_dev(div0, t4);
    			append_dev(div0, br2);
    			append_dev(div0, t5);
    			append_dev(div0, hr);
    			append_dev(div0, t6);
    			append_dev(div0, p);
    			append_dev(p, t7);
    			append_dev(p, a);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('About', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<About> was created with unknown prop '${key}'`);
    	});

    	return [];
    }

    class About extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "About",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src/App.svelte generated by Svelte v3.59.2 */
    const file = "src/App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[28] = list[i];
    	return child_ctx;
    }

    // (224:0) {:else}
    function create_else_block_1(ctx) {
    	let div1;
    	let select;
    	let option0;
    	let t0;
    	let option0_selected_value;
    	let option1;
    	let t1;
    	let option1_selected_value;
    	let option2;
    	let t2;
    	let option2_selected_value;
    	let option3;
    	let t3;
    	let option3_selected_value;
    	let option4;
    	let t4;
    	let option4_selected_value;
    	let t5;
    	let div0;
    	let img;
    	let img_src_value;
    	let t6;
    	let span;
    	let t8;
    	let mounted;
    	let dispose;

    	function select_block_type_4(ctx, dirty) {
    		if (/*creationMode*/ ctx[4] == false) return create_if_block_8;
    		return create_else_block_2;
    	}

    	let current_block_type = select_block_type_4(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			select = element("select");
    			option0 = element("option");
    			t0 = text("Light");
    			option1 = element("option");
    			t1 = text("Dark");
    			option2 = element("option");
    			t2 = text("Cupcake");
    			option3 = element("option");
    			t3 = text("Lofi");
    			option4 = element("option");
    			t4 = text("Autumn");
    			t5 = space();
    			div0 = element("div");
    			img = element("img");
    			t6 = space();
    			span = element("span");
    			span.textContent = "keys.band";
    			t8 = space();
    			if_block.c();
    			option0.__value = "light";
    			option0.value = option0.__value;
    			option0.selected = option0_selected_value = /*$theme*/ ctx[8] == "light";
    			add_location(option0, file, 233, 6, 7654);
    			option1.__value = "dark";
    			option1.value = option1.__value;
    			option1.selected = option1_selected_value = /*$theme*/ ctx[8] == "dark";
    			add_location(option1, file, 234, 6, 7726);
    			option2.__value = "cupcake";
    			option2.value = option2.__value;
    			option2.selected = option2_selected_value = /*$theme*/ ctx[8] == "cupcake";
    			add_location(option2, file, 235, 6, 7795);
    			option3.__value = "lofi";
    			option3.value = option3.__value;
    			option3.selected = option3_selected_value = /*$theme*/ ctx[8] == "lofi";
    			add_location(option3, file, 236, 6, 7873);
    			option4.__value = "autumn";
    			option4.value = option4.__value;
    			option4.selected = option4_selected_value = /*$theme*/ ctx[8] == "autumn";
    			add_location(option4, file, 237, 6, 7942);
    			attr_dev(select, "class", "select select-bordered select-xs h-8 mt-2 pl-2 pr-2 absolute top-3 right-3 svelte-iniqp2");
    			add_location(select, file, 227, 4, 7463);
    			if (!src_url_equal(img.src, img_src_value = "/assets/logo.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "width", "70");
    			attr_dev(img, "class", "mx-auto");
    			attr_dev(img, "alt", "");
    			add_location(img, file, 240, 6, 8056);
    			attr_dev(div0, "class", "w-full");
    			add_location(div0, file, 239, 4, 8029);
    			attr_dev(span, "class", "text-lg text-center w-full");
    			add_location(span, file, 243, 4, 8137);
    			attr_dev(div1, "class", "w-full flex flex-row flex-wrap space-x-4 space-y-4 p-6 px-2 overflow-y-auto");
    			add_location(div1, file, 224, 2, 7362);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, select);
    			append_dev(select, option0);
    			append_dev(option0, t0);
    			append_dev(select, option1);
    			append_dev(option1, t1);
    			append_dev(select, option2);
    			append_dev(option2, t2);
    			append_dev(select, option3);
    			append_dev(option3, t3);
    			append_dev(select, option4);
    			append_dev(option4, t4);
    			append_dev(div1, t5);
    			append_dev(div1, div0);
    			append_dev(div0, img);
    			append_dev(div1, t6);
    			append_dev(div1, span);
    			append_dev(div1, t8);
    			if_block.m(div1, null);

    			if (!mounted) {
    				dispose = listen_dev(select, "change", /*change_handler_1*/ ctx[18], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$theme*/ 256 && option0_selected_value !== (option0_selected_value = /*$theme*/ ctx[8] == "light")) {
    				prop_dev(option0, "selected", option0_selected_value);
    			}

    			if (dirty & /*$theme*/ 256 && option1_selected_value !== (option1_selected_value = /*$theme*/ ctx[8] == "dark")) {
    				prop_dev(option1, "selected", option1_selected_value);
    			}

    			if (dirty & /*$theme*/ 256 && option2_selected_value !== (option2_selected_value = /*$theme*/ ctx[8] == "cupcake")) {
    				prop_dev(option2, "selected", option2_selected_value);
    			}

    			if (dirty & /*$theme*/ 256 && option3_selected_value !== (option3_selected_value = /*$theme*/ ctx[8] == "lofi")) {
    				prop_dev(option3, "selected", option3_selected_value);
    			}

    			if (dirty & /*$theme*/ 256 && option4_selected_value !== (option4_selected_value = /*$theme*/ ctx[8] == "autumn")) {
    				prop_dev(option4, "selected", option4_selected_value);
    			}

    			if (current_block_type === (current_block_type = select_block_type_4(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div1, null);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1.name,
    		type: "else",
    		source: "(224:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (85:0) {#if $keyStore !== "" && $keyStore !== undefined}
    function create_if_block(ctx) {
    	let div9;
    	let div7;
    	let div2;
    	let div1;
    	let div0;
    	let img;
    	let img_src_value;
    	let t0;
    	let div5;
    	let div3;
    	let div3_class_value;
    	let t1;
    	let div4;
    	let t2_value = (/*$userProfile*/ ctx[6]?.nip05 || "") + "";
    	let t2;
    	let t3;
    	let div6;
    	let select;
    	let option0;
    	let t4;
    	let option0_selected_value;
    	let option1;
    	let t5;
    	let option1_selected_value;
    	let option2;
    	let t6;
    	let option2_selected_value;
    	let option3;
    	let t7;
    	let option3_selected_value;
    	let option4;
    	let t8;
    	let option4_selected_value;
    	let t9;
    	let t10;
    	let div8;
    	let current_block_type_index;
    	let if_block2;
    	let current;
    	let mounted;
    	let dispose;

    	function select_block_type_1(ctx, dirty) {
    		if (/*$userProfile*/ ctx[6]?.name) return create_if_block_7;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type_1(ctx);
    	let if_block0 = current_block_type(ctx);

    	function select_block_type_2(ctx, dirty) {
    		if (/*currentPage*/ ctx[1] !== /*Page*/ ctx[0].Home) return create_if_block_5;
    		if (/*currentPage*/ ctx[1] === /*Page*/ ctx[0].Home) return create_if_block_6;
    	}

    	let current_block_type_1 = select_block_type_2(ctx);
    	let if_block1 = current_block_type_1 && current_block_type_1(ctx);
    	const if_block_creators = [create_if_block_1, create_if_block_2, create_if_block_3, create_if_block_4];
    	const if_blocks = [];

    	function select_block_type_3(ctx, dirty) {
    		if (/*currentPage*/ ctx[1] === /*Page*/ ctx[0].Home) return 0;
    		if (/*currentPage*/ ctx[1] === /*Page*/ ctx[0].Settings) return 1;
    		if (/*currentPage*/ ctx[1] === /*Page*/ ctx[0].QrCode) return 2;
    		if (/*currentPage*/ ctx[1] === /*Page*/ ctx[0].About) return 3;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type_3(ctx))) {
    		if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	const block = {
    		c: function create() {
    			div9 = element("div");
    			div7 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			img = element("img");
    			t0 = space();
    			div5 = element("div");
    			div3 = element("div");
    			if_block0.c();
    			t1 = space();
    			div4 = element("div");
    			t2 = text(t2_value);
    			t3 = space();
    			div6 = element("div");
    			select = element("select");
    			option0 = element("option");
    			t4 = text("Light");
    			option1 = element("option");
    			t5 = text("Dark");
    			option2 = element("option");
    			t6 = text("Cupcake");
    			option3 = element("option");
    			t7 = text("Lofi");
    			option4 = element("option");
    			t8 = text("Autumn");
    			t9 = space();
    			if (if_block1) if_block1.c();
    			t10 = space();
    			div8 = element("div");
    			if (if_block2) if_block2.c();
    			attr_dev(img, "loading", "lazy");
    			if (!src_url_equal(img.src, img_src_value = /*$userProfile*/ ctx[6]?.picture || "https://toastr.space/images/toastr.png")) attr_dev(img, "src", img_src_value);
    			attr_dev(img, "alt", "");
    			add_location(img, file, 92, 12, 2952);
    			attr_dev(div0, "class", "w-12 rounded-full bordered border-2 border-blue-200 shadow-lg");
    			add_location(div0, file, 89, 10, 2841);
    			attr_dev(div1, "class", "avatar");
    			add_location(div1, file, 88, 8, 2810);
    			attr_dev(div2, "class", "w-2/12 p-2");
    			add_location(div2, file, 87, 6, 2777);

    			attr_dev(div3, "class", div3_class_value = "text-xl font-bold " + (/*$userProfile*/ ctx[6].name && /*$userProfile*/ ctx[6].nip05
    			? ''
    			: 'mt-2'));

    			add_location(div3, file, 103, 8, 3269);
    			attr_dev(div4, "class", "text-sm text-secondary text-gray-500");
    			add_location(div4, file, 117, 8, 3759);
    			attr_dev(div5, "class", "w-6/12 p-4 pl-2 pt-2");
    			add_location(div5, file, 101, 6, 3175);
    			option0.__value = "light";
    			option0.value = option0.__value;
    			option0.selected = option0_selected_value = /*$theme*/ ctx[8] == "light";
    			add_location(option0, file, 129, 10, 4162);
    			option1.__value = "dark";
    			option1.value = option1.__value;
    			option1.selected = option1_selected_value = /*$theme*/ ctx[8] == "dark";
    			add_location(option1, file, 130, 10, 4238);
    			option2.__value = "cupcake";
    			option2.value = option2.__value;
    			option2.selected = option2_selected_value = /*$theme*/ ctx[8] == "cupcake";
    			add_location(option2, file, 132, 10, 4312);
    			option3.__value = "lofi";
    			option3.value = option3.__value;
    			option3.selected = option3_selected_value = /*$theme*/ ctx[8] == "lofi";
    			add_location(option3, file, 134, 10, 4405);
    			option4.__value = "autumn";
    			option4.value = option4.__value;
    			option4.selected = option4_selected_value = /*$theme*/ ctx[8] == "autumn";
    			add_location(option4, file, 135, 10, 4478);
    			attr_dev(select, "class", "select select-bordered select-xs w-7/12 h-8 mt-2 max-w-xs pl-2 pr-0 svelte-iniqp2");
    			add_location(select, file, 123, 8, 3964);
    			attr_dev(div6, "class", "w-6/12 py-4 pt-2 pl-7 flex");
    			add_location(div6, file, 121, 6, 3882);
    			attr_dev(div7, "class", "w-full h-16 bg-base-100 flex shadow-sm");
    			add_location(div7, file, 86, 4, 2718);
    			attr_dev(div8, "class", "w-full h-full pt-2");
    			add_location(div8, file, 211, 4, 7038);
    			attr_dev(div9, "class", "w-full h-full flex flex-wrap fixed-width svelte-iniqp2");
    			add_location(div9, file, 85, 2, 2659);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div9, anchor);
    			append_dev(div9, div7);
    			append_dev(div7, div2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div0, img);
    			append_dev(div7, t0);
    			append_dev(div7, div5);
    			append_dev(div5, div3);
    			if_block0.m(div3, null);
    			append_dev(div5, t1);
    			append_dev(div5, div4);
    			append_dev(div4, t2);
    			append_dev(div7, t3);
    			append_dev(div7, div6);
    			append_dev(div6, select);
    			append_dev(select, option0);
    			append_dev(option0, t4);
    			append_dev(select, option1);
    			append_dev(option1, t5);
    			append_dev(select, option2);
    			append_dev(option2, t6);
    			append_dev(select, option3);
    			append_dev(option3, t7);
    			append_dev(select, option4);
    			append_dev(option4, t8);
    			append_dev(div6, t9);
    			if (if_block1) if_block1.m(div6, null);
    			append_dev(div9, t10);
    			append_dev(div9, div8);

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(div8, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(select, "change", /*change_handler*/ ctx[12], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*$userProfile*/ 64 && !src_url_equal(img.src, img_src_value = /*$userProfile*/ ctx[6]?.picture || "https://toastr.space/images/toastr.png")) {
    				attr_dev(img, "src", img_src_value);
    			}

    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block0) {
    				if_block0.p(ctx, dirty);
    			} else {
    				if_block0.d(1);
    				if_block0 = current_block_type(ctx);

    				if (if_block0) {
    					if_block0.c();
    					if_block0.m(div3, null);
    				}
    			}

    			if (!current || dirty & /*$userProfile*/ 64 && div3_class_value !== (div3_class_value = "text-xl font-bold " + (/*$userProfile*/ ctx[6].name && /*$userProfile*/ ctx[6].nip05
    			? ''
    			: 'mt-2'))) {
    				attr_dev(div3, "class", div3_class_value);
    			}

    			if ((!current || dirty & /*$userProfile*/ 64) && t2_value !== (t2_value = (/*$userProfile*/ ctx[6]?.nip05 || "") + "")) set_data_dev(t2, t2_value);

    			if (!current || dirty & /*$theme*/ 256 && option0_selected_value !== (option0_selected_value = /*$theme*/ ctx[8] == "light")) {
    				prop_dev(option0, "selected", option0_selected_value);
    			}

    			if (!current || dirty & /*$theme*/ 256 && option1_selected_value !== (option1_selected_value = /*$theme*/ ctx[8] == "dark")) {
    				prop_dev(option1, "selected", option1_selected_value);
    			}

    			if (!current || dirty & /*$theme*/ 256 && option2_selected_value !== (option2_selected_value = /*$theme*/ ctx[8] == "cupcake")) {
    				prop_dev(option2, "selected", option2_selected_value);
    			}

    			if (!current || dirty & /*$theme*/ 256 && option3_selected_value !== (option3_selected_value = /*$theme*/ ctx[8] == "lofi")) {
    				prop_dev(option3, "selected", option3_selected_value);
    			}

    			if (!current || dirty & /*$theme*/ 256 && option4_selected_value !== (option4_selected_value = /*$theme*/ ctx[8] == "autumn")) {
    				prop_dev(option4, "selected", option4_selected_value);
    			}

    			if (current_block_type_1 === (current_block_type_1 = select_block_type_2(ctx)) && if_block1) {
    				if_block1.p(ctx, dirty);
    			} else {
    				if (if_block1) if_block1.d(1);
    				if_block1 = current_block_type_1 && current_block_type_1(ctx);

    				if (if_block1) {
    					if_block1.c();
    					if_block1.m(div6, null);
    				}
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_3(ctx);

    			if (current_block_type_index !== previous_block_index) {
    				if (if_block2) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block2 = if_blocks[current_block_type_index];

    					if (!if_block2) {
    						if_block2 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block2.c();
    					}

    					transition_in(if_block2, 1);
    					if_block2.m(div8, null);
    				} else {
    					if_block2 = null;
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block2);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block2);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div9);
    			if_block0.d();

    			if (if_block1) {
    				if_block1.d();
    			}

    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d();
    			}

    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(85:0) {#if $keyStore !== \\\"\\\" && $keyStore !== undefined}",
    		ctx
    	});

    	return block;
    }

    // (305:4) {:else}
    function create_else_block_2(ctx) {
    	let hr;
    	let t0;
    	let div1;
    	let div0;
    	let button0;
    	let svg;
    	let path0;
    	let path1;
    	let t1;
    	let t2;
    	let div7;
    	let div6;
    	let div2;
    	let span0;
    	let t4;
    	let input0;
    	let t5;
    	let br;
    	let t6;
    	let div5;
    	let span1;
    	let t8;
    	let div4;
    	let div3;
    	let input1;
    	let t9;
    	let button1;
    	let t11;
    	let button2;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			hr = element("hr");
    			t0 = space();
    			div1 = element("div");
    			div0 = element("div");
    			button0 = element("button");
    			svg = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			t1 = text("\n                Back");
    			t2 = space();
    			div7 = element("div");
    			div6 = element("div");
    			div2 = element("div");
    			span0 = element("span");
    			span0.textContent = "Profile name";
    			t4 = space();
    			input0 = element("input");
    			t5 = space();
    			br = element("br");
    			t6 = space();
    			div5 = element("div");
    			span1 = element("span");
    			span1.textContent = "Private Key";
    			t8 = space();
    			div4 = element("div");
    			div3 = element("div");
    			input1 = element("input");
    			t9 = space();
    			button1 = element("button");
    			button1.textContent = "Generate";
    			t11 = space();
    			button2 = element("button");
    			button2.textContent = "Load profile";
    			add_location(hr, file, 305, 6, 10206);
    			attr_dev(path0, "fill", "currentColor");
    			attr_dev(path0, "d", "M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z");
    			add_location(path0, file, 320, 15, 10694);
    			attr_dev(path1, "fill", "currentColor");
    			attr_dev(path1, "d", "m237.248 512l265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z");
    			add_location(path1, file, 323, 16, 10824);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", "19");
    			attr_dev(svg, "height", "19");
    			attr_dev(svg, "class", "mt-1");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			add_location(svg, file, 314, 12, 10509);
    			attr_dev(button0, "class", "link link-hover mx-auto text-lg flex flex-row space-x-8");
    			add_location(button0, file, 308, 10, 10320);
    			attr_dev(div0, "class", "flex flex-row space-x-8");
    			add_location(div0, file, 307, 8, 10272);
    			attr_dev(div1, "class", "w-full flex justify-start pr-8");
    			add_location(div1, file, 306, 6, 10219);
    			attr_dev(span0, "class", "label-text");
    			add_location(span0, file, 337, 12, 11382);
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "class", "input input-bordered mt-2");
    			attr_dev(input0, "placeholder", "name");
    			add_location(input0, file, 339, 12, 11440);
    			attr_dev(div2, "class", "w-full flex flex-col");
    			add_location(div2, file, 336, 10, 11335);
    			add_location(br, file, 347, 10, 11666);
    			attr_dev(span1, "class", "label-text");
    			add_location(span1, file, 349, 12, 11765);
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "class", "input input-bordered mt-2 w-full");
    			set_style(input1, "padding-right", "103px");
    			attr_dev(input1, "placeholder", "nsec");
    			add_location(input1, file, 353, 16, 11917);
    			attr_dev(button1, "class", "btn btn-outline bg-base-100 btn-primary text-xs absolute top-0 right-0 mt-2 mr-0");
    			add_location(button1, file, 361, 16, 12215);
    			attr_dev(div3, "class", "w-full relative");
    			add_location(div3, file, 352, 14, 11871);
    			attr_dev(div4, "class", "flex flex-row w-full");
    			add_location(div4, file, 351, 12, 11822);
    			attr_dev(div5, "class", "w-full flex max-w-lg flex-col");
    			set_style(div5, "margin-left", "0px");
    			add_location(div5, file, 348, 10, 11683);
    			attr_dev(div6, "class", "flex w-12/12 flex-col space-y-0 pr-2 space-x-4");
    			add_location(div6, file, 335, 8, 11264);
    			attr_dev(button2, "class", "btn btn-primary w-full mt-4");
    			add_location(button2, file, 374, 8, 12643);
    			attr_dev(div7, "class", "form-control w-11/12 flex");
    			add_location(div7, file, 334, 6, 11216);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, hr, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, button0);
    			append_dev(button0, svg);
    			append_dev(svg, path0);
    			append_dev(svg, path1);
    			append_dev(button0, t1);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, div7, anchor);
    			append_dev(div7, div6);
    			append_dev(div6, div2);
    			append_dev(div2, span0);
    			append_dev(div2, t4);
    			append_dev(div2, input0);
    			set_input_value(input0, /*_name*/ ctx[3]);
    			append_dev(div6, t5);
    			append_dev(div6, br);
    			append_dev(div6, t6);
    			append_dev(div6, div5);
    			append_dev(div5, span1);
    			append_dev(div5, t8);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			append_dev(div3, input1);
    			set_input_value(input1, /*_keyStore*/ ctx[2]);
    			append_dev(div3, t9);
    			append_dev(div3, button1);
    			append_dev(div7, t11);
    			append_dev(div7, button2);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler_8*/ ctx[22], false, false, false, false),
    					listen_dev(input0, "input", /*input0_input_handler*/ ctx[23]),
    					listen_dev(input0, "keydown", keydown_handler, false, false, false, false),
    					listen_dev(input1, "input", /*input1_input_handler*/ ctx[24]),
    					listen_dev(input1, "keydown", keydown_handler_1, false, false, false, false),
    					listen_dev(button1, "click", /*click_handler_9*/ ctx[25], false, false, false, false),
    					listen_dev(button2, "click", /*click_handler_10*/ ctx[26], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*_name*/ 8 && input0.value !== /*_name*/ ctx[3]) {
    				set_input_value(input0, /*_name*/ ctx[3]);
    			}

    			if (dirty & /*_keyStore*/ 4 && input1.value !== /*_keyStore*/ ctx[2]) {
    				set_input_value(input1, /*_keyStore*/ ctx[2]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(hr);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div1);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(div7);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_2.name,
    		type: "else",
    		source: "(305:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (246:4) {#if creationMode == false}
    function create_if_block_8(ctx) {
    	let div0;
    	let table;
    	let thead;
    	let tr;
    	let th0;
    	let t0;
    	let th1;
    	let t1;
    	let tbody;
    	let t2;
    	let div1;
    	let center;
    	let button;
    	let mounted;
    	let dispose;
    	let each_value = /*$profiles*/ ctx[5];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div0 = element("div");
    			table = element("table");
    			thead = element("thead");
    			tr = element("tr");
    			th0 = element("th");
    			t0 = space();
    			th1 = element("th");
    			t1 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t2 = space();
    			div1 = element("div");
    			center = element("center");
    			button = element("button");
    			button.textContent = "+ add profile";
    			add_location(th0, file, 251, 14, 8363);
    			set_style(th1, "max-width", "60px");
    			add_location(th1, file, 252, 14, 8384);
    			add_location(tr, file, 250, 12, 8344);
    			add_location(thead, file, 249, 10, 8324);
    			add_location(tbody, file, 255, 10, 8463);
    			attr_dev(table, "class", "table");
    			add_location(table, file, 247, 8, 8268);
    			attr_dev(div0, "class", "w-full pr-4");
    			add_location(div0, file, 246, 6, 8234);
    			attr_dev(button, "class", "link link-hover mx-auto text-lg");
    			add_location(button, file, 294, 10, 9959);
    			add_location(center, file, 293, 8, 9940);
    			attr_dev(div1, "class", "w-full flex justify-end pr-8");
    			add_location(div1, file, 292, 6, 9889);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div0, anchor);
    			append_dev(div0, table);
    			append_dev(table, thead);
    			append_dev(thead, tr);
    			append_dev(tr, th0);
    			append_dev(tr, t0);
    			append_dev(tr, th1);
    			append_dev(table, t1);
    			append_dev(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(tbody, null);
    				}
    			}

    			insert_dev(target, t2, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, center);
    			append_dev(center, button);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler_7*/ ctx[21], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*removeProfileByName, $profiles, openProfile*/ 3104) {
    				each_value = /*$profiles*/ ctx[5];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(tbody, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div0);
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(div1);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_8.name,
    		type: "if",
    		source: "(246:4) {#if creationMode == false}",
    		ctx
    	});

    	return block;
    }

    // (257:12) {#each $profiles as profile}
    function create_each_block(ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*profile*/ ctx[28].name + "";
    	let t0;
    	let t1;
    	let td1;
    	let div;
    	let button0;
    	let t3;
    	let button1;
    	let svg;
    	let path;
    	let t4;
    	let mounted;
    	let dispose;

    	function click_handler_5() {
    		return /*click_handler_5*/ ctx[19](/*profile*/ ctx[28]);
    	}

    	function click_handler_6() {
    		return /*click_handler_6*/ ctx[20](/*profile*/ ctx[28]);
    	}

    	const block = {
    		c: function create() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			div = element("div");
    			button0 = element("button");
    			button0.textContent = "OPEN";
    			t3 = space();
    			button1 = element("button");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t4 = space();
    			attr_dev(td0, "class", "flex-grow text-lg");
    			add_location(td0, file, 258, 16, 8547);
    			attr_dev(button0, "class", "btn btn-sm btn-accent mb-2");
    			add_location(button0, file, 262, 20, 8767);
    			attr_dev(path, "fill", "currentColor");
    			attr_dev(path, "d", "M7 21q-.825 0-1.413-.588T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.588 1.413T17 21H7ZM17 6H7v13h10V6ZM9 17h2V8H9v9Zm4 0h2V8h-2v9ZM7 6v13V6Z");
    			add_location(path, file, 279, 25, 9444);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", "24");
    			attr_dev(svg, "height", "24");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			add_location(svg, file, 274, 22, 9240);
    			attr_dev(button1, "class", "btn btn-square btn-sm btn-secondary");
    			add_location(button1, file, 268, 20, 8998);
    			attr_dev(div, "class", "flex space-x-2 float-right pt-2");
    			add_location(div, file, 260, 18, 8660);
    			set_style(td1, "max-width", "60px");
    			add_location(td1, file, 259, 16, 8613);
    			add_location(tr, file, 257, 14, 8526);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, tr, anchor);
    			append_dev(tr, td0);
    			append_dev(td0, t0);
    			append_dev(tr, t1);
    			append_dev(tr, td1);
    			append_dev(td1, div);
    			append_dev(div, button0);
    			append_dev(div, t3);
    			append_dev(div, button1);
    			append_dev(button1, svg);
    			append_dev(svg, path);
    			append_dev(tr, t4);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", click_handler_5, false, false, false, false),
    					listen_dev(button1, "click", click_handler_6, false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*$profiles*/ 32 && t0_value !== (t0_value = /*profile*/ ctx[28].name + "")) set_data_dev(t0, t0_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(tr);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(257:12) {#each $profiles as profile}",
    		ctx
    	});

    	return block;
    }

    // (114:10) {:else}
    function create_else_block(ctx) {
    	let t_value = getPublicKey(/*$keyStore*/ ctx[7]).substr(0, 10) + "";
    	let t;

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$keyStore*/ 128 && t_value !== (t_value = getPublicKey(/*$keyStore*/ ctx[7]).substr(0, 10) + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(114:10) {:else}",
    		ctx
    	});

    	return block;
    }

    // (110:10) {#if $userProfile?.name}
    function create_if_block_7(ctx) {
    	let t_value = (/*$userProfile*/ ctx[6]?.name?.length > 12
    	? /*$userProfile*/ ctx[6]?.name.substr(0, 12) + "..."
    	: /*$userProfile*/ ctx[6]?.name || getPublicKey(/*$keyStore*/ ctx[7]).substr(0, 16)) + "";

    	let t;

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$userProfile, $keyStore*/ 192 && t_value !== (t_value = (/*$userProfile*/ ctx[6]?.name?.length > 12
    			? /*$userProfile*/ ctx[6]?.name.substr(0, 12) + "..."
    			: /*$userProfile*/ ctx[6]?.name || getPublicKey(/*$keyStore*/ ctx[7]).substr(0, 16)) + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_7.name,
    		type: "if",
    		source: "(110:10) {#if $userProfile?.name}",
    		ctx
    	});

    	return block;
    }

    // (161:44) 
    function create_if_block_6(ctx) {
    	let div;
    	let button0;
    	let svg;
    	let path;
    	let t0;
    	let ul;
    	let li0;
    	let button1;
    	let t2;
    	let li1;
    	let button2;
    	let t4;
    	let li2;
    	let button3;
    	let t6;
    	let li3;
    	let button4;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			button0 = element("button");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t0 = space();
    			ul = element("ul");
    			li0 = element("li");
    			button1 = element("button");
    			button1.textContent = "Settings";
    			t2 = space();
    			li1 = element("li");
    			button2 = element("button");
    			button2.textContent = "QR Code";
    			t4 = space();
    			li2 = element("li");
    			button3 = element("button");
    			button3.textContent = "About";
    			t6 = space();
    			li3 = element("li");
    			button4 = element("button");
    			button4.textContent = "Logout";
    			attr_dev(path, "fill", "currentColor");
    			attr_dev(path, "d", "M12 20q-.825 0-1.413-.588T10 18q0-.825.588-1.413T12 16q.825 0 1.413.588T14 18q0 .825-.588 1.413T12 20Zm0-6q-.825 0-1.413-.588T10 12q0-.825.588-1.413T12 10q.825 0 1.413.588T14 12q0 .825-.588 1.413T12 14Zm0-6q-.825 0-1.413-.588T10 6q0-.825.588-1.413T12 4q.825 0 1.413.588T14 6q0 .825-.588 1.413T12 8Z");
    			add_location(path, file, 168, 17, 5566);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", "24");
    			attr_dev(svg, "height", "24");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			add_location(svg, file, 163, 14, 5402);
    			attr_dev(button0, "tabindex", "-1");
    			attr_dev(button0, "class", "btn btn-ghost btn-circle");
    			add_location(button0, file, 162, 12, 5332);
    			add_location(button1, file, 179, 16, 6198);
    			add_location(li0, file, 178, 14, 6177);
    			add_location(button2, file, 186, 16, 6402);
    			add_location(li1, file, 185, 14, 6381);
    			add_location(button3, file, 193, 16, 6603);
    			add_location(li2, file, 192, 14, 6582);
    			add_location(button4, file, 200, 16, 6801);
    			add_location(li3, file, 199, 14, 6780);
    			attr_dev(ul, "tabindex", "-1");
    			attr_dev(ul, "class", "dropdown-content shadow-xl bg-base-200 z-[1] menu p-2 shadow bg-base-100 rounded-box w-52");
    			add_location(ul, file, 174, 12, 6005);
    			attr_dev(div, "class", "dropdown dropdown-end");
    			add_location(div, file, 161, 10, 5284);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, button0);
    			append_dev(button0, svg);
    			append_dev(svg, path);
    			append_dev(div, t0);
    			append_dev(div, ul);
    			append_dev(ul, li0);
    			append_dev(li0, button1);
    			append_dev(ul, t2);
    			append_dev(ul, li1);
    			append_dev(li1, button2);
    			append_dev(ul, t4);
    			append_dev(ul, li2);
    			append_dev(li2, button3);
    			append_dev(ul, t6);
    			append_dev(ul, li3);
    			append_dev(li3, button4);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[14], false, false, false, false),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[15], false, false, false, false),
    					listen_dev(button3, "click", /*click_handler_3*/ ctx[16], false, false, false, false),
    					listen_dev(button4, "click", /*click_handler_4*/ ctx[17], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_6.name,
    		type: "if",
    		source: "(161:44) ",
    		ctx
    	});

    	return block;
    }

    // (139:8) {#if currentPage !== Page.Home}
    function create_if_block_5(ctx) {
    	let button;
    	let svg;
    	let path;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "fill", "none");
    			attr_dev(path, "stroke", "currentColor");
    			attr_dev(path, "stroke-linecap", "round");
    			attr_dev(path, "stroke-linejoin", "round");
    			attr_dev(path, "stroke-width", "2");
    			attr_dev(path, "d", "M12 12L7 7m5 5l5 5m-5-5l5-5m-5 5l-5 5");
    			add_location(path, file, 150, 15, 4931);
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", "24");
    			attr_dev(svg, "height", "24");
    			attr_dev(svg, "viewBox", "0 0 24 24");
    			add_location(svg, file, 145, 12, 4777);
    			attr_dev(button, "class", "btn btn-ghost btn-circle");
    			add_location(button, file, 139, 10, 4616);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, svg);
    			append_dev(svg, path);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler*/ ctx[13], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_5.name,
    		type: "if",
    		source: "(139:8) {#if currentPage !== Page.Home}",
    		ctx
    	});

    	return block;
    }

    // (219:43) 
    function create_if_block_4(ctx) {
    	let about;
    	let current;
    	about = new About({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(about.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(about, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(about.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(about.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(about, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(219:43) ",
    		ctx
    	});

    	return block;
    }

    // (217:44) 
    function create_if_block_3(ctx) {
    	let qrcode;
    	let current;
    	qrcode = new QrCode({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(qrcode.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(qrcode, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(qrcode.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(qrcode.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(qrcode, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(217:44) ",
    		ctx
    	});

    	return block;
    }

    // (215:46) 
    function create_if_block_2(ctx) {
    	let settings;
    	let current;
    	settings = new Settings({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(settings.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(settings, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(settings.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(settings.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(settings, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(215:46) ",
    		ctx
    	});

    	return block;
    }

    // (213:6) {#if currentPage === Page.Home}
    function create_if_block_1(ctx) {
    	let home;
    	let current;
    	home = new Home({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(home.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(home, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(home.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(home.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(home, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(213:6) {#if currentPage === Page.Home}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block, create_else_block_1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$keyStore*/ ctx[7] !== "" && /*$keyStore*/ ctx[7] !== undefined) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const keydown_handler = e => {
    	
    };

    const keydown_handler_1 = e => {
    	
    };

    function instance($$self, $$props, $$invalidate) {
    	let $profiles;
    	let $userProfile;
    	let $keyStore;
    	let $theme;
    	validate_store(profiles, 'profiles');
    	component_subscribe($$self, profiles, $$value => $$invalidate(5, $profiles = $$value));
    	validate_store(userProfile, 'userProfile');
    	component_subscribe($$self, userProfile, $$value => $$invalidate(6, $userProfile = $$value));
    	validate_store(keyStore, 'keyStore');
    	component_subscribe($$self, keyStore, $$value => $$invalidate(7, $keyStore = $$value));
    	validate_store(theme, 'theme');
    	component_subscribe($$self, theme, $$value => $$invalidate(8, $theme = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	var Page;

    	(function (Page) {
    		Page[Page["Home"] = 0] = "Home";
    		Page[Page["Settings"] = 1] = "Settings";
    		Page[Page["QrCode"] = 2] = "QrCode";
    		Page[Page["Profile"] = 3] = "Profile";
    		Page[Page["About"] = 4] = "About";
    	})(Page || (Page = {}));

    	let currentPage = Page.Home;
    	let _keyStore = "";
    	let _name = "";
    	let creationMode = false;

    	function registerKeyStore(value) {
    		addKey(value).then(_ => {
    			loadPrivateKey();

    			const i = setInterval(
    				() => {
    					if (($userProfile === null || $userProfile === void 0
    					? void 0
    					: $userProfile.name) !== "") {
    						clearInterval(i);
    						$$invalidate(1, currentPage = Page.Home);
    					} else {
    						loadPrivateKey();
    					}
    				},
    				100
    			);
    		}).catch(err => {
    			alert(err);
    		});
    	}

    	async function addProfile(name, key) {
    		let decodedValue;

    		// check if name already exist in profile or key
    		if (name.length < 4) {
    			alert("Name must be at least 4 characters");
    			return;
    		}

    		try {
    			decodedValue = await verifyKey(key);
    			let prs = $profiles.filter(pr => pr.name === name || pr.data.privateKey === decodedValue);

    			if (prs.length > 0) {
    				alert("Name or key already exist");
    				return;
    			}

    			let profile = {
    				name,
    				data: {
    					privateKey: decodedValue,
    					webSites: {},
    					relays: []
    				}
    			};

    			profiles.update(profiles => [...profiles, profile]);
    			saveProfiles();
    			$$invalidate(3, _name = "");
    			$$invalidate(2, _keyStore = "");
    			$$invalidate(4, creationMode = false);
    		} catch(error) {
    			alert(error);
    		}
    	}

    	async function removeProfileByName(name) {
    		profiles.update(profiles => profiles.filter(profile => profile.name !== name));
    		saveProfiles();
    	}

    	async function openProfile(profile) {
    		keyStore.set(profile.data.privateKey);

    		// store website and relays
    		await settingProfile(profile);

    		loadPrivateKey();
    		$$invalidate(1, currentPage = Page.Home);
    	}

    	loadPrivateKey();
    	loadTheme();
    	loadProfiles();
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	const change_handler = e => {
    		switchTheme(e.target.value);
    	};

    	const click_handler = () => {
    		$$invalidate(1, currentPage = Page.Home);
    	};

    	const click_handler_1 = () => {
    		$$invalidate(1, currentPage = Page.Settings);
    	};

    	const click_handler_2 = () => {
    		$$invalidate(1, currentPage = Page.QrCode);
    	};

    	const click_handler_3 = () => {
    		$$invalidate(1, currentPage = Page.About);
    	};

    	const click_handler_4 = async () => {
    		await logout();
    	};

    	const change_handler_1 = e => {
    		switchTheme(e.target.value || "dark");
    	};

    	const click_handler_5 = profile => {
    		openProfile(profile);
    	};

    	const click_handler_6 = profile => {
    		removeProfileByName(profile.name);
    	};

    	const click_handler_7 = () => {
    		$$invalidate(4, creationMode = true);
    	};

    	const click_handler_8 = () => {
    		$$invalidate(4, creationMode = false);
    	};

    	function input0_input_handler() {
    		_name = this.value;
    		$$invalidate(3, _name);
    	}

    	function input1_input_handler() {
    		_keyStore = this.value;
    		$$invalidate(2, _keyStore);
    	}

    	const click_handler_9 = () => {
    		let sk = generatePrivateKey();
    		$$invalidate(2, _keyStore = nip19_exports.nsecEncode(sk));
    	};

    	const click_handler_10 = () => {
    		addProfile(_name, _keyStore);
    	};

    	$$self.$capture_state = () => ({
    		keyStore,
    		loadPrivateKey,
    		loadTheme,
    		userProfile,
    		addKey,
    		theme,
    		switchTheme,
    		logout,
    		profiles,
    		verifyKey,
    		loadProfiles,
    		saveProfiles,
    		settingProfile,
    		Settings,
    		Home,
    		generatePrivateKey,
    		getPublicKey,
    		nip19: nip19_exports,
    		QrCode,
    		About,
    		Page,
    		currentPage,
    		_keyStore,
    		_name,
    		creationMode,
    		registerKeyStore,
    		addProfile,
    		removeProfileByName,
    		openProfile,
    		$profiles,
    		$userProfile,
    		$keyStore,
    		$theme
    	});

    	$$self.$inject_state = $$props => {
    		if ('Page' in $$props) $$invalidate(0, Page = $$props.Page);
    		if ('currentPage' in $$props) $$invalidate(1, currentPage = $$props.currentPage);
    		if ('_keyStore' in $$props) $$invalidate(2, _keyStore = $$props._keyStore);
    		if ('_name' in $$props) $$invalidate(3, _name = $$props._name);
    		if ('creationMode' in $$props) $$invalidate(4, creationMode = $$props.creationMode);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		Page,
    		currentPage,
    		_keyStore,
    		_name,
    		creationMode,
    		$profiles,
    		$userProfile,
    		$keyStore,
    		$theme,
    		addProfile,
    		removeProfileByName,
    		openProfile,
    		change_handler,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		click_handler_4,
    		change_handler_1,
    		click_handler_5,
    		click_handler_6,
    		click_handler_7,
    		click_handler_8,
    		input0_input_handler,
    		input1_input_handler,
    		click_handler_9,
    		click_handler_10
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
        target: document.body,
    });

    return app;

})();
