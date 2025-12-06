import { __trace } from "libtrace/runtime";
export function add(a, b) {
    const __fnId = "src/math.ts#-#add#L1C1";
    const __callId = __trace.enter(__fnId, {
        thisArg: undefined,
        args: Array.from(arguments),
        env: {}
    });
    try {
        const __ret = a + b;
        __trace.exit(__fnId, __callId, {
            kind: "return",
            value: __ret
        });
        return __ret;
    }
    catch (__err) {
        __trace.exit(__fnId, __callId, {
            kind: "throw",
            error: __err
        });
        throw __err;
    }
}
export const mul = (a, b) => {
    const __fnId = "src/math.ts#-#mul#L5C20";
    const __callId = __trace.enter(__fnId, {
        thisArg: undefined,
        args: [a, b],
        env: {}
    });
    try {
        const __ret = a * b;
        __trace.exit(__fnId, __callId, {
            kind: "return",
            value: __ret
        });
        return __ret;
    }
    catch (__err) {
        __trace.exit(__fnId, __callId, {
            kind: "throw",
            error: __err
        });
        throw __err;
    }
};
export class Calculator {
    constructor(base) {
        this.base = base;
        const __fnId = "src/math.ts#Calculator#constructor#L10C3";
        const __callId = __trace.enter(__fnId, {
            thisArg: this,
            args: Array.from(arguments),
            env: {}
        });
        try {
        }
        catch (__err) {
            __trace.exit(__fnId, __callId, {
                kind: "throw",
                error: __err
            });
            throw __err;
        }
    }
    add(x) {
        const __fnId = "src/math.ts#Calculator#add#L12C3";
        const __callId = __trace.enter(__fnId, {
            thisArg: this,
            args: Array.from(arguments),
            env: {}
        });
        try {
            this.base += 0; // touch state to ensure we keep this binding
            const __ret = this.base + x;
            __trace.exit(__fnId, __callId, {
                kind: "return",
                value: __ret
            });
            return __ret;
        }
        catch (__err) {
            __trace.exit(__fnId, __callId, {
                kind: "throw",
                error: __err
            });
            throw __err;
        }
    }
}
export function demoSort(xs) {
    const __fnId = "src/math.ts#-#demoSort#L18C1";
    const __callId = __trace.enter(__fnId, {
        thisArg: undefined,
        args: Array.from(arguments),
        env: {}
    });
    try {
        const __ret = xs.sort((a, b) => a - b);
        __trace.exit(__fnId, __callId, {
            kind: "return",
            value: __ret
        });
        return __ret;
    }
    catch (__err) {
        __trace.exit(__fnId, __callId, {
            kind: "throw",
            error: __err
        });
        throw __err;
    }
}
