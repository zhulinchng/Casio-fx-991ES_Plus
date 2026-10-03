/*
 * Headless test suite for the fx-991ES PLUS engine (script.js).
 * Run with:  node test.js
 * Zero dependencies — uses the same DOM stub trick as a browser would provide.
 */
const fs = require('fs');
const path = require('path');

// ---- Minimal DOM stub ------------------------------------------------------
function makeElem() {
    return {
        innerHTML: '', textContent: '', style: {},
        classList: { toggle: () => {}, add: () => {}, remove: () => {} },
        getAttribute: () => null, addEventListener: () => {},
    };
}
const elems = {};
global.document = {
    getElementById: (id) => (elems[id] ||= makeElem()),
    querySelectorAll: () => [],
    addEventListener: () => {},
};
global.window = { addEventListener: () => {} };
global.AudioContext = undefined;

const code = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
eval(code + '\nglobalThis.CasioSuperEngine = CasioSuperEngine;');

function freshEngine() {
    const eng = Object.create(CasioSuperEngine.prototype);
    eng.expr = ''; eng.cursor = 0; eng.lastAnswer = 0; eng.currentResult = null;
    eng.sdState = 0; eng.engExp = null; eng.isShift = false; eng.isAlpha = false; eng.isHyp = false;
    eng.isSto = false; eng.isRcl = false; eng.angleMode = 'DEG'; eng.inMenu = false;
    eng.vars = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, X: 0, Y: 0, M: 0 };
    eng.history = []; eng.histIdx = -1;
    eng.exprElem = makeElem(); eng.resElem = makeElem(); eng.menuOverlay = makeElem();
    eng.flags = new Proxy({}, { get: () => ({ classList: { toggle: () => {} } }) });
    return eng;
}

const eng = freshEngine();
let pass = 0, fail = 0;
function eq(name, actual, expected, tol = 1e-6) {
    const ok = typeof expected === 'number'
        ? (typeof actual === 'number' && Math.abs(actual - expected) < tol)
        : actual === expected;
    if (ok) { pass++; }
    else { fail++; console.error(`FAIL ${name}: expected ${expected}, got ${actual}`); }
}
function throws(name, fn) {
    try { const v = fn(); fail++; console.error(`FAIL ${name}: expected throw, got ${v}`); }
    catch { pass++; }
}

// ---- Core arithmetic -------------------------------------------------------
eq('add', eng.solveParsed('1+2*3'), 7);
eq('paren', eng.solveParsed('(1+2)*3'), 9);
eq('chain parens', eng.solveParsed('(2)(3)(4)'), 24);
eq('fraction expr', eng.solveParsed('3÷4+1÷4'), 1);
eq('power', eng.solveParsed('2^10'), 1024);
eq('neg pow', eng.solveParsed('-5^2'), -25);
eq('neg paren pow', eng.solveParsed('-(3+2)**2'), -25);
eq('exp right', eng.solveParsed('10^-2'), 0.01);
eq('factorial', eng.solveParsed('5!'), 120);
eq('nPr', eng.solveParsed('6 P 3'), 120);
eq('nCr', eng.solveParsed('6 C 3'), 20);
eq('nCr with C var', eng.solveParsed('6 C 3'), 20); // C register still 0/unused
eng.vars.C = 5;
eq('nCr uses operator C', eng.solveParsed('5 C 2'), 10);
eng.vars.C = 0;

// ---- Functions -------------------------------------------------------------
eq('sin deg', eng.solveParsed('sin(30)'), 0.5, 1e-9);
eq('cos deg', eng.solveParsed('cos(60)'), 0.5, 1e-9);
eq('tan deg', eng.solveParsed('tan(45)'), 1, 1e-9);
eq('sin inverse', eng.solveParsed('sin⁻¹(0.5)'), 30, 1e-6);
eq('cos inverse', eng.solveParsed('cos⁻¹(0.5)'), 60, 1e-6);
eq('tan inverse', eng.solveParsed('tan⁻¹(1)'), 45, 1e-6);
eq('sinh', eng.solveParsed('sinh(0)'), 0);
eq('cosh', eng.solveParsed('cosh(0)'), 1);
eq('sqrt', eng.solveParsed('√(9)'), 3);
eq('cbrt', eng.solveParsed('∛(27)'), 3);
eq('log10', eng.solveParsed('log(1000)'), 3, 1e-9);
eq('ln e', eng.solveParsed('ln(e)'), 1, 1e-9);
eq('log_b', eng.solveParsed('log_b(2,8)'), 3, 1e-9);
eq('nested log_b', eng.solveParsed('log_b(2,(4+4))'), 3, 1e-9);

