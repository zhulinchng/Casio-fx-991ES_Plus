 class CasioSuperEngine {
        constructor() {
            // UI elements
            this.exprElem = document.getElementById('expr-display');
            this.resElem = document.getElementById('res-display');
            this.menuOverlay = document.getElementById('menu-overlay');
            
            // LCD Flags
            this.flags = {
                S: document.getElementById('flag-s'),
                A: document.getElementById('flag-a'),
                M: document.getElementById('flag-m'),
                STO: document.getElementById('flag-sto'),
                RCL: document.getElementById('flag-rcl'),
                HYP: document.getElementById('flag-hyp'),
                D: document.getElementById('flag-deg'),
                R: document.getElementById('flag-rad'),
                G: document.getElementById('flag-gra')
            };

            // Audio Context for tactile feedback click
            this.audioCtx = null;

            // Internal State
            this.expr = '';
            this.cursor = 0;
            this.lastAnswer = 0;
            this.currentResult = null;
            this.sdState = 0; // 0: decimal/default, 1: fraction, 2: DMS
            this.engExp = null; // engineering-notation exponent offset
            
            this.isShift = false;
            this.isAlpha = false;
            this.isHyp = false;
            this.isSto = false;
            this.isRcl = false;
            this.angleMode = 'DEG'; // DEG, RAD, GRA
            this.inMenu = false;
            
            // Memory registers
            this.vars = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0, Y: 0, M: 0 };

            // History Stack
            this.history = [];
            this.histIdx = -1;

            this.initAudio();
            this.bindEvents();
            this.render();
        }

        initAudio() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.audioCtx = new AudioCtx();
            } catch(e){}
        }

        playClick() {
            if (!this.audioCtx) return;
            try {
                if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(320, this.audioCtx.currentTime);
                gain.gain.setValueAtTime(0.04, this.audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.02);
                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                osc.start();
                osc.stop(this.audioCtx.currentTime + 0.02);
            } catch(e){}
        }

        // --- Render LCD ---
        render() {
            // Update Flags
            this.flags.S.classList.toggle('on', this.isShift);
            this.flags.A.classList.toggle('on', this.isAlpha);
            this.flags.HYP.classList.toggle('on', this.isHyp);
            this.flags.STO.classList.toggle('on', this.isSto);
            this.flags.RCL.classList.toggle('on', this.isRcl);
            this.flags.M.classList.toggle('on', this.vars.M !== 0);
            this.flags.D.classList.toggle('on', this.angleMode === 'DEG');
            this.flags.R.classList.toggle('on', this.angleMode === 'RAD');
            this.flags.G.classList.toggle('on', this.angleMode === 'GRA');

            // Render Expression with Blinking Cursor
            if (this.expr.length === 0) {
                this.exprElem.innerHTML = '<span class="cursor">_</span>';
            } else {
                const left = this.escape(this.expr.slice(0, this.cursor));
                const char = this.escape(this.expr.slice(this.cursor, this.cursor + 1) || ' ');
                const right = this.escape(this.expr.slice(this.cursor + 1));
                this.exprElem.innerHTML = `${left}<span class="cursor">${char}</span>${right}`;
            }
        }

        escape(s) {
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        setResult(val, raw = null) {
            this.resElem.textContent = val;
            if (raw !== null) {
                this.currentResult = raw;
            } else {
                const p = parseFloat(val);
                this.currentResult = isNaN(p) ? null : p;
            }
            this.sdState = 0;
            this.engExp = null;
        }

        // --- Text Editing & Cursor Operations ---
        insert(str) {
            this.expr = this.expr.slice(0, this.cursor) + str + this.expr.slice(this.cursor);
            this.cursor += str.length;
            this.render();
        }

        backspace() {
            if (this.cursor > 0) {
                this.expr = this.expr.slice(0, this.cursor - 1) + this.expr.slice(this.cursor);
                this.cursor--;
                this.render();
            }
        }

        resetModifiers() {
            this.isShift = false;
            this.isAlpha = false;
            this.isSto = false;
            this.isRcl = false;
            // NOTE: isHyp is intentionally kept — on a real fx-991ES PLUS the
            // HYP indicator stays on until a hyperbolic/trig key is used or
            // the calculator is cleared.
            this.render();
        }

        // --- Scientific Computations & Parsing ---
        toFraction(val, maxDen = 5000) {
            if (isNaN(val) || !isFinite(val)) return null;
            if (Math.abs(val - Math.round(val)) < 1e-9) return { n: Math.round(val), d: 1 };
            
            const sign = val < 0 ? -1 : 1;
            val = Math.abs(val);
            let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
            let b = val;
            do {
                let a = Math.floor(b);
                let aux = h1; h1 = a * h1 + h2; h2 = aux;
                aux = k1; k1 = a * k1 + k2; k2 = aux;
                b = 1 / (b - a);
            } while (Math.abs(val - h1 / k1) > val * 1e-9 && k1 < maxDen);

            return k1 <= maxDen ? { n: sign * h1, d: k1 } : null;
        }

        toDMS(val) {
            if (isNaN(val)) return 'Math ERROR';
            const sign = val < 0 ? '-' : '';
            const abs = Math.abs(val);
            let d = Math.floor(abs);
            let m = Math.floor((abs - d) * 60);
            let s = (abs - d - m / 60) * 3600;
            let sec = Math.round(s * 10) / 10;
            if (sec >= 60) { sec = 0; m += 1; }
            if (m >= 60) { m = 0; d += 1; }
            return `${sign}${d}°${m}’${sec.toFixed(1)}”`;
        }

        formatNumber(num) {
            if (isNaN(num) || !isFinite(num)) return 'Math ERROR';
            if (Math.abs(num) >= 1e10 || (Math.abs(num) < 1e-4 && num !== 0)) {
                return num.toExponential(6).replace('e+', '×10^').replace('e', '×10^');
            }
            return parseFloat(num.toFixed(10)).toString();
        }

        factorial(n) {
            if (n < 0 || n > 170 || !Number.isInteger(n)) return NaN;
            let r = 1;
            for (let i = 2; i <= n; i++) r *= i;
            return r;
        }

        nPr(n, r) {
            if (n < r || n < 0 || r < 0) return NaN;
            return this.factorial(n) / this.factorial(n - r);
        }

        nCr(n, r) {
            if (n < r || n < 0 || r < 0) return NaN;
            return this.factorial(n) / (this.factorial(r) * this.factorial(n - r));
        }

        // Numerical Derivative: d/dx(f(x), atX)
        evalDerivative(funcStr, atX) {
            const h = 1e-6;
            const y2 = this.evalSubFunc(funcStr, atX + h);
            const y1 = this.evalSubFunc(funcStr, atX - h);
            return (y2 - y1) / (2 * h);
        }

        // Numerical Integration: ∫(f(x), a, b) via Simpson's 1/3 rule
        evalIntegral(funcStr, a, b) {
            const n = 60; // subdivisions
            const h = (b - a) / n;
            let sum = this.evalSubFunc(funcStr, a) + this.evalSubFunc(funcStr, b);
            for (let i = 1; i < n; i++) {
                const x = a + i * h;
                sum += this.evalSubFunc(funcStr, x) * (i % 2 === 0 ? 2 : 4);
            }
            return (h / 3) * sum;
        }

        // Evaluate user function with an assigned value for variable X
        evalSubFunc(funcExpr, xVal) {
            const oldX = this.vars.X;
            this.vars.X = xVal;
            try {
                return this.solveParsed(funcExpr);
            } finally {
                this.vars.X = oldX;
            }
        }

        // Central Math Parser
        solveParsed(inputStr) {
            let s = String(inputStr);

            // --- Parser helpers -------------------------------------------------
            const matchParen = (str, i) => {
                let d = 0;
                for (let j = i; j < str.length; j++) {
                    if (str[j] === '(') d++;
                    else if (str[j] === ')') { d--; if (d === 0) return j; }
                }
                return -1;
            };

            const splitTop = (str) => {
                const parts = [];
                let d = 0, cur = '';
                for (const ch of str) {
                    if (ch === ',' && d === 0) { parts.push(cur); cur = ''; }
                    else { cur += ch; if (ch === '(') d++; else if (ch === ')') d--; }
                }
                parts.push(cur);
                return parts.map(p => p.trim());
            };

            // Evaluate calls whose arguments are full sub-expressions.
            // The arguments are parsed recursively, so nested commas, parens,
            // π, variables (X, Ans …) and nested calculus are all handled.
            const extractCalls = (name, fn) => {
                let i = s.indexOf(name);
                while (i !== -1) {
                    const open = i + name.length - 1; // index of '('
                    if (s[open] !== '(') break;
                    const close = matchParen(s, open);
                    if (close === -1) break;
                    const args = splitTop(s.slice(open + 1, close));
                    const val = fn(args);
                    s = s.slice(0, i) + '(' + val + ')' + s.slice(close + 1);
                    i = s.indexOf(name);
                }
            };

            const evalArg = (a) => this.solveParsed(a);

            extractCalls('d/dx(', a => this.evalDerivative(a[0], evalArg(a[1])));
            extractCalls('∫(', a => this.evalIntegral(a[0], evalArg(a[1]), evalArg(a[2])));
            extractCalls('Σ(', a => {
                const lo = Math.round(evalArg(a[1]));
                const hi = Math.round(evalArg(a[2]));
                let acc = 0;
                for (let x = lo; x <= hi; x++) acc += this.evalSubFunc(a[0], x);
                return acc;
            });
            extractCalls('log_b(', a => Math.log(evalArg(a[1])) / Math.log(evalArg(a[0])));
            extractCalls('Pol(', a => Math.hypot(evalArg(a[0]), evalArg(a[1])));
            extractCalls('Rec(', a => {
                const r = evalArg(a[0]);
                const t = evalArg(a[1]);
                const rad = this.angleMode === 'DEG' ? t * Math.PI / 180
                          : this.angleMode === 'GRA' ? t * Math.PI / 200 : t;
                return r * Math.cos(rad);
            });
            extractCalls('RanInt(', a => {
                const lo = Math.ceil(evalArg(a[0]));
                const hi = Math.floor(evalArg(a[1]));
                return lo + Math.floor(Math.random() * (hi - lo + 1));
            });

            // Mixed fraction → formatted display string (top level only)
            let mixedResult = null;
            {
                let i = s.indexOf('Mixed(');
                while (i !== -1) {
                    const open = i + 'Mixed('.length - 1;
                    if (s[open] !== '(') break;
                    const close = matchParen(s, open);
                    if (close === -1) break;
                    const v = evalArg(s.slice(open + 1, close));
                    const frac = this.toFraction(v);
                    let txt;
                    if (frac && frac.d > 1) {
                        const whole = Math.trunc(v);
                        const m = Math.abs(frac.n) - Math.abs(whole) * frac.d;
                        txt = whole === 0 ? `${frac.n}⌟${frac.d}`
                            : (m === 0 ? `${whole}` : `${whole}⌟${m}⌟${frac.d}`);
                    } else {
                        txt = this.formatNumber(v);
                    }
                    s = s.slice(0, i) + '@MIXED@' + s.slice(close + 1);
                    mixedResult = txt;
                    i = s.indexOf('Mixed(');
                }
                if (mixedResult !== null) {
                    const rest = s.replace(/@MIXED@/g, '').replace(/[\s()+\-×÷*/]/g, '');
                    if (rest === '') return mixedResult;
                    s = s.replace(/@MIXED@/g, 'NaN');
                }
            }

            // Protect scientific-notation literals (e.g. 1.6e-19 from CONV)
            // so the Euler-'e' substitution below cannot corrupt them.
            s = s.replace(/(\d(?:\.\d+)?)e([+-]?\d+)/g, '$1@$2');

            // Constants
            s = s.replace(/π/g, `(${Math.PI})`);
            s = s.replace(/Ran#/g, '(Math.random())');
            s = s.replace(/e(?![a-zA-Z0-9_])/g, `(${Math.E})`);
            s = s.replace(/Ans/g, `(${this.lastAnswer})`);

            // Permutations & Combinations (e.g. 5 P 2 or 5 C 2)
            // NOTE: must run BEFORE variable substitution consumes the C variable.
            s = s.replace(/(\d+)\s*P\s*(\d+)/g, (_, n, r) => `(${this.nPr(+n, +r)})`);
            s = s.replace(/(\d+)\s*C\s*(\d+)/g, (_, n, r) => `(${this.nCr(+n, +r)})`);

            // Variables substitution
            for (const [k, v] of Object.entries(this.vars)) {
                const re = new RegExp(`\\b${k}\\b`, 'g');
                s = s.replace(re, `(${v})`);
                // a variable can also follow a digit (e.g. "2X") — \b misses it
                const re2 = new RegExp(`(?<=\\d)${k}\\b`, 'g');
                s = s.replace(re2, `(${v})`);
            }

            // Values substituted above (and Ans) may themselves be exponential
            // literals (e.g. 1e-7, 1e+21). Protect them again so the
            // implicit-multiplication pass below and the Euler-e path cannot
            // corrupt them.
            s = s.replace(/(\d(?:\.\d+)?)e([+-]?\d+)/g, '$1@$2');

            // Factorial (n!)
            s = s.replace(/(\d+)!/g, (_, n) => `(${this.factorial(+n)})`);
            // Postfix factorial over a compound operand: (2+3)! , (5)! , sin(30)! …
            {
                let i = s.indexOf('!');
                while (i !== -1) {
                    if (i > 0 && s[i - 1] === ')') {
                        let d = 0, open = -1;
                        for (let j = i - 1; j >= 0; j--) {
                            if (s[j] === ')') d++;
                            else if (s[j] === '(') { d--; if (d === 0) { open = j; break; } }
                        }
                        if (open !== -1) {
                            // If the parens belong to a function call
                            // (e.g. "sin(30)!"), the factorial applies to the
                            // whole call, so extend the operand leftwards over
                            // the function name.
                            let start = open;
                            while (start > 0 && /[A-Za-z0-9_.]/.test(s[start - 1])) start--;
                            const operand = s.slice(start, i);
                            s = s.slice(0, start) + `(this.factorial(${operand}))` + s.slice(i + 1);
                            i = s.indexOf('!');
                            continue;
                        }
                    }
                    i = s.indexOf('!', i + 1);
                }
            }

            // Powers & Roots
            s = s.replace(/²/g, '**2');
            s = s.replace(/³/g, '**3');
            s = s.replace(/\^/g, '**');

            // Replace display symbols (do this BEFORE the % rules so that
            // expressions like 200−5% and 200×5% are handled correctly)
            s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');

            // Percentage: a+b% = a + a*b/100 (Casio convention); a×b%, a÷b%, a% = a/100
            // For division the percent operand is itself /100 first:
            // 200÷5% = 200÷0.05 = 4000.
            s = s.replace(/([\d.()]+)\s*\/\s*(\d+(?:\.\d+)?)\s*%/g, '$1/($2/100)');
            s = s.replace(/([\d.()]+)\s*([+-])\s*(\d+(?:\.\d+)?)\s*%/g, '$1$2$1*$3/100');
            s = s.replace(/([\d.()]+)\s*%/g, '$1/100');

            // Implicit multiplication: 2(3), (2)(3), 4π… (done BEFORE the
            // Math.* tokens are introduced so digits inside names like
            // "Math.log10(" are never matched)
            s = s.replace(/\)\s*\(/g, ')*(');
            s = s.replace(/(\d)\s*\(/g, '$1*(');
            s = s.replace(/\)\s*(\d)/g, ')*$1');
            s = s.replace(/(\d)\s*(?=[A-Za-z√∛])/g, '$1*');
            s = s.replace(/\)\s*(?=[A-Za-z√∛])/g, ')*');

            // Angle Conversions for Trig
            let toRad = '1';
            let fromRad = '1';
            if (this.angleMode === 'DEG') {
                toRad = '(Math.PI/180)';
                fromRad = '(180/Math.PI)';
            } else if (this.angleMode === 'GRA') {
                toRad = '(Math.PI/200)';
                fromRad = '(200/Math.PI)';
            }

            // Standard Trig & Inverses (balanced-paren replacement keeps the
            // parentheses balanced and handles nested calls safely)
            const convFn = (name, build) => {
                let i = s.indexOf(name);
                while (i !== -1) {
                    if (i > 0 && /[A-Za-z0-9_.]/.test(s[i - 1])) { i = s.indexOf(name, i + 1); continue; }
                    const open = i + name.length - 1; // index of '('
                    if (s[open] !== '(') break;
                    const close = matchParen(s, open);
                    if (close === -1) break;
                    const arg = s.slice(open + 1, close);
                    s = s.slice(0, i) + build(arg) + s.slice(close + 1);
                    i = s.indexOf(name);
                }
            };

            convFn('sin⁻¹(', a => `(${fromRad}*Math.asin(${a}))`);
            convFn('cos⁻¹(', a => `(${fromRad}*Math.acos(${a}))`);
            convFn('tan⁻¹(', a => `(${fromRad}*Math.atan(${a}))`);
            convFn('sinh(', a => `Math.sinh(${a})`);
            convFn('cosh(', a => `Math.cosh(${a})`);
            convFn('tanh(', a => `Math.tanh(${a})`);
            convFn('sin(', a => `Math.sin(${toRad}*(${a}))`);
            convFn('cos(', a => `Math.cos(${toRad}*(${a}))`);
            convFn('tan(', a => `Math.tan(${toRad}*(${a}))`);
            convFn('log(', a => `Math.log10(${a})`);
            convFn('ln(', a => `Math.log(${a})`);
            s = s.replace(/√\(/g, 'Math.sqrt(');
            s = s.replace(/∛\(/g, 'Math.cbrt(');

            // Restore protected scientific-notation literals
            s = s.replace(/@/g, 'e');

            // Regroup unary +/- immediately before ** (JS syntax limitation)
            s = this.fixUnaryMinusPow(s);

            // Execute safely
            const fn = new Function(`return (${s});`).bind(this);
            return fn();
        }

        // Rewrites "-a**b" → "-(a**b)" for unary signs in operand position
        // ("Unary operator used immediately before exponentiation expression"
        // is a SyntaxError in JavaScript).
        fixUnaryMinusPow(s) {
            const parseFactor = (str, k) => {
                let n = k;
                while (n < str.length && str[n] === ' ') n++;
                if (str[n] === '(') {
                    let d = 0;
                    for (let j = n; j < str.length; j++) {
                        if (str[j] === '(') d++;
                        else if (str[j] === ')') { d--; if (d === 0) return { txt: str.slice(n, j + 1), end: j + 1 }; }
                    }
                    return null;
                }
                let e = n;
                while (e < str.length && /[0-9A-Za-z_$.]/.test(str[e])) e++;
                if (e > n) {
                    // A factor may be a call like Math.sqrt(...): consume the
                    // argument list too, so e.g. "-Math.sqrt(4)**2" can be
                    // wrapped as a whole factor.
                    let m = e;
                    while (m < str.length && str[m] === ' ') m++;
                    if (str[m] === '(') {
                        let d = 0;
                        for (let j = m; j < str.length; j++) {
                            if (str[j] === '(') d++;
                            else if (str[j] === ')') { d--; if (d === 0) return { txt: str.slice(n, j + 1), end: j + 1 }; }
                        }
                    }
                    return { txt: str.slice(n, e), end: e };
                }
                return null;
            };

            // Pass 1: unary +/- in operand position directly before a ** chain.
            let out = '';
            let i = 0;
            while (i < s.length) {
                const ch = s[i];
                if (ch === '-' || ch === '+') {
                    let j = out.length - 1;
                    while (j >= 0 && out[j] === ' ') j--;
                    const prev = j >= 0 ? out[j] : '';
                    const prev2 = j >= 1 ? out[j - 1] : '';
                    const looksUnary = (prev === '' || /[(,:+\-*/%^=]/.test(prev));
                    const isExponentSign = (prev === '*' && prev2 === '*');
                    if (looksUnary && !isExponentSign) {
                        const f = parseFactor(s, i + 1);
                        if (f) {
                            let k = f.end;
                            while (k < s.length && s[k] === ' ') k++;
                            if (s.slice(k, k + 2) === '**') {
                                let chain = f.txt;
                                let n = k + 2;
                                while (true) {
                                    while (n < s.length && s[n] === ' ') n++;
                                    let sign = '';
                                    if (s[n] === '-' || s[n] === '+') { sign = s[n]; n++; }
                                    const f2 = parseFactor(s, n);
                                    if (!f2) break;
                                    chain += '**' + sign + f2.txt;
                                    n = f2.end;
                                    let p = n;
                                    while (p < s.length && s[p] === ' ') p++;
                                    if (s.slice(p, p + 2) === '**') { n = p + 2; continue; }
                                    break;
                                }
                                out += ch + '(' + chain + ')';
                                i = n;
                                continue;
                            }
                        }
                    }
                }
                out += ch;
                i++;
            }

            // Pass 2: a unary sign that starts a chained exponent.
            // "a**-b**c" is a SyntaxError in JS; rewrite as "a**(-(b**c))".
            let out2 = '';
            i = 0;
            while (i < out.length) {
                if (out.slice(i, i + 2) === '**') {
                    let j = i + 2;
                    while (j < out.length && out[j] === ' ') j++;
                    let sign = '';
                    if (out[j] === '-' || out[j] === '+') { sign = out[j]; j++; }
                    if (sign) {
                        const f1 = parseFactor(out, j);
                        if (f1) {
                            let chain = f1.txt;
                            let k = f1.end;
                            let hasMore = false;
                            while (true) {
                                let p = k;
                                while (p < out.length && out[p] === ' ') p++;
                                if (out.slice(p, p + 2) === '**') {
                                    hasMore = true;
                                    let q = p + 2;
                                    while (q < out.length && out[q] === ' ') q++;
                                    let sg = '';
                                    if (out[q] === '-' || out[q] === '+') { sg = out[q]; q++; }
                                    const f2 = parseFactor(out, q);
                                    if (!f2) break;
                                    chain += '**' + sg + f2.txt;
                                    k = f2.end;
                                } else break;
                            }
                            if (hasMore) {
                                out2 += '**(' + (sign === '-' ? '-(' : '+(') + chain + '))';
                                i = k;
                                continue;
                            }
                        }
                    }
                }
                out2 += out[i];
                i++;
            }
            return out2;
        }

        evaluate() {
            if (!this.expr.trim()) return;

            // Auto-close missing parentheses
            let openP = (this.expr.match(/\(/g) || []).length;
            let closeP = (this.expr.match(/\)/g) || []).length;
            if (openP > closeP) {
                this.expr += ')'.repeat(openP - closeP);
                this.cursor = this.expr.length;
                this.render();
            }

            try {
                const res = this.solveParsed(this.expr);
                if (typeof res === 'string') {
                    // e.g. Mixed() returns a formatted display string
                    this.history.push(this.expr);
                    this.histIdx = this.history.length;
                    this.setResult(res, null);
                } else if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
                    this.lastAnswer = res;
                    this.history.push(this.expr);
                    this.histIdx = this.history.length;
                    
                    // Show formatted result
                    this.setResult(this.formatNumber(res), res);
                } else {
                    this.setResult('Math ERROR', null);
                }
            } catch (err) {
                this.setResult('Syntax ERROR', null);
            }
        }

        // --- Action Router ---
        handleKey(key) {
            this.playClick();

            // Menu interactions
            if (this.inMenu) {
                if (key === '1') { this.angleMode = 'DEG'; }
                if (key === '2') { this.angleMode = 'RAD'; }
                if (key === '3') { this.angleMode = 'GRA'; }
                this.menuOverlay.style.display = 'none';
                this.inMenu = false;
                this.render();
                return;
            }

            // Resolve a variable register letter from a key press.
            // Variable letters arrive via ALPHA + key; raw letter tokens
            // are also accepted. ALPHA+M_PLUS emits variable M but must not
            // trigger the M+/M- memory operation.
            const alphaInsertMap = {
                'INV': 'A', 'LOGAB': 'B', 'FRAC': 'C', 'SQRT': 'D',
                'SQR': 'E', 'POW': 'F', 'LOG': 'X', 'LN': 'Y', 'M_PLUS': 'M',
                ')': 'X', 'EXP': 'e', 'DOT': 'RanInt('
            };
            let varKey = null;
            if (/^[A-FXYM]$/.test(key)) varKey = key;
            else if (this.isAlpha && /^[A-FXYM]$/.test(alphaInsertMap[key] || '')) varKey = alphaInsertMap[key];

            // STO (Store to variable)
            if (this.isSto && varKey) {
                this.vars[varKey] = this.currentResult !== null ? this.currentResult : this.lastAnswer;
                this.setResult(`${varKey} = ${this.vars[varKey]}`, this.vars[varKey]);
                this.resetModifiers();
                return;
            }

            // RCL (Recall variable value into expression)
            if (this.isRcl && varKey) {
                this.insert(this.vars[varKey].toString());
                this.resetModifiers();
                return;
            }

            // Modifier Keys
            if (key === 'SHIFT') {
                this.isShift = !this.isShift;
                this.isAlpha = false;
                this.render();
                return;
            }
            if (key === 'ALPHA') {
                this.isAlpha = !this.isAlpha;
                this.isShift = false;
                this.render();
                return;
            }
            if (key === 'HYP') {
                this.isHyp = !this.isHyp;
                this.render();
                return;
            }

            // ON / AC / Clear
            if (key === 'ON' || key === 'AC') {
                this.isHyp = false;
                if (this.isShift && key === 'AC') {
                    // Turn off calculator effect
                    this.expr = '';
                    this.cursor = 0;
                    this.resElem.textContent = '';
                } else {
                    this.expr = '';
                    this.cursor = 0;
                    this.resElem.textContent = '0';
                    this.currentResult = 0;
                }
                this.resetModifiers();
                return;
            }

            // Delete (DEL / INS)
            if (key === 'DEL') {
                this.backspace();
                this.resetModifiers();
                return;
            }

            // Equals / Evaluation
            if (key === 'EXE') {
                this.evaluate();
                this.resetModifiers();
                return;
            }

            // MODE / SETUP Menu
            if (key === 'MODE') {
                if (this.isShift) {
                    // Toggle angle modes quickly
                    this.angleMode = this.angleMode === 'DEG' ? 'RAD' : (this.angleMode === 'RAD' ? 'GRA' : 'DEG');
                } else {
                    this.inMenu = true;
                    this.menuOverlay.style.display = 'flex';
                }
                this.resetModifiers();
                return;
            }

            // S<=>D Display Mode Switcher (Fraction <-> Decimal <-> DMS)
            if (key === 'SD') {
                if (typeof this.currentResult === 'number' && isFinite(this.currentResult)) {
                    if (this.sdState === 0) {
                        const frac = this.toFraction(this.currentResult);
                        if (frac && frac.d > 1) {
                            this.resElem.textContent = `${frac.n} ⌟ ${frac.d}`;
                            this.sdState = 1;
                        } else {
                            this.resElem.textContent = this.toDMS(this.currentResult);
                            this.sdState = 2;
                        }
                    } else if (this.sdState === 1) {
                        this.resElem.textContent = this.toDMS(this.currentResult);
                        this.sdState = 2;
                    } else {
                        this.resElem.textContent = this.formatNumber(this.currentResult);
                        this.sdState = 0;
                    }
                }
                this.resetModifiers();
                return;
            }

            // DMS conversion directly
            if (key === 'DMS') {
                if (typeof this.currentResult === 'number' && isFinite(this.currentResult)) {
                    this.resElem.textContent = this.toDMS(this.currentResult);
                    this.sdState = 2;
                }
                this.resetModifiers();
                return;
            }

            // ENG (Engineering exponent shift) — display-only: the stored
            // value must NOT change, only its mantissa/exponent presentation.
            if (key === 'ENG') {
                if (typeof this.currentResult === 'number' && isFinite(this.currentResult) && this.currentResult !== 0) {
                    if (this.engExp === null || this.engExp === undefined) {
                        this.engExp = Math.floor(Math.log10(Math.abs(this.currentResult)) / 3) * 3;
                        if (this.isShift) this.engExp += 3;
                    } else {
                        this.engExp += this.isShift ? 3 : -3;
                    }
                    const mantissa = this.currentResult / Math.pow(10, this.engExp);
                    this.resElem.textContent = `${parseFloat(mantissa.toPrecision(10))}×10^${this.engExp}`;
                }
                this.resetModifiers();
                return;
            }

            // RCL & STO toggling
            if (key === 'RCL') {
                if (this.isShift) {
                    this.isSto = true;
                    this.isRcl = false;
                } else {
                    this.isRcl = true;
                    this.isSto = false;
                }
                this.isShift = false;
                this.isAlpha = false;
                this.render();
                return;
            }

            // Memory M+ / M-
            if (key === 'M_PLUS' && !this.isAlpha) {
                const cur = this.currentResult !== null ? this.currentResult : this.lastAnswer;
                if (this.isShift) {
                    this.vars.M -= cur;
                } else {
                    this.vars.M += cur;
                }
                this.resetModifiers();
                return;
            }

            // CALC / SOLVE
            if (key === 'CALC') {
                if (this.isShift) {
                    // SOLVE: Secant root finder for equation = 0 with variable X
                    try {
                        if (!this.expr.trim()) throw new Error('empty');
                        let x0 = (typeof this.vars.X === 'number' && isFinite(this.vars.X) && this.vars.X !== 0) ? this.vars.X : 0.1;
                        let x1 = x0 + 0.01;
                        let converged = false;
                        for (let i = 0; i < 30; i++) {
                            let y0 = this.evalSubFunc(this.expr, x0);
                            let y1 = this.evalSubFunc(this.expr, x1);
                            if (typeof y1 !== 'number' || !isFinite(y1)) break;
                            if (Math.abs(y1) < 1e-8) { converged = true; break; }
                            if (typeof y0 !== 'number' || !isFinite(y0) || y1 === y0) break;
                            let dx = (y1 * (x1 - x0)) / (y1 - y0);
                            x0 = x1;
                            x1 -= dx;
                        }
                        if (typeof x1 !== 'number' || isNaN(x1) || !isFinite(x1)) throw new Error('no root');
                        // Accept only a genuine root: the search must have
                        // converged (|f(x₁)| < 1e-8 at some iteration).
                        if (!converged) throw new Error('no root');
                        this.vars.X = x1;
                        this.setResult(`X = ${this.formatNumber(x1)}`, x1);
                    } catch (e) {
                        this.setResult('Math ERROR', null);
                    }
                } else {
                    // CALC: Evaluate current expression with preset variables
                    this.evaluate();
                }
                this.resetModifiers();
                return;
            }

            // Math Function Tokens
            let tok = null;

            if (this.isAlpha) {
                // ALPHA variables and special tokens (A..M, X, e, RanInt()
                const alphaKeys = alphaInsertMap;
                if (alphaKeys[key]) tok = alphaKeys[key];
            } else if (this.isShift) {
                // SHIFT yellow secondary mappings
                const shiftKeys = {
                    'INTG': 'd/dx(', 'INV': '!', 'LOGAB': 'Σ(',
                    'FRAC': 'Mixed(', 'SQRT': '∛(', 'SQR': '³',
                    'POW': '^(', 'LOG': '10^(', 'LN': 'e^(',
                    'SIN': 'sin⁻¹(', 'COS': 'cos⁻¹(', 'TAN': 'tan⁻¹(',
                    'MUL': ' P ', 'DIV': ' C ', 'ADD': 'Pol(', 'SUB': 'Rec(',
                    'EXP': 'π', 'DOT': 'Ran#', 'ANS': '%'
                };
                if (shiftKeys[key]) tok = shiftKeys[key];
            }

            // Default Primary Key Mappings
            if (tok === null) {
                switch (key) {
                    case 'INTG': tok = '∫('; break;
                    case 'INV': tok = '^(-1)'; break;
                    case 'LOGAB': tok = 'log_b('; break;
                    case 'FRAC': tok = '/'; break;
                    case 'SQRT': tok = '√('; break;
                    case 'SQR': tok = '²'; break;
                    case 'POW': tok = '^('; break;
                    case 'LOG': tok = 'log('; break;
                    case 'LN': tok = 'ln('; break;
                    case 'NEG': tok = '(-'; break;
                    case 'SIN': tok = this.isHyp ? 'sinh(' : 'sin('; this.isHyp = false; break;
                    case 'COS': tok = this.isHyp ? 'cosh(' : 'cos('; this.isHyp = false; break;
                    case 'TAN': tok = this.isHyp ? 'tanh(' : 'tan('; this.isHyp = false; break;
                    case '(': tok = '('; break;
                    case ')': tok = ')'; break;
                    case 'MUL': tok = '×'; break;
                    case 'DIV': tok = '÷'; break;
                    case 'ADD': tok = '+'; break;
                    case 'SUB': tok = '−'; break;
                    case 'DOT': tok = '.'; break;
                    case 'EXP': tok = '×10^'; break;
                    case 'ANS': tok = 'Ans'; break;
                    case 'CONST': tok = '299792458'; break; // Speed of light
                    case 'CONV': tok = '*(1.602176634e-19)'; break;
                    default:
                        if (/^[0-9]$/.test(key)) tok = key;
                }
            }

            if (tok) this.insert(tok);
            this.resetModifiers();
        }

        // D-Pad Cursor Navigation and History
        handleNav(dir) {
            this.playClick();
            if (dir === 'LF') {
                if (this.cursor > 0) this.cursor--;
            } else if (dir === 'RT') {
                if (this.cursor < this.expr.length) this.cursor++;
            } else if (dir === 'UP') {
                if (this.history.length > 0 && this.histIdx > 0) {
                    this.histIdx--;
                    this.expr = this.history[this.histIdx];
                    this.cursor = this.expr.length;
                }
            } else if (dir === 'DN') {
                if (this.histIdx < this.history.length - 1) {
                    this.histIdx++;
                    this.expr = this.history[this.histIdx];
                    this.cursor = this.expr.length;
                }
            }
            this.render();
        }

        bindEvents() {
            // Calculator Keys
            document.querySelectorAll('.k').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleKey(btn.getAttribute('data-k'));
                });
            });

            // Replay D-Pad Arrows
            document.querySelectorAll('.arrow-key').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleNav(btn.getAttribute('data-dir'));
                });
            });

            // Physical Keyboard support
            window.addEventListener('keydown', (e) => {
                if (e.key >= '0' && e.key <= '9') this.handleKey(e.key);
                else if (e.key === '.') this.handleKey('DOT');
                else if (e.key === '+') this.handleKey('ADD');
                else if (e.key === '-') this.handleKey('SUB');
                else if (e.key === '*') this.handleKey('MUL');
                else if (e.key === '/') { e.preventDefault(); this.handleKey('DIV'); }
                else if (e.key === '(') this.handleKey('(');
                else if (e.key === ')') this.handleKey(')');
                else if (e.key === '^') this.handleKey('POW');
                else if (e.key === 'Backspace') this.handleKey('DEL');
                else if (e.key === 'Escape') this.handleKey('AC');
                else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); this.handleKey('EXE'); }
                else if (e.key === 'ArrowLeft') this.handleNav('LF');
                else if (e.key === 'ArrowRight') this.handleNav('RT');
                else if (e.key === 'ArrowUp') this.handleNav('UP');
                else if (e.key === 'ArrowDown') this.handleNav('DN');
            });
        }
    }

    // Start engine when document loads
    document.addEventListener('DOMContentLoaded', () => {
        window.casioEngine = new CasioSuperEngine();
    });