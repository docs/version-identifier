import * as vscode from 'vscode';

// --------------------------------
// activate() function
// --------------------------------
export function activate(context: vscode.ExtensionContext) {
  let disposableModal = vscode.commands.registerCommand('extension.runExtensionModal', () => {
    runExtension(true);
  });

  let disposableToast = vscode.commands.registerCommand('extension.runExtensionToast', () => {
    runExtension(false);
  });

  context.subscriptions.push(disposableModal, disposableToast);

  // Register a command to remove the decorations.
  // The command is defined in package.json and is bound to the escape key
  //let removeDecorationsDisposable = vscode.commands.registerCommand(
  //        'extension.removeDecorations', () => {
  //    decoration.dispose();  // Remove any text decorations
  //    decoration = vscode.window.createTextEditorDecorationType({});
  //});

  //context.subscriptions.push(removeDecorationsDisposable);

  // Listen for selection changes in the editor
  //let removeDecorationsOnCursorMove =
  //        vscode.window.onDidChangeTextEditorSelection(() => {
  //    decoration.dispose();  // Remove any text decorations
  //    decoration = vscode.window.createTextEditorDecorationType({});
  //});

  //context.subscriptions.push(removeDecorationsOnCursorMove);
}

// --------------------------------
// runExtension() function
// --------------------------------
function runExtension(isModal: boolean) {
    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }
    // Get the entire text of the active editor
    const text = activeEditor.document.getText();

    // This regex matches text that starts either
    // with `{% ifversion ` or `{% elsif `
    // and ends with ` %}`.
    // It captures the tag name (ifversion or elsif) in match[1]
    // and the content between the tag name and the closing bracket
    // (preceded by one of more spaces) in match[2].
    const tagRegEx = /\{%-?\s*(ifversion|elsif|else|endif)\s+([^%]*)%\}/g;

    let match: RegExpExecArray | null;
    while (match = tagRegEx.exec(text)) {
        // Search through the entire text for matches of the above regex
        // and capture details about each matched tag in an element (object) in the versionTags array:

        //TODO: ADD STUFF HERE
    }

    // Identify and highlight the version tags for the current cursor position:
    //ORIGINALLY:
    //highlightVersionTags(activeEditor, versionTags, currentIfVersionId, level);
    highlightVersionTags();

    // Prepare and display the popup message with versioning information
    //ORIGINALLY:
    //displayVersionMessage(isModal, versionArray, positionString);
    displayVersionMessage(isModal);

}  // End of runExtension() function



// --------------------------------
// highlightVersionTags() function
// --------------------------------
// This function is called once each time the extension is run, from the runExtension() function.
// Apply decorations (i.e. text highlighting in the editor) to version tags with the tagIfVersionId passed to this function
// (i.e. tags that have the same tagIfVersionId as the ID of the ifversion tag at the current cursor position).

//ORIGINALLY:
//function highlightVersionTags(
//    activeEditor: vscode.TextEditor | undefined,
//    versionTags: VersionTag[],
//    tagIfVersionId: number,
//    level: number

function highlightVersionTags() {

    // Create an array to hold the ranges of text to be highlighted
    //const ranges: vscode.Range[] = [];

    // For debugging purposes only TODO: DELETE THIS:
    let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
    console.log("\n-----------\nOn line " + lineNumber + ":\nThis is where I am now.");

}


// --------------------------------
// displayVersionMessage() function
// --------------------------------
//ORIGINALLY:
//function displayVersionMessage(isModal: boolean, versionArray: string[], positionString: string) {

function displayVersionMessage(isModal: boolean) {
    // Prepare and display the popup message with versioning information
    let message = "JUST FOR TESTING";

    if (isModal) {
        vscode.window.showInformationMessage(
            message,
            { modal: true } // Make the popup modal rather than a "toast" notification
        );
    } else {
        vscode.window.showInformationMessage(
            message,
            "OK" // Show a "toast" notification with an "OK" button
        );
    }
}


// --------------------------------
// deactivate() function
// --------------------------------
//export function deactivate() {
//    decoration.dispose();
//}