// ---- Implicit multiplication ----------------------------------------------
eq('2sin', eng.solveParsed('2sin(30)'), 1, 1e-9);
eq('paren sin', eng.solveParsed('(2+3)sin(30)'), 2.5, 1e-9);
eq('paren sqrt', eng.solveParsed('(2+3)√(4)'), 10);
eq('pi sqrt', eng.solveParsed('2π√(4)'), 4 * Math.PI, 1e-9);
eq('paren paren var', eng.solveParsed('(2)(X)'), 0); // X = 0
eng.vars.X = 3;
eq('2 X', eng.solveParsed('2X'), 6);
eng.vars.X = 0;

// ---- Angle modes ------------------------------------------------------------
eq('sin rad', (() => { eng.angleMode = 'RAD'; const v = eng.solveParsed('sin(π/6)'); eng.angleMode = 'DEG'; return v; })(), 0.5, 1e-9);
eq('sin gra', (() => { eng.angleMode = 'GRA'; const v = eng.solveParsed('sin(50)'); eng.angleMode = 'DEG'; return v; })(), 0.70710678, 1e-6);

// ---- Constants & literals ---------------------------------------------------
eq('pi', eng.solveParsed('π'), Math.PI);
eq('euler e', eng.solveParsed('e'), Math.E);
eq('2e', eng.solveParsed('2e'), 2 * Math.E, 1e-9);
eq('10^', eng.solveParsed('10^2'), 100);
eq('e^', eng.solveParsed('e^1'), Math.E, 1e-9);
eq('scientific literal', eng.solveParsed('5000*(1.602176634e-19)'), 8.01088317e-16, 1e-25);
eq('Ans', (() => { eng.lastAnswer = 5; const v = eng.solveParsed('Ans+1'); eng.lastAnswer = 0; return v; })(), 6);

// ---- Calculus ----------------------------------------------------------------
eq('derivative', eng.solveParsed('d/dx(X^3,2)'), 12, 1e-4);
eq('integral', eng.solveParsed('∫(X^2,0,1)'), 1 / 3, 1e-6);
eq('nested integral', eng.solveParsed('∫(∫(X,0,1),0,2)'), 1, 1e-4);
eng.angleMode = 'RAD';
eq('integral sin', eng.solveParsed('∫(sin(X),0,π)'), 2, 1e-3);
eng.angleMode = 'DEG';

// ---- Extra functions (formerly Syntax ERROR) --------------------------------
eq('Sigma', eng.solveParsed('Σ(X,1,5)'), 15);
eq('Pol', eng.solveParsed('Pol(3,4)'), 5);
eq('Rec deg', eng.solveParsed('Rec(5,60)'), 2.5, 1e-6);
eq('RanInt range', (() => { const v = eng.solveParsed('RanInt(1,6)'); return Number.isInteger(v) && v >= 1 && v <= 6; })(), true);
eq('Mixed', eng.solveParsed('Mixed(12.875)'), '12⌟7⌟8');
eq('Mixed integer', eng.solveParsed('Mixed(4)'), '4');
eq('percent plus', eng.solveParsed('200+5%'), 210);
eq('percent times', eng.solveParsed('200×5%'), 10);
eq('percent div', eng.solveParsed('200÷5%'), 4000, 1e-9);
eq('percent unicode minus', eng.solveParsed('200−5%'), 190);
eq('percent unicode times', eng.solveParsed('200×5%'), 10);
eq('percent parens', eng.solveParsed('(200+5)%'), 2.05, 1e-12);
eq('percent alone', eng.solveParsed('5%'), 0.05);

