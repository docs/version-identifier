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

// Create an array of objects, each of which contains a pair of colors.
// We'll use this to highlight the tags of each tag set at a particular version nesting level
// in a different color.
const colorPairs = [
    { backgroundColor: 'red', color: 'white' },
    { backgroundColor: 'blue', color: 'yellow' },
    { backgroundColor: 'green', color: 'black' }
];

// --------------------------------
// activate() function
// --------------------------------
export function activate(context: vscode.ExtensionContext) {

    // Register a command to run the extension, using a modal dialog box for the version message.
    let disposableModal = vscode.commands.registerCommand('extension.runExtensionModal', () => {
    runExtension(true);
    });

    // Register a command to run the extension, using a "toast" popup for the version message.
    let disposableToast = vscode.commands.registerCommand('extension.runExtensionToast', () => {
    runExtension(false);
    });

    // Register a command to remove the decorations.
    // The command is defined in package.json and is bound to the escape key
    let removeDecorationsDisposable = vscode.commands.registerCommand(
            'extension.removeDecorations', () => {
        decoration.dispose();  // Remove any text decorations
        decoration = vscode.window.createTextEditorDecorationType({});
    });

    // Listen for selection changes in the editor
    let removeDecorationsOnCursorMove =
            vscode.window.onDidChangeTextEditorSelection(() => {
        decoration.dispose();  // Remove any text decorations
        decoration = vscode.window.createTextEditorDecorationType({});
    });

    context.subscriptions.push(disposableModal, disposableToast, removeDecorationsDisposable, removeDecorationsOnCursorMove);
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

    const cursorPosition: vscode.Position = activeEditor.selection.active;

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
                currentTagSpan[nestingLevel] = tagCounter; // The cursor may be within this tag
                if (nestingLevel >0) {
                    versionDescription[nestingLevel] = "AND " + match[2];
                    elsedVersions[nestingLevel] = "AND NOT " + match[2]; // Initialize the list of excluded versions
                }
                else {
                    versionDescription[nestingLevel] = match[2];
                    elsedVersions[nestingLevel] = "NOT " + match[2];
                }
            }
        }
        else if (match[1] === "elsif" && beforeCursor) {
            currentTagSpan[nestingLevel] = tagCounter; // The cursor may be within this tag
            if (nestingLevel >0) {
                versionDescription[nestingLevel] = "AND ";
            }
            versionDescription[nestingLevel] += match[2];
            elsedVersions[nestingLevel] += "AND NOT " + match[2];
        }
        else if (match[1] === "else" && beforeCursor) {
            currentTagSpan[nestingLevel] = tagCounter; // The cursor may be within this tag
            if (nestingLevel >0) {
                versionDescription[nestingLevel] = "AND ";
            }
            versionDescription[nestingLevel] = elsedVersions[nestingLevel];
        }
        else if (match[1] === "endif" && beforeCursor) {
            elsedVersions.pop();      // Remove the list of excluded versions for the tag set we're leaving
            versionDescription.pop(); // Remove the version description for the tag set
            currentTagSpan.pop();     // Remove the tag span for the tag set
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
        // At every endif tag in the whole file:
        if (match[1] === "endif") {
            nestingLevel--;   // Step back out of an ifversion tag set
        }
    } // End of the tag parsing loop

    // If there is any versioning at the cursor position:
    if (currentTagSpan.length > 0) {
        // Identify and highlight the version tags for the current cursor position:
        highlightVersionTags(activeEditor, versionTags, currentTagSpan);
    }

    // Prepare and display the message with versioning information:
    displayVersionMessage(isModal, cursorPosition, versionDescription);

}  // End of runExtension() function


// --------------------------------
// highlightVersionTags() function
// --------------------------------
function highlightVersionTags(
    activeEditor: vscode.TextEditor | undefined,
    versionTags: VersionTag[],
    currentTagSpan: number[]
) {
    // Iterate backwards through the currentTagSpan array, starting with the last element in the array:
    for (let elementNumber = currentTagSpan.length - 1; elementNumber >= 0; elementNumber--) {

        // Use the tag span ID to get the tag object for that tag
        // from the versionTags array:
        let tagObject = versionTags.find(tag => tag?.tagID === currentTagSpan[elementNumber]);

        // From this tag object, get its tag set ID:
        let currentTagSetID = tagObject?.tagSet;

        // Filter the versionTags array,
        // to find all of the tag objects whose tag set
        // matches the one we've just found:
        let matchingTags = versionTags.filter(tag => tag.tagSet === currentTagSetID);

        // Fetch one pair of colors from the colorPairs array declared at the top of this file.
        // The modulo operator (%) ensures that if elementNumber is greater than the number of color pairs,
        // the colors will cycle through the defined pairs.
        let colors = colorPairs[elementNumber % colorPairs.length];

        // Create a new decoration for this color pair
        let decoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: colors.backgroundColor,
            color: colors.color
        });

        matchingTags.forEach(tag => {
            // Create a vscode.Range object for the tag:
            const range = new vscode.Range(
                tag.positionVersionTagStart,
                tag.positionVersionTagEnd
            );

            // Apply the decoration to this range
            if (activeEditor) {
                activeEditor.setDecorations(decoration, [range]);
            }
        });
    }
} // End of highlightVersionTags() function

// --------------------------------
// displayVersionMessage() function
// --------------------------------
function displayVersionMessage(isModal: Boolean, cursorPosition: vscode.Position, versionDescription: string[]) {

    // Note: we add +1 to the line and character numbers because they are zero-based:
    const positionString = ` at the cursor position (line ${(cursorPosition.line + 1)}, character ${(cursorPosition.character + 1)} ) `;
    let message = "";

    if (versionDescription.length === 0) {
        message = "There is no inline versioning " + positionString + ".";
    }
    else {
        message = "The inline versioning " + positionString + " is:\n\n";
        for (let description of versionDescription) {
            message += description + "\n";
        }
    }

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
} // End of displayVersionMessage() function

// --------------------------------
// deactivate() function
// --------------------------------
export function deactivate() {
   decoration.dispose();
}
