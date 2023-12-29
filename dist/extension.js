/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(__webpack_require__(1));
let decoration = vscode.window.createTextEditorDecorationType({});
function activate(context) {
    let disposable = vscode.commands.registerCommand('vsc-extension-version-tags.highlight-tags', () => {
        let activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }
        const text = activeEditor.document.getText();
        const tagRegEx = /\{%\s*(ifversion|elsif|else|endif)\s+([^%]*)%\}/g;
        const versionTags = [];
        let ifversionCounter = 0, currentIfVersionId = 0, currentLevel = 0;
        let match;
        while (match = tagRegEx.exec(text)) {
            const currentTag = match[1];
            if (currentTag === "ifversion") {
                ifversionCounter++;
                currentLevel++;
                currentIfVersionId = ifversionCounter;
            }
            else if (currentTag === "endif") {
                currentLevel--;
            }
            const openingBracketPos = match.index;
            const currentTagStart = activeEditor.document.positionAt(openingBracketPos);
            const closingBracketPos = match.index + match[0].length;
            const currentTagEnd = activeEditor.document.positionAt(closingBracketPos);
            versionTags.push({
                ifversionId: currentIfVersionId,
                level: currentLevel,
                tag: currentTag,
                content: match[2],
                positionVersionTagStart: currentTagStart,
                positionVersionTagEnd: currentTagEnd
            });
            if (currentTag === "endif") {
                currentIfVersionId--;
            }
        }
        let cursorPos = activeEditor.selection.active;
        let level = 0;
        let versionArray = [];
        let versionString = "";
        currentIfVersionId = 0;
        for (let item of versionTags) {
            if (cursorPos.line < item.positionVersionTagEnd.line) {
                break;
            }
            ;
            if (cursorPos.line === item.positionVersionTagEnd.line && cursorPos.character < item.positionVersionTagEnd.character) {
                break;
            }
            ;
            currentIfVersionId = item.ifversionId;
            if (item.tag === "ifversion") {
                versionArray[level] = item.content;
                versionString = item.content;
                level++;
            }
            else if (item.tag === "elsif") {
                versionArray[level - 1] = item.content;
                if (level > 1) {
                    versionString = versionString + item.content;
                }
            }
            else if (item.tag === "else") {
                versionArray[level - 1] = "zzzzzNOT ";
                versionString = versionString + " NOTxxxxx " + item.content;
            }
            else {
                currentIfVersionId--;
                versionArray.pop();
                level--;
            }
        }
        let message = "";
        let lineNum = cursorPos.line + 1;
        let charNum = cursorPos.character + 1;
        let positionString = `at the cursor position (line ${lineNum}, character ${charNum})`;
        const ranges = [];
        versionTags
            .filter(item => item.ifversionId === currentIfVersionId)
            .forEach(item => {
            const range = new vscode.Range(item.positionVersionTagStart, item.positionVersionTagEnd);
            ranges.push(range);
        });
        decoration.dispose();
        decoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'red',
            color: 'white'
        });
        if (activeEditor) {
            activeEditor.setDecorations(decoration, ranges);
        }
        versionArray = versionArray.map(item => item.trim());
        if (versionArray.length === 0) {
            message = "There is no inline versioning " + positionString + ".";
        }
        else {
            message = "The inline versioning " + positionString + " is: " + versionArray.join(" AND ");
        }
        vscode.window.showInformationMessage(message, "OK");
        vscode.window.showInformationMessage("versionString = " + versionString);
    });
    context.subscriptions.push(disposable);
    let removeDecorationsDisposable = vscode.commands.registerCommand('vsc-extension-version-tags.removeDecorations', () => {
        decoration.dispose();
        decoration = vscode.window.createTextEditorDecorationType({});
    });
    context.subscriptions.push(removeDecorationsDisposable);
    let removeDecorationsOnCursorMove = vscode.window.onDidChangeTextEditorSelection(() => {
        decoration.dispose();
        decoration = vscode.window.createTextEditorDecorationType({});
    });
    context.subscriptions.push(removeDecorationsOnCursorMove);
}
exports.activate = activate;
function deactivate() {
    decoration.dispose();
}
exports.deactivate = deactivate;


/***/ }),
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__(0);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=extension.js.map