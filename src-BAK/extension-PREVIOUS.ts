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
  ifversionId: number;  // Each ifversion tag in the Markdown file will be given a unique ID
  parentIfVersionId: number[];  // For nested versioning, the ID of the parent ifversion tag
  level: number;        // Unnested tags are at level 0, nested tags are at level 1, etc.
  tagname: string;      // This will be (ifversion|elsif|else|endif)
  content: string;      // This will be the version tag content, e.g. "fpt or ghec"
  positionVersionTagStart: vscode.Position; // This will be the start position of the version tag
  positionVersionTagEnd: vscode.Position;   // This will be the end position of the version tag
}

// --------------------------------
// activate() function
// --------------------------------
export function activate(context: vscode.ExtensionContext) {
  let disposableModal = vscode.commands.registerCommand('extension.runExtensionModal', () => {
    let versionTags: VersionTag[] = [];
    runExtension(true, versionTags);
  });

  let disposableToast = vscode.commands.registerCommand('extension.runExtensionToast', () => {
    let versionTags: VersionTag[] = [];
    runExtension(false, versionTags);
  });

  context.subscriptions.push(disposableModal, disposableToast);

  // Register a command to remove the decorations.
  // The command is defined in package.json and is bound to the escape key
  let removeDecorationsDisposable = vscode.commands.registerCommand(
          'extension.removeDecorations', () => {
      decoration.dispose();  // Remove any text decorations
      decoration = vscode.window.createTextEditorDecorationType({});
  });

  context.subscriptions.push(removeDecorationsDisposable);

  // Listen for selection changes in the editor
  let removeDecorationsOnCursorMove =
          vscode.window.onDidChangeTextEditorSelection(() => {
      decoration.dispose();  // Remove any text decorations
      decoration = vscode.window.createTextEditorDecorationType({});
  });

  context.subscriptions.push(removeDecorationsOnCursorMove);
}

