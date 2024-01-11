import * as vscode from 'vscode';

// Create a decorator type that we'll use to highlight the version tags.
// We need to declare it here, outside of the activate() function,
// so that we can use dispose() to remove any decorations that were applied
// in a previous run of the extension.
let decoration = vscode.window.createTextEditorDecorationType({});

// The VersionTag interface defines the structure of the objects that will be used in the versionTags array.
// Each element of the versionTags array will be an object that describes a single Liquid version tag,
// and will contain the following properties:
interface VersionTag {
  tagID: number;    // The unique ID of the version tag
  tagSet: number;   // The ID of the tag set to which the tag belongs
  positionVersionTagStart: vscode.Position; // The start position of the version tag
  positionVersionTagEnd: vscode.Position;   // The end position of the version tag
}

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

    const cursorPosition = activeEditor.selection.active;
    const positionString = " at the cursor position (line " + (cursorPosition.line + 1) +
        ", character " + (cursorPosition.character + 1) + ") ";

    // Define the arrays we're going to iteratively populate in the parsing loop:
    let versionTags: VersionTag[] = [];
    let versionDescription: string[] = [];
    let elsedVersions: string[] = [];
    let currentTagSpan: number[] = [];
    let tagSetID: number[] = [];

    let beforeCursor: Boolean = true; // Set to false when we reach the cursor position during tag parsing
    let tagCounter = 0; // This will be used to assign a unique ID to each ifversion tag
    let nestingLevel = -1; // Increment each time we encounter an ifversion tag, decrement at each endif tag

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

        tagCounter++; // Increment the currentTagSpan counter for each tag we encounter

        // Find the start and end positions of the ifversion tag.
        // match.index is the number of the first character of the match
        // within the entire searched string (i.e. the entire Markdown file)
        const openingBracketPos = match.index;
        const currentTagStart = activeEditor.document.positionAt(openingBracketPos);
        // match[0] is the matched text (e.g. `{% ifversion ghes %}`).
        // This gives us the position of the character after the closing bracket
        const closingBracketPos = match.index + match[0].length;
        const currentTagEnd = activeEditor.document.positionAt(closingBracketPos);

        // If we've reached the cursor position, set beforeCursor to false:
        if (beforeCursor && cursorPosition.isBefore(currentTagEnd)) {
            beforeCursor = false;
        }

        // Process each type of tag.
        // match[1] from the regular expression is the tag name (ifversion, elsif, else, or endif)
        if (match[1] === "ifversion") {
            nestingLevel++;      // Increment the nesting level for each ifversion tag inside an ifversion block
                                 // Outside of an ifversion block, nestingLevel will be -1
                                 // In an unnested ifversion block, nestingLevel will be 0

            tagSetID[nestingLevel] = tagCounter; // Set the tagSetID for this ifversion tag

            if (beforeCursor) {
                currentTagSpan[nestingLevel] = tagSetID[nestingLevel]; // The cursor may be within this tag
                if (nestingLevel >0) {
                    versionDescription[nestingLevel] = "AND " + match[2];
                    elsedVersions[nestingLevel] = "AND NOT " + match[2]; // Initialize the list of excluded versions
                }
                else {
                    versionDescription[nestingLevel] = match[2];
                    elsedVersions[nestingLevel] = "NOT " + match[2];
                }
            }

            // For debugging purposes only TODO: DELETE THIS:
            // let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
            // console.log("\n-----------\nOn line " + lineNumber +
            //     ":\ncursorPosition: " + cursorPosition.line + ", " + cursorPosition.character +
            //     "\ntagCounter: " + tagCounter +
            //     "\nnestingLevel: " + nestingLevel +
            //     "\ncurrentTagStart: " + currentTagStart.line + ", " + currentTagStart.character +
            //     "\ncurrentTagEnd: " + currentTagEnd.line + ", " + currentTagEnd.character
            // );

        }
        else if (match[1] === "elsif" && beforeCursor) {
            currentTagSpan[nestingLevel] = tagSetID[nestingLevel]; // The cursor may be within this tag
            if (nestingLevel >0) {
                versionDescription[nestingLevel] = "AND ";
            }
            versionDescription[nestingLevel] += match[2];
            elsedVersions[nestingLevel] += "AND NOT " + match[2];
        }
        else if (match[1] === "else" && beforeCursor) {
            currentTagSpan[nestingLevel] = tagSetID[nestingLevel]; // The cursor may be within this tag
            if (nestingLevel >0) {
                versionDescription[nestingLevel] = "AND ";
            }
            versionDescription[nestingLevel] = elsedVersions[nestingLevel];
        }
        else if (match[1] === "endif" && beforeCursor) {
            elsedVersions.pop();      // Remove the list of excluded versions for the tag set we're leaving
            versionDescription.pop(); // Remove the version description for the tag set
            currentTagSpan.pop();     // Remove the tag span for the tag set
            nestingLevel--;           // Decrement the nesting level
        }


        // For each tag:
        // Add the details of the current version tag to the versionTags array.
        // Each element of the array is an object containing the following properties:
        versionTags.push({
            tagID: tagCounter,
            tagSet: tagSetID[nestingLevel],
            positionVersionTagStart: currentTagStart,
            positionVersionTagEnd: currentTagEnd
        });

        // For debugging purposes only TODO: DELETE THIS:
        // let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
        // console.log("\n================================\nOn line " + lineNumber +
        //     ":\ncursorPosition: " + cursorPosition.line + ", " + cursorPosition.character +
        //     ":\nbeforeCursor: " + beforeCursor +
        //     "\ntagCounter: " + tagCounter +
        //     "\nnestingLevel: " + nestingLevel +
        //     "\ncurrentTagStart: " + currentTagStart.line + ", " + currentTagStart.character +
        //     "\ncurrentTagEnd: " + currentTagEnd.line + ", " + currentTagEnd.character +
        //     "\nversionTags.length: " + versionTags.length
        // );


        // For debugging purposes only TODO: DELETE THIS:
        // lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
        // //console.log("\n-----------\nOn line " + lineNumber + "\nversionTags:");
        // let lastTag = versionTags[versionTags.length - 1];
        // console.log("tagID: " + lastTag.tagID);
        // console.log("tagSet: " + lastTag.tagSet);
        // console.log("positionVersionTagStart: " + JSON.stringify(lastTag.positionVersionTagStart));
        // console.log("positionVersionTagEnd: " + JSON.stringify(lastTag.positionVersionTagEnd));
        // console.log("match[1]: " + match[1]);
        // console.log("versionDescription[" + (tagCounter -1) + "]: " + versionDescription[tagCounter -1]);

    } // End of the tag parsing loop



        // Prepare and display the popup message with versioning information
        // let message = "";
        // versionArray = versionArray.map(tag => tag.trim());  // Remove leading and trailing spaces
        // if (versionArray.length === 0) {
        //     message = "There is no inline versioning " + positionString + ".";
        // }
        // else {
        //     message = "The inline versioning " + positionString + " is:\n\n" + versionArray.join("\nAND ");
        // }

        // if (isModal) {
        //     vscode.window.showInformationMessage(
        //         message,
        //         { modal: true } // Make the popup modal rather than a "toast" notification
        //     );
        // } else {
        //     vscode.window.showInformationMessage(
        //         message,
        //         "OK" // Show a "toast" notification with an "OK" button
        //     );
        // }


    console.log("\n~~~~~~~~~~~~\nnestingLevel: " + nestingLevel + "\nelseVersions: " + elsedVersions);


    // Identify and highlight the version tags for the current cursor position:
    //ORIGINALLY:
    //highlightVersionTags(activeEditor, versionTags, currentIfVersionId, level);

    // Prepare and display the popup message with versioning information
    //ORIGINALLY:
    //displayVersionMessage(isModal, versionArray, positionString);
    displayVersionMessage(isModal, versionDescription, elsedVersions[nestingLevel+1]);

}  // End of runExtension() function



// --------------------------------
// displayVersionMessage() function
// --------------------------------
function displayVersionMessage(isModal: Boolean, versionDescription: string[], tempElsedVersionsString: string = "") {

    // Create an array to hold the ranges of text to be highlighted
    //const ranges: vscode.Range[] = [];

    // TODO: REMOVE THIS DEBUGGING CODE:
    let message = "";
    for (let description of versionDescription) {
        message += description + "\n";
    }


    // For debugging purposes only TODO: DELETE THIS:
    let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
    console.log("\n-----------\nOn line " + lineNumber + ":" +
            "\nThis is where I am now." +
            "\ntempElsedVersionsString: \n" + tempElsedVersionsString +
            "\n\nversionDescription: \n============\n" + message + "============"
        );

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