// ---- Factorials over compound operands --------------------------------------
eq('paren factorial', eng.solveParsed('(2+3)!'), 120);
eq('nested paren factorial', eng.solveParsed('((2+3)+4)!'), 362880);
eng.vars.X = 4;
eq('var factorial', eng.solveParsed('X!'), 24);
eng.vars.X = 0;
eq('neg factorial NaN', isNaN(eng.solveParsed('(-5)!')), true);

// ---- Power chains with unary signs ------------------------------------------
eq('exp chain with sign', eng.solveParsed('2^-3^2'), Math.pow(2, -9), 1e-12);
eq('exp chain neg both', eng.solveParsed('2^-3^-2'), Math.pow(2, -Math.pow(3, -2)), 1e-12);
eq('neg sqrt squared', eng.solveParsed('-√(4)^2'), -4, 1e-12);
eq('neg pow ok', eng.solveParsed('-5^2'), -25);

// ---- Exponential-notation register values ------------------------------------
eng.vars.X = 1e-7;
eq('var exp literal', eng.solveParsed('X'), 1e-7);
eq('var exp in expr', eng.solveParsed('2X'), 2e-7, 1e-21);
eng.vars.X = 1e21;
eq('var exp 21', eng.solveParsed('X'), 1e21);
eng.vars.X = 0;
eng.lastAnswer = 1e-7;
eq('Ans exp literal', eng.solveParsed('Ans'), 1e-7);
eng.lastAnswer = 0;

// ---- Calculus state safety ----------------------------------------------------
eng.vars.X = 42;
eq('derivative', eng.solveParsed('d/dx(X^2, 3)'), 6, 1e-4);
eq('X preserved after d/dx', eng.vars.X, 42);

// ---- HYP / hyp persistence via button flow -------------------------------------
eng.expr = ''; eng.cursor = 0; eng.isHyp = false;
eng.handleKey('HYP');
eq('hyp flag on', eng.isHyp, true);
eng.handleKey('5');
eq('hyp survives digit', eng.isHyp, true);
eng.handleKey('SIN');
eq('hyp makes sinh', eng.expr, '5sinh(');
eq('hyp consumed', eng.isHyp, false);
eng.handleKey('AC');
eq('AC clears hyp', eng.isHyp, false);

// ---- ALPHA M+ inserts variable M, plain M+ accumulates -------------------------
eng.expr = ''; eng.cursor = 0; eng.vars.M = 0;
eng.isAlpha = true; eng.handleKey('M_PLUS'); eng.isAlpha = false;
eq('ALPHA M_PLUS inserts M', eng.expr, 'M');
eq('M vars untouched', eng.vars.M, 0);
eng.currentResult = 7;
eng.handleKey('M_PLUS');
eq('plain M+ adds', eng.vars.M, 7);
eng.isShift = true; eng.handleKey('M_PLUS'); eng.isShift = false;
eq('SHIFT M+ subtracts', eng.vars.M, 0);
eq('toDMS', eng.toDMS(12.5), '12°30’0.0”');
eq('toDMS carry', eng.toDMS(59.99999999), '60°0’0.0”');

// ---- Error paths (must produce errors, not crashes/NaN) ----------------------
eq('empty Ans 0', eng.solveParsed('0'), 0);
eq('div by zero is Infinity', eng.solveParsed('1/0') === Infinity, true, 0);

// ---- Key-flow integration (headless) -----------------------------------------
function keys(...ks) { for (const k of ks) eng.handleKey(k); }

// nCr via button flow: 5 SHIFT ÷ 2 =  → 10
eng.expr = ''; eng.cursor = 0;
keys('5');
eng.isShift = true; eng.handleKey('DIV'); eng.isShift = false;
keys('2');
eq('expr nCr', eng.expr, '5 C 2');
eng.handleKey('EXE');
eq('nCr result', eng.currentResult, 10);
eq('nCr LCD', eng.resElem.textContent, '10');

