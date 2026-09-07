/* Oak bytecode compiler + VM with single-step execution */

const OakVM = (function () {
  const Op = {
    LOAD_CONST: "LOAD_CONST",
    LOAD_VAR: "LOAD_VAR",
    STORE_VAR: "STORE_VAR",
    ADD: "ADD",
    SUB: "SUB",
    MUL: "MUL",
    DIV: "DIV",
    EQ: "EQ",
    NE: "NE",
    LT: "LT",
    LE: "LE",
    GT: "GT",
    GE: "GE",
    NEG: "NEG",
    PRINT: "PRINT",
    JMP: "JMP",
    JMP_IF_FALSE: "JMP_IF_FALSE",
    HALT: "HALT",
  };

  class CompileError extends Error {
    constructor(message) {
      super(message);
      this.name = "CompileError";
    }
  }

  class VMError extends Error {
    constructor(message) {
      super(message);
      this.name = "VMError";
    }
  }

  function compile(ast) {
    const constants = [];
    const varNames = [];
    const code = [];

    function constIndex(value) {
      let idx = constants.indexOf(value);
      if (idx === -1) {
        idx = constants.length;
        constants.push(value);
      }
      return idx;
    }

    function varIndex(name) {
      let idx = varNames.indexOf(name);
      if (idx === -1) {
        idx = varNames.length;
        varNames.push(name);
      }
      return idx;
    }

    function emit(op, arg) {
      code.push({ op, arg: arg ?? null });
      return code.length - 1;
    }

    function patch(index, arg) {
      code[index].arg = arg;
    }

    function compileExpr(node) {
      switch (node.kind) {
        case "Number":
          emit(Op.LOAD_CONST, constIndex(node.value));
          break;
        case "Var":
          emit(Op.LOAD_VAR, varIndex(node.name));
          break;
        case "Unary":
          compileExpr(node.operand);
          if (node.op === "-") emit(Op.NEG);
          else throw new CompileError(`Unknown unary op '${node.op}'`);
          break;
        case "Binary":
          compileExpr(node.left);
          compileExpr(node.right);
          switch (node.op) {
            case "+":
              emit(Op.ADD);
              break;
            case "-":
              emit(Op.SUB);
              break;
            case "*":
              emit(Op.MUL);
              break;
            case "/":
              emit(Op.DIV);
              break;
            case "==":
              emit(Op.EQ);
              break;
            case "!=":
              emit(Op.NE);
              break;
            case "<":
              emit(Op.LT);
              break;
            case "<=":
              emit(Op.LE);
              break;
            case ">":
              emit(Op.GT);
              break;
            case ">=":
              emit(Op.GE);
              break;
            default:
              throw new CompileError(`Unknown binary op '${node.op}'`);
          }
          break;
        default:
          throw new CompileError(`Cannot compile expression kind '${node.kind}'`);
      }
    }

    function compileStmt(node) {
      switch (node.kind) {
        case "Let":
          compileExpr(node.value);
          emit(Op.STORE_VAR, varIndex(node.name));
          break;
        case "Assign":
          compileExpr(node.value);
          emit(Op.STORE_VAR, varIndex(node.name));
          break;
        case "Print":
          compileExpr(node.value);
          emit(Op.PRINT);
          break;
        case "Block":
          for (const stmt of node.body) compileStmt(stmt);
          break;
        case "If": {
          compileExpr(node.test);
          const jumpFalse = emit(Op.JMP_IF_FALSE, 0);
          compileStmt(node.consequent);
          if (node.alternate) {
            const jumpEnd = emit(Op.JMP, 0);
            patch(jumpFalse, code.length - jumpFalse);
            compileStmt(node.alternate);
            patch(jumpEnd, code.length - jumpEnd);
          } else {
            patch(jumpFalse, code.length - jumpFalse);
          }
          break;
        }
        case "While": {
          const loopStart = code.length;
          compileExpr(node.test);
          const jumpFalse = emit(Op.JMP_IF_FALSE, 0);
          compileStmt(node.body);
          emit(Op.JMP, loopStart - code.length);
          patch(jumpFalse, code.length - jumpFalse);
          break;
        }
        default:
          throw new CompileError(`Cannot compile statement kind '${node.kind}'`);
      }
    }

    if (ast.kind !== "Program") throw new CompileError("Expected Program node");
    for (const stmt of ast.body) compileStmt(stmt);
    emit(Op.HALT);

    return { code, constants, varNames };
  }

  function formatBytecode(program) {
    return program.code.map((instr, i) => {
      const arg =
        instr.arg === null || instr.arg === undefined
          ? ""
          : typeof instr.arg === "number" && instr.op.includes("VAR")
            ? ` ${program.varNames[instr.arg] ?? instr.arg}`
            : typeof instr.arg === "number" && instr.op === "LOAD_CONST"
              ? ` ${program.constants[instr.arg]}`
              : ` ${instr.arg}`;
      return { index: i, text: `${instr.op}${arg}` };
    });
  }

  function createState(program) {
    return {
      program,
      ip: 0,
      stack: [],
      vars: new Array(program.varNames.length).fill(0),
      output: [],
      halted: false,
      error: null,
    };
  }

  function truthy(value) {
    return value !== 0;
  }

  function runStep(state) {
    if (state.halted || state.error) return state;

    const { program, ip } = state;
    if (ip >= program.code.length) {
      state.halted = true;
      return state;
    }

    const instr = program.code[ip];

    try {
      switch (instr.op) {
        case Op.LOAD_CONST:
          state.stack.push(program.constants[instr.arg]);
          break;
        case Op.LOAD_VAR:
          state.stack.push(state.vars[instr.arg]);
          break;
        case Op.STORE_VAR: {
          const val = state.stack.pop();
          if (val === undefined) throw new VMError("Stack underflow on STORE_VAR");
          state.vars[instr.arg] = val;
          break;
        }
        case Op.ADD:
        case Op.SUB:
        case Op.MUL:
        case Op.DIV: {
          const b = state.stack.pop();
          const a = state.stack.pop();
          if (a === undefined || b === undefined) throw new VMError("Stack underflow");
          if (instr.op === Op.ADD) state.stack.push(a + b);
          else if (instr.op === Op.SUB) state.stack.push(a - b);
          else if (instr.op === Op.MUL) state.stack.push(a * b);
          else {
            if (b === 0) throw new VMError("Division by zero");
            state.stack.push(a / b);
          }
          break;
        }
        case Op.EQ:
        case Op.NE:
        case Op.LT:
        case Op.LE:
        case Op.GT:
        case Op.GE: {
          const b = state.stack.pop();
          const a = state.stack.pop();
          if (a === undefined || b === undefined) throw new VMError("Stack underflow");
          let result = 0;
          if (instr.op === Op.EQ) result = a === b ? 1 : 0;
          else if (instr.op === Op.NE) result = a !== b ? 1 : 0;
          else if (instr.op === Op.LT) result = a < b ? 1 : 0;
          else if (instr.op === Op.LE) result = a <= b ? 1 : 0;
          else if (instr.op === Op.GT) result = a > b ? 1 : 0;
          else if (instr.op === Op.GE) result = a >= b ? 1 : 0;
          state.stack.push(result);
          break;
        }
        case Op.NEG: {
          const v = state.stack.pop();
          if (v === undefined) throw new VMError("Stack underflow on NEG");
          state.stack.push(-v);
          break;
        }
        case Op.PRINT: {
          const v = state.stack.pop();
          if (v === undefined) throw new VMError("Stack underflow on PRINT");
          state.output.push(String(v));
          break;
        }
        case Op.JMP:
          state.ip += instr.arg;
          return state;
        case Op.JMP_IF_FALSE: {
          const v = state.stack.pop();
          if (v === undefined) throw new VMError("Stack underflow on JMP_IF_FALSE");
          if (!truthy(v)) {
            state.ip += instr.arg;
            return state;
          }
          break;
        }
        case Op.HALT:
          state.halted = true;
          return state;
        default:
          throw new VMError(`Unknown opcode '${instr.op}'`);
      }
    } catch (err) {
      state.error = err.message;
      state.halted = true;
      return state;
    }

    state.ip++;
    return state;
  }

  function runAll(state) {
    while (!state.halted && !state.error) runStep(state);
    return state;
  }

  return {
    Op,
    compile,
    formatBytecode,
    createState,
    runStep,
    runAll,
    CompileError,
    VMError,
  };
})();