// --------------------------------
// runExtension() function
// --------------------------------
function runExtension(isModal: boolean, versionTags: VersionTag[]) {
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

    let ifversionCounter: number | undefined = 0;   // Use this to give each ifversion tag a unique ID
    let tagIfVersionId: number | undefined = 0;     // The ID of the realted ifversion tag for any ifversion/elsif/else/endif tag
    let currentIfVersionId: number | undefined = 0; // The ID of the ifversion block in which the cursor is currently located
    let nestingLevel: number | undefined = -1;      // Keep track of nested levels of versioning
    let parentIfVersionId: number[] = [0];          // For nested versioning, the ID of the parent ifversion tag

    let match: RegExpExecArray | null;
    while ((match = tagRegEx.exec(text)) {
        // Search through the entire text for matches of the above regex
        // and capture details about each matched tag in an element (object) in the versionTags array:
        const returnValues = buildVersionTagsArray(
            match,
            versionTags,
            tagIfVersionId as number,
            ifversionCounter as number,
            nestingLevel as number,
            parentIfVersionId as number[]
        );
        if (returnValues) {
            tagIfVersionId = returnValues.updatedIfVersionId;
            ifversionCounter = returnValues.updatedIfversionCounter;
            nestingLevel = returnValues.updatedLevel;
            currentIfVersionId = returnValues.currentIfVersionId;
        }
    }

    let level = -1; // This will contain the current level of versioning
    let versionArray: string[] = []; // This will contain the versions for the current cursor position
    let elseVersions: string[] = []; // This will contain all versions in 'ifversion' + 'elsif' tags

    // Iterate over the all of the version tags in the file
    for (let tag of versionTags) {

        // TODO: DELETE THIS FOR DEBUGGING PURPOSES ONLY
        let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
        console.log("runExtension() function, line " + lineNumber + "\ncurrentIfVersionId: " + currentIfVersionId + "\ntag.tagname: " + tag.tagname + "\ntag.content: " + tag.content + "\nlevel: " + level + "\ntag.parentIfVersionId[0]: " + tag.parentIfVersionId[0] + "\ntag.parentIfVersionId[1]: " + tag.parentIfVersionId[1] + "\ntag.parentIfVersionId[2]: " + tag.parentIfVersionId[2] + "\ntag.parentIfVersionId.length: " + tag.parentIfVersionId.length + "\n=========================");


        // Calculate the inline versioning, and the version nesting level, for the current cursor position,
        // breaking out of the loop when a tag is passed the current cursor position:
        const returnValues = calculateVersioning(tag, level, versionArray, elseVersions);

        if (returnValues && returnValues.breakForLoop) {
            level = returnValues.updatedLevel;
            break;
        } else if (returnValues && returnValues.versionArray){
            level = returnValues.updatedLevel;
            currentIfVersionId = returnValues.updatedIfVersionId;
            versionArray = returnValues.versionArray;
        }

        /*
        // TODO: DELETE THIS FOR DEBUGGING PURPOSES ONLY
        let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
        console.log("runExtension() function, line " + lineNumber + "\ncurrentIfVersionId: " + currentIfVersionId + "\ntag.parentIfVersionId[level]: " + tag.parentIfVersionId[level] + "\ntag.tagname: " + tag.tagname + "\ntag.content: " + tag.content + "\nlevel: " + level + "\n=========================");
        */
    }

    // For debugging purposes only TODO: DELETE THIS:
    let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
    console.log("\n-----------\nOn line " + lineNumber + " tagIfVersionId: " + tagIfVersionId + "\ncurrentIfVersionId: " + currentIfVersionId + "\n====================================================");

    let cursorPos = activeEditor.selection.active;
    let lineNum = cursorPos.line + 1;
    let charNum = cursorPos.character + 1;
    let positionString = `at the cursor position (line ${lineNum}, character ${charNum})`;

    // Highlight the version tags for the current cursor position:
    highlightVersionTags(activeEditor, versionTags, currentIfVersionId, level);

    // Prepare and display the popup message with versioning information
    displayVersionMessage(isModal, versionArray, positionString);

}  // End of runExtension() function

// --------------------------------
// buildVersionTagsArray() function
// --------------------------------
// The following function is called from a while loop in the runExtension() function.
// It is called once for each match of the tagRegEx regex,
// i.e. once for each (ifversion/elsif/else/endif) Liquid version tag in the Markdown file.
// The results of each regex match are contained in the "match" array,
// e.g. match[0] contains the entire matched text (e.g. "{% ifversion ghes }"),
// match[1] contains the tag name (e.g. "ifversion"),
// and match[2] contains the content of the tag (e.g. "ghes").
// This function processes the results of each regex match
// and stores the results in the versionTags array.
// Each element of the versionTags array contains details about a single Liquid version tag,
// such as the tag name (e.g. "ifversion"), the content of the tag (e.g. "fpt or ghec"), etc.
function buildVersionTagsArray(
        match: RegExpExecArray,     // The parts of each tag matched by the regex
        versionTags: VersionTag[],  // The array of tag objects we're building in this function
        tagIfVersionId: number,     // The ID for this ifversion/elsif/else/endif tag set
        ifversionCounter: number,   // A counter iterated to give each ifversion tag a unique ID
        nestingLevel: number,       // The versioning nesting level at the current cursor position
        parentIfVersionId: number[] // For nested versioning, an array of ancestor ifversion IDs
    ){
    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }
    const currentTagType = match[1];  // This will be (ifversion|elsif|else|endif)

    // Calculate start and end positions of the current tag.
    // match.index is the position of the first character of the match
    const openingBracketPos = match.index;
    const currentTagStart = activeEditor.document.positionAt(openingBracketPos);
    // match[0] is the entire matched text
    // This gives us the position of the character after the closing bracket
    const closingBracketPos = match.index + match[0].length;
    const currentTagEnd = activeEditor.document.positionAt(closingBracketPos);

    // tagAssignmentId is used to give the same ID to each tag in an ifversion/elsif/else/endif set.
    // If the current tag if an elsif, else or endif tag,
    // it will always be assigned the ID of the latest ifversion tag in this loop.
    let tagAssignmentId = tagIfVersionId;

    let currentIfVersionId = 0; // The ID of the ifversion tag set in which the cursor is currently located

    if (currentTagType === "ifversion") {
        nestingLevel++;      // Increment the nesting level for each ifversion tag inside an ifversion block
                             // Outside of an ifversion block, nestingLevel will be -1
                             // In an unnested ifversion block, nestingLevel will be 0
        parentIfVersionId[nestingLevel] = tagIfVersionId; // Store the ID of the parent ifversion tag
        ifversionCounter++;  // Increment the counter for each ifversion, so that we can give each ifversion tag a unique ID
        // tagIfVersionId is the ID of the ifversion tag at the current cursor position:
        tagAssignmentId = ifversionCounter;  // Each ifversion tag will get a newly incremented ID.
        tagIfVersionId = ifversionCounter;   // We'll also pass back the new ifversion ID to the runExtension() function
    }
    else if (currentTagType === "endif") {
        // Change the version ID for the cursor position to the ID of the immediate parent ifversion tag:
        currentIfVersionId = parentIfVersionId[nestingLevel]; //TODO - I CHANGED tagIfVersionId to currentIfVersionId -- IS IT RIGHT?
        nestingLevel--;  // Step back into the previous nested versioning level
        parentIfVersionId.pop();
    }

    /*
    // For debugging purposes only TODO: DELETE THIS:
    let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
    console.log("buildVersionTagsArray() function. Line " + lineNumber);
    console.log("currentTagType: " + currentTagType + "\ntag.ifversionId: " + tagAssignmentId + "\ntagIfVersionId: " + tagIfVersionId + "\nifversionCounter: " + ifversionCounter + "\nnestingLevel: " + nestingLevel + "\ncurrentIfVersionId: " + currentIfVersionId);
    for (let i = 0; i < parentIfVersionId.length; i++) {
        console.log("parentIfVersionId[" + (i) + "]: " + parentIfVersionId[i]);
    }
    console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
    */

    // Add the details of the current version tag to the versionTags array.
    // Each element of the array is an object containing the following properties:
    versionTags.push({
        ifversionId: tagAssignmentId,  // This is either the existing or newly incremented ifversion ID
        parentIfVersionId: parentIfVersionId,  // For nested versioning, the ID of the parent ifversion tag
        level: nestingLevel,
        tagname: currentTagType,
        content: match[2], // This is the text captured by [^%]* in the regex above
        positionVersionTagStart: currentTagStart,
        positionVersionTagEnd: currentTagEnd
    });

    // For debugging purposes only TODO: DELETE THIS:
    let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
    console.log("buildVersionTagsArray() function. Line " + lineNumber);
    console.log("currentTagType: " + currentTagType + "\ntag.ifversionId: " + tagAssignmentId + "\ntagIfVersionId: " + tagIfVersionId + "\nifversionCounter: " + ifversionCounter + "\nnestingLevel: " + nestingLevel + "\ncurrentIfVersionId: " + currentIfVersionId + "\nparentIfVersionId: " + parentIfVersionId + "\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");

    return {
        updatedIfVersionId: tagIfVersionId,
        updatedIfversionCounter: ifversionCounter,
        updatedLevel: nestingLevel,
        currentIfVersionId: currentIfVersionId
    };
}

