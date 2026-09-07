(function (global) {
  "use strict";

  function History(cloneFn, maxSteps) {
    this.cloneFn = cloneFn;
    this.maxSteps = maxSteps || 50;
    this.undoStack = [];
    this.redoStack = [];
  }

  History.prototype.snapshot = function (state) {
    this.undoStack.push(this.cloneFn(state));
    if (this.undoStack.length > this.maxSteps) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  };

  History.prototype.canUndo = function () {
    return this.undoStack.length > 0;
  };

  History.prototype.canRedo = function () {
    return this.redoStack.length > 0;
  };

  History.prototype.undo = function (current) {
    if (!this.canUndo()) return null;
    this.redoStack.push(this.cloneFn(current));
    return this.undoStack.pop();
  };

  History.prototype.redo = function (current) {
    if (!this.canRedo()) return null;
    this.undoStack.push(this.cloneFn(current));
    return this.redoStack.pop();
  };

  History.prototype.reset = function () {
    this.undoStack = [];
    this.redoStack = [];
  };

  global.VectorHistory = History;
})(window);
