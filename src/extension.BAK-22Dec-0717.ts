import * as vscode from 'vscode';

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
            startingPosition: vscode.Position,
            endingPosition: vscode.Position 
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
                content: match[2], // This will be the text captured by [^%]* 
                startingPosition: currentTagStart,
                endingPosition: currentTagEnd
            });

            if (currentTag === "endif") {
                currentIfVersionId--; 
            }
        }

        versionTags.forEach((item: { 
            ifversionId: number,
            level: number,
            tag: string, 
            content: string, 
            startingPosition: vscode.Position,
            endingPosition: vscode.Position 
        }) => {
            console.log(`\n`);
            console.log(`ifversionId: ${item.ifversionId}`);
            console.log(`level: ${item.level}`);
            console.log(`tag: ${item.tag}`);
            console.log(`content: ${item.content}`);
            console.log(`startingPosition: ${item.startingPosition.line}, ${item.startingPosition.character}`);
            console.log(`endingPosition: ${item.endingPosition.line}, ${item.endingPosition.character}`);
        });            

        
        let cursorPos = activeEditor.selection.active;
        let level = -1;  // Start at -1 so that the first ifversion is at level 0
        let versionArray: string[] = [];

        for (let item of versionTags) {
            if (cursorPos.line < item.endingPosition.line) { 
                break; 
            };
            if (cursorPos.line === item.endingPosition.line && cursorPos.character < item.endingPosition.character) {
                break; 
            };
            if (item.tag === "ifversion" ) {
                // For the first ifversion in the file assign a value to version[0]
                level++;
                versionArray[level] = item.content;  // e.g. "fpt or ghec"
            }
            else if (item.tag === "elsif") {
                // Don't increment level, just overwrite the current value
                versionArray[level] = item.content;  // e.g. "ghes"
            }
            else if (item.tag === "else") {
                versionArray[level] = "NOT " + versionArray[level]; // e.g. "NOT fpt or ghec"
            }
            else {        // item.tag == "endif"
                versionArray.pop();  // Remove the last element from the array
                level--;
            }
        }
        
        let message = "";
        let lineNum = cursorPos.line + 1;
        let charNum = cursorPos.character + 1;
        let positionString = `at the cursor position (line ${lineNum}, character ${charNum})`;

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
}

export function deactivate() { }