// --------------------------------
// calculateVersioning() function
// --------------------------------
// This function is run from the runExtension() function for each version tag in the file,
// starting with the first tag in the file and working forwards through the file.
// For each tag, this function checks whether the tag is before the current cursor position,
// in which case the tag may be relevant. If the tag is after the current cursor position,
// then it's not relevant so we can stop iterating over the versionTags array.
// For each tag that's processed, we build up an array (versionArray) where each element
// of the array contains a string that includes all of the version names for each level of ifversion tags.
// For example, if the cursor position is within a nested ifversion tag,
// versionArray[0] might contain "fpt or ghec"
// and versionArray[1] might (if you're in an "else" clause) contain "NOT ghes = 3.9 AND NOT ghes = 3.8".
function calculateVersioning(
        tag: VersionTag,
        level: number,
        versionArray: string[],
        elseVersions: string[]
    ) {
    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }
    let cursorPos = activeEditor.selection.active;
    if (cursorPos.line < tag.positionVersionTagEnd.line) {
        // Stop iterating over this array if we've passed the line the cursor is on
        return { breakForLoop: true, updatedIfVersionId: null, versionArray: null, updatedLevel: level };
    };
    if (cursorPos.line === tag.positionVersionTagEnd.line && cursorPos.character < tag.positionVersionTagEnd.character) {
        // Stop iterating if the cursor is on the same line as the tag, but is before the '}' of the tag
        return { breakForLoop: true, updatedIfVersionId: null, versionArray: null, updatedLevel: level };
    };

    let currentIfVersionId = tag.ifversionId; // Set currentIfVersionId to the ifversionId of the current tag

    if (Object.keys(tag).length === 0) {  // This is the first version tag in the Markdown file
        currentIfVersionId = 1;  // Set currentIfVersionId to 1, otherwise it will be undefined
    }


    // TODO: DELETE THIS FOR DEBUGGING PURPOSES ONLY
    let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
    console.log("calculateVersioning() function, line " + lineNumber + "\ncurrentIfVersionId: " + currentIfVersionId + "\nlevel: " + level + "\ntag.tagname: " + tag.tagname + "\ntag.content: " + tag.content + "\ntag.parentIfVersionId[0]: " + tag.parentIfVersionId[0] + "\ntag.parentIfVersionId[1]: " + tag.parentIfVersionId[1] + "\ntag.parentIfVersionId[2]: " + tag.parentIfVersionId[2] + "\n=========================");



    if (tag.tagname === "ifversion" ) {
        level++;
        // For the first ifversion in the file assign a value to version[0],
        // for the second ifversion assign a value to version[1], etc.
        versionArray[level] = tag.content;  // e.g. "fpt or ghec"
        elseVersions[level] = tag.content;  // Store in case of ifelssed clauses
    }
    else if (tag.tagname === "elsif") {
        // The current level of versioning is one less than
        // the value of 'level' which we just incremented above.
        // Overwrite versionArray[n] with the tag versioning
        versionArray[level] = tag.content;  // e.g. "ghes"
        elseVersions[level] += "\nAND NOT " + tag.content;
    }
    else if (tag.tagname === "else") {
        versionArray[level] = "NOT " + elseVersions[level];
    }
    else {     // i.e. tag.tagname == "endif"
        versionArray.pop();  // Remove the last element from the big array of versions
        elseVersions.pop();
        if (level > 0) {  // If we're stepping out of a nested ifversion block


            // TODO ----- WHAT SHOULD BE IN HERE??????????????????


            /*
            // TODO: DELETE THIS FOR DEBUGGING PURPOSES ONLY
            let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
            console.log("calculateVersioning() function, line " + lineNumber + "\ntag.tagname: " + tag.tagname + "\ntag.content: " + tag.content + "level: " + level + "\nThis the bugger? tag.parentIfVersionId[0]: " + tag.parentIfVersionId[0] + "\ntag.parentIfVersionId[1]: " + tag.parentIfVersionId[1] + "\ntag.parentIfVersionId[2]: " + tag.parentIfVersionId[2]);
            */

        }
        else {  // If we're stepping out of an un-nested ifversion block
            currentIfVersionId = 0; // There is no ifversion block at the current cursor position
        }
        level--; // Step back into the previous versioning level
    }

    // TODO: DELETE THIS FOR DEBUGGING PURPOSES ONLY
    lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
    console.log("calculateVersioning() function, line " + lineNumber + "\ncurrentIfVersionId: " + currentIfVersionId + "\nlevel: " + level + "\ntag.tagname: " + tag.tagname + "\ntag.content: " + tag.content + "\ntag.parentIfVersionId[0]: " + tag.parentIfVersionId[0] + "\ntag.parentIfVersionId[1]: " + tag.parentIfVersionId[1] + "\ntag.parentIfVersionId[2]: " + tag.parentIfVersionId[2] + "\n=========================");

    return { breakForLoop: false, updatedIfVersionId: currentIfVersionId, versionArray: versionArray, updatedLevel: level };
}