// STO flow: evaluate 125 then SHIFT RCL ALPHA X stores to X
eng.expr = ''; eng.cursor = 0; eng.currentResult = null; eng.lastAnswer = 0;
keys('1', '2', '5'); eng.handleKey('EXE');
eq('125 result', eng.currentResult, 125);
eng.isShift = true; eng.handleKey('RCL'); eng.isShift = false;
keys('ALPHA'); eng.handleKey('LOG'); // LOG→X under ALPHA
eq('STO X', eng.vars.X, 125);

// RCL flow: recall X into expression
eng.expr = ''; eng.cursor = 0; eng.isRcl = true; eng.isAlpha = true;
eng.handleKey('LOG');
eq('RCL X expr', eng.expr, '125');
eng.isAlpha = false; eng.isRcl = false;

// SOLVE flow
eng.expr = ''; eng.cursor = 0; eng.vars.X = 0;
keys('ALPHA'); eng.handleKey(')'); // ALPHA + ) → X
eng.isAlpha = false;
keys('SQR'); // X²… need minus: SQR gives ²
eq('expr after X²', eng.expr, 'X²');
keys('SUB', '9');
eng.isShift = true; eng.handleKey('CALC'); eng.isShift = false;
eq('SOLVE X²−9', Math.abs(Math.abs(eng.currentResult) - 3) < 1e-6, true);

// SOLVE rejects non-roots and does not pollute X
eng.expr = 'X^2+1'; eng.cursor = eng.expr.length; eng.vars.X = 0;
eng.isShift = true; eng.handleKey('CALC'); eng.isShift = false;
eq('SOLVE X²+1 fails', eng.resElem.textContent, 'Math ERROR');
eq('SOLVE failure resets cur', eng.currentResult, null);
eq('X restored after failed solve', eng.vars.X, 0);

// Division-percent root search must also fail (no root exists)
eng.expr = '1/(X+5)'; eng.cursor = eng.expr.length; eng.vars.X = 0;
eng.isShift = true; eng.handleKey('CALC'); eng.isShift = false;
eq('SOLVE 1/(X+5) fails', eng.resElem.textContent, 'Math ERROR');

// History recall
eq('history has entries', eng.history.length >= 2, true);
eng.handleNav('UP');
const recalled = eng.expr;
eq('history UP recalls', recalled.length > 0, true);
eng.handleNav('AC');

// S⇔D fraction cycle
eng.expr = ''; eng.cursor = 0;
keys('0', 'DOT', '8', '7', '5'); eng.handleKey('EXE');
eq('0.875 result', eng.currentResult, 0.875);
eng.handleKey('SD');
eq('SD fraction', eng.resElem.textContent, '7 ⌟ 8');
eng.handleKey('SD');
if (eng.resElem.textContent.includes('°')) pass++; else { fail++; console.error('FAIL SD DMS:', eng.resElem.textContent); }
eng.handleKey('SD');
eq('SD back to decimal', eng.resElem.textContent, '0.875');

// ENG cycles the displayed engineering exponent without changing the value
eng.currentResult = 123456; eng.engExp = null; eng.resElem.textContent = '123456';
eng.handleKey('ENG');
eq('ENG display', eng.resElem.textContent, '123.456×10^3');
eq('ENG keeps value', eng.currentResult, 123456);
eng.handleKey('ENG');
eq('ENG display 2nd', eng.resElem.textContent, '123456×10^0');
eng.isShift = true; eng.handleKey('ENG'); eng.isShift = false;
eq('ENG shift back', eng.resElem.textContent, '123.456×10^3');
eng.engExp = null;

// ---- Constructor boot + end-to-end EXE smoke test -----------------------------
{
    const boot = new CasioSuperEngine();
    boot.handleKey('3'); boot.handleKey('ADD'); boot.handleKey('4');
    boot.handleKey('EXE');
    eq('constructor boots', boot.currentResult, 7);
    eq('boot result LCD', boot.resElem.textContent, '7');
    boot.handleKey('AC');
    eq('AC resets display', boot.resElem.textContent, '0');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
