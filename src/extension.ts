import * as vscode from 'vscode';

// The VersionTag interface defines the structure of the objects that will be used in the versionTags array.
// Each element of the versionTags array will be an object that describes a single Liquid version tag,
// and will contain the following properties:
interface VersionTag {
    tagID: number;    // The unique ID of the version tag
    tagSet: number;   // The ID of the tag set to which the tag belongs
    positionVersionTagStart: vscode.Position; // The start position of the version tag
    positionVersionTagEnd: vscode.Position;   // The end position of the version tag
}

// Create an array to store all of the text decorations that we apply to the editor,
// so that we can remove them all later in a single operation.
// We need to declare it here, outside of the activate() function,
// so that we can it in the deactivate() function
// at the end of this file.
let decorationDefinitionsArray: vscode.TextEditorDecorationType[] = [];


// --------------------------------
// activate() function
// --------------------------------
export function activate(context: vscode.ExtensionContext) {

    // Register a command to run the extension, using a modal dialog box for the version message.
    let disposableModal = vscode.commands.registerCommand('version-identifier.runExtensionModal', () => {
        runExtension(true);
    });

    // Register a command to run the extension, using a "toast" popup for the version message.
    let disposableToast = vscode.commands.registerCommand('version-identifier.runExtensionToast', () => {
        runExtension(false);
    });

    // Register a command to remove the decorations.
    // The command is defined in package.json and is bound to the escape key
    let removeDecorationsDisposable = vscode.commands.registerCommand(
            'version-identifier.removeDecorations', () => {
        // Remove all of the decorations that have been applied to the editor:
        decorationDefinitionsArray.forEach(decoration => decoration.dispose());
        decorationDefinitionsArray = []; // Clear the array
    });

    // Listen for selection changes in the editor
    let removeDecorationsOnCursorMove =
    vscode.window.onDidChangeTextEditorSelection(() => {
        decorationDefinitionsArray.forEach(decoration => decoration.dispose());
        decorationDefinitionsArray = [];
    });

    context.subscriptions.push(
        disposableModal,
        disposableToast,
        removeDecorationsDisposable,
        removeDecorationsOnCursorMove
    );
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

    let cursorIsAfterTagStart: Boolean = true; // Set to false when cursor is before the start of the tag during parsing
    let cursorIsAfterTagEnd: Boolean = true; // Set to false when cursor is before the end of the tag during parsing
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
        // Search through the entire text for matches of the above regex.
        // Each loop of this while loop is a match (i.e. a version tag).
        // For each tag, capture details about the tag in the versionTags array
        // and store collate version text in the versionDescription array.

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

        // If the cursor position is at or before the start of this tag, set cursorIsAfterTagStart to false.
        // Note: currentTagStart.translate({ characterDelta: 1 }) adds +1 to the character position.
        // We need to do this because we want to trigger `false` if the cursor is at the start of the tag
        // (i.e. the cursor is on the opening bracket rather than inside it).
        if (cursorIsAfterTagStart && cursorPosition.isBefore(currentTagStart.translate({ characterDelta: 1 }))) {
            cursorIsAfterTagStart = false;
        }
        if (cursorIsAfterTagEnd && cursorPosition.isBefore(currentTagEnd)) {
            cursorIsAfterTagEnd = false;
        }

        // Process each type of tag.
        // match[1] from the regular expression is the tag name (ifversion, elsif, else, or endif)
        if (match[1] === "ifversion") {
            nestingLevel++;      // Increment the nesting level for each ifversion tag inside an ifversion block
                                 // Outside of an ifversion block, nestingLevel will be -1
                                 // In an unnested ifversion block, nestingLevel will be 0

            tagSetID[nestingLevel] = tagCounter; // Set the tagSetID for this ifversion tag

            if (cursorIsAfterTagStart) {
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
        else if (match[1] === "elsif" && cursorIsAfterTagStart) {
            currentTagSpan[nestingLevel] = tagCounter; // The cursor may be within this tag
            if (nestingLevel >0) {
                versionDescription[nestingLevel] = "AND ";
            }
            versionDescription[nestingLevel] += match[2];
            elsedVersions[nestingLevel] += "AND NOT " + match[2];
        }
        else if (match[1] === "else" && cursorIsAfterTagStart) {
            currentTagSpan[nestingLevel] = tagCounter; // The cursor may be within this tag
            if (nestingLevel >0) {
                versionDescription[nestingLevel] = "AND ";
            }
            versionDescription[nestingLevel] = elsedVersions[nestingLevel];
        }
        else if (match[1] === "endif" && cursorIsAfterTagEnd) {
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
    ){

    // Get the configuration for 'version-identifier' from the user's settings.json file
    // (or from the default settings, defined in the extension's in package.json file):
    let config = vscode.workspace.getConfiguration('version-identifier');

    // From the configuration, get the 'colorPairs' setting,
    // mapping it to an array of objects with backgroundColor and color properties.
    // We'll use this to highlight the tags of each tag set at a particular version nesting level.
    let colorPairs = config.get<{backgroundColor: string, color: string}[]>('colorPairs', []);

    let colorIndex = 0; // This will be used to cycle through the color pairs

    // Iterate backwards through the currentTagSpan array:
    for (let i = currentTagSpan.length - 1; i >= 0; i--) {
        let tagID = currentTagSpan[i];

        // For each tag span in currentTagSpan array (i.e. the tag span that lets us work out
        // which tag set we're going to highlight at a particular nesting level),
        // fetch one pair of colors from the colorPairs array declared at the top of this file.
        // The modulo operator (%) ensures that if colorIndex is greater than the number of color pairs,
        // the colors will cycle through the defined pairs.
        let colors = colorPairs[colorIndex % colorPairs.length];

        // Create a new decoration definition for this color pair
        let decorationDefinition = vscode.window.createTextEditorDecorationType({
            backgroundColor: colors.backgroundColor,
            color: colors.color
        });
        decorationDefinitionsArray.push(decorationDefinition);

        // This array will hold the ranges of all the tags in the current tag set:
        let decorationsArray: vscode.DecorationOptions[] = [];

        // Use the tag span ID to get the tag object for that tag
        // from the versionTags array:
        let tagObject = versionTags.find(tag => tag?.tagID === tagID);

        // From this tag object, get its tag set ID:
        let currentTagSetID = tagObject?.tagSet;

        // Filter the versionTags array,
        // to find all of the tag objects whose tag set
        // matches the one we've just found:
        let matchingTags = versionTags.filter(tag => tag.tagSet === currentTagSetID);

        matchingTags.forEach(tag => {
            // Create a vscode.Range object for the tag:
            const range = new vscode.Range(
                tag.positionVersionTagStart,
                tag.positionVersionTagEnd
            );

            // Push the range into the decorationsArray array:
            decorationsArray.push({ range: range });

        });

        // Apply the decoration to the ranges we've collected for this set of tags.
        // These will all be highlighted in the same color.
        if (activeEditor) {
            activeEditor.setDecorations(decorationDefinition, decorationsArray);
        }
        colorIndex++; // Increment the color index so that the next tag set will use a different color pair
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
// This function is called when the extension is deactivated.
// If you deactivate the extension we want to remove any decorations that have been applied.
export function deactivate() {
    decorationDefinitionsArray.forEach(decoration => decoration.dispose());
    decorationDefinitionsArray = []; // Clear the array
}