// --------------------------------
// highlightVersionTags() function
// --------------------------------
// This function is called once each time the extension is run, from the runExtension() function.
// Apply decorations (i.e. text highlighting in the editor) to version tags with the tagIfVersionId passed to this function
// (i.e. tags that have the same tagIfVersionId as the ID of the ifversion tag at the current cursor position).
function highlightVersionTags(
        activeEditor: vscode.TextEditor | undefined,
        versionTags: VersionTag[],
        tagIfVersionId: number,
        level: number
    ) {
    // Create an array to hold the ranges of text to be highlighted
    const ranges: vscode.Range[] = [];

    // For debugging purposes only TODO: DELETE THIS:
    let lineNumber = parseInt((new Error().stack?.split('\n')[1].match(/:(\d+):\d+\)$/)?.[1]) || '') + 1;
    console.log("\n-----------\nOn line " + lineNumber + " tagIfVersionId: " + tagIfVersionId + "\nlevel: " + level + "\n+++++++++++++++++++++++");

    // This code filters the versionTags array (all the Liquid version tags in the file)
    // to give only those elements of the array where value of the tag.ifversionId property
    // (i.e. the ID of the related ifversion ID for that tag) matches the tagIfVersionId value
    // (i.e. if ifversion ID that we've calculated as applying at the current cursor position).
    // In other words it only gives you the ifversion/elsif/else/endif tags for the current cursor position.
    // It then adds the start and end positions of those tags to the "ranges" array.
    versionTags
        .filter(tag => tag.ifversionId === tagIfVersionId)
        .forEach(tag => {

            /*
            // TODO: DELETE THIS FOR DEBUGGING PURPOSES ONLY
            console.log("tag.tagname: " + tag.tagname + "\ntag.content: " + tag.content + "\ntag.ifversionId: " + tag.ifversionId + "\ntagIfVersionId: " + tagIfVersionId + "\nlevel: " + level + "\n=========================");
            */

            // Create a constant containing a Range object,
            // which consists of a start and end position
            const range = new vscode.Range(
                tag.positionVersionTagStart,
                tag.positionVersionTagEnd
            );

            // Add the 'range' constant to the 'ranges' array.
            // This contains all the ranges of text to be highlighted.
            ranges.push(range);
        });

    // Dispose of the old decoration type.
    // This removes any decorations that were applied in a previous run of the extension.
    decoration.dispose();
    // Create a new decoration type for highlighting the current version tags.
    decoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'red',
        color: 'white'
    });

    // Apply the decorations to all ranges
    if (activeEditor) {
        // Use the setDecorations method to apply the decorations to the active editor.
        // See https://github.com/microsoft/vscode-extension-samples/blob/main/decorator-sample/USAGE.md
        activeEditor.setDecorations(decoration, ranges);
    }
}

// --------------------------------
// displayVersionMessage() function
// --------------------------------
function displayVersionMessage(isModal: boolean, versionArray: string[], positionString: string) {
    // Prepare and display the popup message with versioning information
    let message = "";
    versionArray = versionArray.map(tag => tag.trim());  // Remove leading and trailing spaces
    if (versionArray.length === 0) {
        message = "There is no inline versioning " + positionString + ".";
    }
    else {
        message = "The inline versioning " + positionString + " is:\n\n" + versionArray.join("\nAND ");
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
}

// --------------------------------
// deactivate() function
// --------------------------------
export function deactivate() {
    decoration.dispose();
}
