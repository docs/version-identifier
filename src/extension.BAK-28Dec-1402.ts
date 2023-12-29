import * as vscode from 'vscode';

// Create a decorator type that we'll use to highlight the version tags.
// We need to declare it here, outside of the activate() function,
// so that we can use dispose() to remove any decorations that were applied 
// in a previous run of the extension.
let decoration = vscode.window.createTextEditorDecorationType({});

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('vsc-extension-version-tags.highlight-tags', () => {
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
        const tagRegEx = /\{%\s*(ifversion|elsif|else|endif)\s+([^%]*)%\}/g;

        // Create an array of objects: 
        const versionTags: { 
            ifversionId: number,
            level: number,
            tag: string, 
            content: string, 
            positionVersionTagStart: vscode.Position,
            positionVersionTagEnd: vscode.Position 
        }[] = [];

        let ifversionCounter = 0, currentIfVersionId = 0, currentLevel = 0;
        let match;
        while (match = tagRegEx.exec(text)) {  // Search through the entire text for matches
            const currentTag = match[1];  // This will be 'ifversion' etc.
            if (currentTag === "ifversion") {
                ifversionCounter++;  // Increment the counter for each ifversion
                currentLevel++;  // Increment the level for each ifversion
                currentIfVersionId = ifversionCounter;  
            }
            else if (currentTag === "endif") {
                currentLevel--;  
            }

            // Calculate start and end positions of the current tag.
            // match.index is the position of the first character of the match
            const openingBracketPos = match.index;
            const currentTagStart = activeEditor.document.positionAt(openingBracketPos);
            // match[0] is the entire matched text
            // This gives us the position of the character after the closing bracket
            const closingBracketPos = match.index + match[0].length;
            const currentTagEnd = activeEditor.document.positionAt(closingBracketPos);
            
            versionTags.push({ 
                ifversionId: currentIfVersionId, 
                level: currentLevel,
                tag: currentTag, 
                content: match[2], // This is the text captured by [^%]* 
                positionVersionTagStart: currentTagStart,
                positionVersionTagEnd: currentTagEnd
            });

            if (currentTag === "endif") {
                currentIfVersionId--; 
            }
        }

        /*
        versionTags.forEach((item: { 
            ifversionId: number,
            level: number,
            tag: string, 
            content: string, 
            positionVersionTagStart: vscode.Position,
            positionVersionTagEnd: vscode.Position 
        }) => {
            console.log(`\n`);
            console.log(`ifversionId: ${item.ifversionId}`);
            console.log(`level: ${item.level}`);
            console.log(`tag: ${item.tag}`);
            console.log(`content: ${item.content}`);
            console.log(`positionVersionTagStart: ${item.positionVersionTagStart.line}, ${item.positionVersionTagStart.character}`);
            console.log(`positionVersionTagEnd: ${item.positionVersionTagEnd.line}, ${item.positionVersionTagEnd.character}`);
        });    
        */        
        
        let cursorPos = activeEditor.selection.active;

        /*
        // For debugging purposes only
        for (let item of versionTags) {
            console.log(`\n`);
            console.log(`positionVersionTagStart: ${item.positionVersionTagStart.line}, ${item.positionVersionTagStart.character}`);
            console.log(`positionVersionTagEnd: ${item.positionVersionTagEnd.line}, ${item.positionVersionTagEnd.character}`);
        }
        */

        let level = 0;  
        let versionArray: string[] = []; // This will contain the versions for the current cursor position
        let elseIffedVersions: string[] = []; // This will contain all versions in 'if' + 'elsif' tags
        currentIfVersionId = 0; // Reset to use for the ifversionId at the current cursor position

        // Calculate the inline versioning at the current cursor position
        for (let item of versionTags) {
            if (cursorPos.line < item.positionVersionTagEnd.line) { 
                break; // Stop iterating over this array if we've passed the line the cursor is on
            };
            if (cursorPos.line === item.positionVersionTagEnd.line && cursorPos.character < item.positionVersionTagEnd.character) {
                break; // Stop iterating if the cursor is on the same line as the tag, but is before the '}' of the tag
            };
            currentIfVersionId = item.ifversionId; // Update the currentIfVersionId
            if (item.tag === "ifversion" ) {
                // For the first ifversion in the file assign a value to version[0],
                // for the second ifversion assign a value to version[1], etc.
                versionArray[level] = item.content;  // e.g. "fpt or ghec"
                elseIffedVersions.push(item.content);  // Store in case of ifelssed clauses
                level++;
            }
            else if (item.tag === "elsif") {
                // The current level of versioning is one less than 
                // the value of 'level' which we just incremented above.
                // Overwrite versionArray[n] with the tag versioning
                versionArray[level-1] = item.content;  // e.g. "ghes"
                elseIffedVersions.push(item.content);
            }
            else if (item.tag === "else") {
                versionArray[level-1] = "NOT " + elseIffedVersions.join(" AND NOT ");
            }
            else {        // item.tag == "endif"
                // if (level > 1) {
                    currentIfVersionId--; // Step back into the previous ifversion
                // }
                // else {  // If currentIfVersionId is 1 or 0:
                //    currentIfVersionId = 0; // Back into unversioned text
                // }
                versionArray.pop();  // Remove the last element from the big array of versions
                elseIffedVersions.length = 0; // Empty the array of version names
                level--;
            }
       }

        let message = "";
        let lineNum = cursorPos.line + 1;
        let charNum = cursorPos.character + 1;
        let positionString = `at the cursor position (line ${lineNum}, character ${charNum})`;

        // Create an array to hold the ranges of text to be highlighted
        const ranges: vscode.Range[] = [];

        versionTags
            .filter(item => item.ifversionId === currentIfVersionId)
            .forEach(item => {
                // console.log(`\n`);
                // console.log(`positionVersionTagStart: ${item.positionVersionTagStart.line}, ${item.positionVersionTagStart.character}`);
                // console.log(`positionVersionTagEnd: ${item.positionVersionTagEnd.line}, ${item.positionVersionTagEnd.character}`);

                // Create a range from the start and end positions
                const range = new vscode.Range(
                    item.positionVersionTagStart,
                    item.positionVersionTagEnd
                );

                // Add the range to the array
                ranges.push(range);
            });

        // Dispose of the old decoration type and create a new one
        decoration.dispose(); // Remove text decorations applied when the extension was last run
        decoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'red',
            color: 'white'
        });

        // Apply the decorations to all ranges
        if (activeEditor) {
            activeEditor.setDecorations(decoration, ranges);
        }

        // Prepare and display the "toast" message with versioning information
        versionArray = versionArray.map(item => item.trim());  // Remove leading and trailing spaces
        if (versionArray.length === 0) {
            message = "There is no inline versioning " + positionString + ".";
        } 
        else {
            message = "The inline versioning " + positionString + " is: " + versionArray.join(" AND ");
        }
        vscode.window.showInformationMessage(
            message,
            "OK"
        );
    });

    context.subscriptions.push(disposable);

    // Register a command to remove the decorations.
    // The command is defined in package.json and is bound to the escape key
    let removeDecorationsDisposable = vscode.commands.registerCommand(
            'vsc-extension-version-tags.removeDecorations', () => {
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

export function deactivate() {
    decoration.dispose();
}