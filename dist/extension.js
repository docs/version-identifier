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
exports.activate = void 0;
const vscode = __importStar(__webpack_require__(1));
let decoration = vscode.window.createTextEditorDecorationType({});
function activate(context) {
    let disposableModal = vscode.commands.registerCommand('extension.runExtensionModal', () => {
        runExtension(true);
    });
    let disposableToast = vscode.commands.registerCommand('extension.runExtensionToast', () => {
        runExtension(false);
    });
    context.subscriptions.push(disposableModal, disposableToast);
}
exports.activate = activate;
function runExtension(isModal) {
    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }
    const text = activeEditor.document.getText();
    const cursorPosition = activeEditor.selection.active;
    const positionString = " at the cursor position (line " + (cursorPosition.line + 1) +
        ", character " + (cursorPosition.character + 1) + ") ";
    let versionTags = [];
    let versionDescription = [];
    let currentTagSpan = [];
    let tagSetID = [];
    let beforeCursor = true;
    let tagCounter = 0;
    let nestingLevel = -1;
    let elsedVersions = "";
    const tagRegEx = /\{%-?\s*(ifversion|elsif|else|endif)\s+([^%]*)%\}/g;
    let match;
    while (match = tagRegEx.exec(text)) {
        tagCounter++;
        const openingBracketPos = match.index;
        const currentTagStart = activeEditor.document.positionAt(openingBracketPos);
        const closingBracketPos = match.index + match[0].length;
        const currentTagEnd = activeEditor.document.positionAt(closingBracketPos);
        if (beforeCursor && cursorPosition.isBefore(currentTagEnd)) {
            beforeCursor = false;
        }
        if (match[1] === "ifversion") {
            nestingLevel++;
            tagSetID[nestingLevel] = tagCounter;
            if (beforeCursor) {
                currentTagSpan[nestingLevel] = tagSetID[nestingLevel];
                if (nestingLevel > 0) {
                    versionDescription[nestingLevel] = "AND " + match[2];
                    elsedVersions = "AND NOT " + match[2];
                }
                else {
                    versionDescription[nestingLevel] = match[2];
                    elsedVersions = "NOT " + match[2];
                }
            }
        }
        else if (match[1] === "elsif" && beforeCursor) {
            currentTagSpan[nestingLevel] = tagSetID[nestingLevel];
            if (nestingLevel > 0) {
                versionDescription[nestingLevel] = "AND ";
            }
            versionDescription[nestingLevel] += match[2];
            elsedVersions += "AND NOT " + match[2];
        }
        else if (match[1] === "else" && beforeCursor) {
            currentTagSpan[nestingLevel] = tagSetID[nestingLevel];
            if (nestingLevel > 0) {
                versionDescription[nestingLevel] = "AND ";
            }
            versionDescription[nestingLevel] = elsedVersions;
        }
        else if (match[1] === "endif" && beforeCursor) {
            elsedVersions = "";
            versionDescription.pop();
            currentTagSpan.pop();
            nestingLevel--;
        }
        versionTags.push({
            tagID: tagCounter,
            tagSet: tagSetID[nestingLevel],
            positionVersionTagStart: currentTagStart,
            positionVersionTagEnd: currentTagEnd
        });
    }
    displayVersionMessage(isModal, versionDescription, elsedVersions);
}
function displayVersionMessage(isModal, versionDescription, elsedVersions = "") {
    var _a, _b;
    let message = "";
    for (let description of versionDescription) {
        message += description + "\n";
    }
    let lineNumber = parseInt(((_b = (_a = new Error().stack) === null || _a === void 0 ? void 0 : _a.split('\n')[1].match(/:(\d+):\d+\)$/)) === null || _b === void 0 ? void 0 : _b[1]) || '') + 1;
    console.log("\n-----------\nOn line " + lineNumber + ":" +
        "\nThis is where I am now." +
        "\nelsedVersions: \n" + elsedVersions +
        "\n\nversionDescription: \n============\n" + message + "============");
    if (isModal) {
        vscode.window.showInformationMessage(message, { modal: true });
    }
    else {
        vscode.window.showInformationMessage(message, "OK");
    }
}


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