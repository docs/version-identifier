
# Code description

The purpose of this extension is to identify the versioning that applies at the current cursor position within a Markdown file.

The code is written in TypeScript. This file describes how the code works.

## Contents

- [Terminology](#terminology)
  - [Tag sets](#tag-sets)
  - [Tag spans](#tag-spans)
  - [Version nesting](#version-nesting)
- [How the code works](#how-the-code-works)
  - [1. Parsing the Markdown file](#1-parsing-the-markdown-file)
    - [Processing each version tag](#processing-each-version-tag)
    - [Example](#example)
    - [Results of parsing](#results-of-parsing)
  - [2. Highlighting tags and displaying a versioning message](#2-highlighting-tags-and-displaying-a-versioning-message)
    - [Highlighting the relevant version tags](#highlighting-the-relevant-version-tags)
    - [Removing the highlighting](#removing-the-highlighting)
    - [Displaying a versioning message](#displaying-a-versioning-message)
- [Reference](#reference)
  - [Variables and constants in alphabetical order](#variables-and-constants-in-alphabetical-order)
  - [Tag object properties](#tag-object-properties)
  - [Per-tag explanation](#per-tag-explanation)
    - [All tags](#all-tags)
    - [`ifversion`](#ifversion)
    - [`elsif`](#elsif)
    - [`else`](#else)
    - [`endif`](#endif)
  - [Regular expression](#regular-expression)
    - [The regular expression broken down](#the-regular-expression-broken-down)
    - [Using the regular expression](#using-the-regular-expression)
  - [The package.json file](#the-packagejson-file)
<br/>

## Terminology

The following key terms are used to explain how the extension was coded.

### Tag sets

You can version portions of text within a Markdown file used to create the documentation at [docs.github.com](https://docs.github.com). The versioned text will only appear in some versions of the documentation. For example, only in the documentation for the Free, Professional, and Team plans (`fpt`), only in the documentation for GitHub Enterprise Cloud (`ghec`), only for GitHub Enterprise Server (`ghes`), or only in specified releases of GHES (`ghes >3.10`, `ghes = 3.11`, and so on).

To version text you use a set of Liquid tags, such as `{% ifversion some-version-name %}`, `{% elsif alternative-version %}`, `{% else %}`, `{% endif %}`.

A tag set:
- Always starts with an `ifversion` tag.
- Can optionally have one or more `elsif` tags.
- Can optionally have one `else` tag.
- Always ends with an `endif` tag.

### Tag spans

A tag span consists of a tag plus the text to which that tag applies. In an un-nested tag set, with the exception of an `endif` tag, a tag span begins with the `{` of the tag and ends with the `{` of the next tag. The `endif` tag has no related text, so it ends with the `}` of the tag itself. For example:

```markdown
This text does not belong to a tag span, {% ifversion some-version-name %}this is the ifversion tag span,
{% elsif alternative-version %}this is the tag span for an elsif clause, {% else %}this is the tag span for
an else clause, {% endif %}and this does not belong to a tag span.
```

The cursor is always within 0 or 1 tag span. By identifying which tag span the cursor is currently within, we can determine the versioning for that text. If the cursor is not within a tag span then the text is unversioned.

### Version nesting

If you put a tag set within a tag span of another tag set, then the inner tag set is said to be nested within the outer tag set. Most versioning in GitHub's documentation is not nested. However, nesting is not uncommon and it's in files that use nesting that this extension is most useful.

Here's an example of nested versioning:

```markdown
{% ifversion baselevel %}

This text is versioned for "baselevel".

{% ifversion fpt or ghec %}

This ifversion/endif tag set is nested (i.e. nesting level 1).
Now the versioning is "baselevel AND (fpt or ghec)".

{% endif %}

Now we're back to "baselevel" versioning again.

{% endif %}
```

Text at any point in the file can be within 0 or more nested tag sets. By identifying the tag span that the cursor is within, and checking whether the tag set for that span is nested in a parent tag span, on so on back until we find the outermost tag span, we can determine the versioning for that text, and we can also determine which tag sets to highlight at each level of nesting.

## How the code works

There are 2 main phases:
1. Parsing the Markdown file and working out the versioning for the text at the cursor position, and which Liquid tags to highlight.
2. Displaying a message detailing the versioning, and highlighting the revelant tags in the editor.

### 1. Parsing the Markdown file

First we find the cursor position within the Markdown file and assign this to the constant `cursorPosition`:

```typescript
const cursorPosition = activeEditor.selection.active;
```

We then use a regular expression to search through the entire text of the file identifying version tags and processing each one of them, one tag at a time, as they are found.

At the end of the parsing phase we will have:
- The ID of tag span within which the cursor is located.
- An array of tag objects that will tell us which tag set(s) to highlight.
- An array of strings that we'll use to build a message telling the user what versioning applies at the cursor position.

#### Processing each version tag

While stepping through the file, one tag at a time, we're building various arrays:

a) An array called `versionTags` that contains details of all the version tags in the file. Each element of this array is an object representing one tag. The properties of this object describe features of the tag: its unique ID, another ID that identifies the tag set the tag belongs to, and the start and end positions of the tag in the VS Code editor.

b) A `versionDescription` array that will contain the description of the versioning at each level of nesting (i.e. `versionDescription[0]` contains the versioning description for un-nested versioning, `versionDescription[1]` contains the versioning description for the first level of nested versioning, and so on). Generally the array will only have `versionDescription[0]`. The combined elements in this array provides the message we'll display to users. As we parse through the file we'll modify this array as we encounter `ifversion`, `elsif`, `else`, and `endif` tags, until we reach the cursor position. At that point we'll stop modifying the array so that, at the end of parsing, the array will contain the versioning description for the cursor position.

c) An `elsedVersions` array containing a negated set of versions for the current tag set - for example, "NOT ghes \nAND NOT ghec". We use this if we come to an `else` tag.

d) The `tagSetID` array. The last element in this array records the ID of the tag set for the version tag we're currently processing. We need to use an array rather than just a single number, so that when we leave a nested tag set, at an `endif` tag, we know which tag set to step back into. We'll assign the number in `tagSetID[nestingLevel]` to the `tagSet` property of the tag we're currently processing. We continue modifying the contents of this array throughout the parsing phase, irrespective of the cursor position.

e) The `currentTagSpan` array that will allow us to work out which tags to highlight in the editor. Each `currentTagSpan[nestingLevel]` element of this array contains the ID of the tag span that affects the text at the cursor position. Note that, unlike the `tagSetID` which we use when processing every tag in the file, the `currentTagSpan` array is only for recording the span, or spans, that affect the text at the cursor position. When we reach the cursor position during parsing, we stop modifying this array. So, at the end of parsing, the final element in the array tells us which tag span the cursor is currently directly within. If there are two elements in the array then the cursor is within a nested tag set, with `currentTagSpan[1]` identifing the tag span for the cursor position, and `currentTagSpan[0]` identifing the tag span within which the nested tag set is located. If there's only one element in the array then the cursor is within an un-nested tag set. If there are no elements in the array then there's no versioning at the cursor position.

Knowing the containing tag span at each level allows us to determine which tag set(s) to highlight for the cursor position. This is possible because each tag belongs to a tag set and we store the ID of the tag set in the `tagSet` property of each tag object.

When we finish parsing the file, we can work backwards through the `currentTagSpan` array, starting with the last element in the array. For each element we:
- Get the tag span ID from `currentTagSpan[level]`.
- Look up that tag in the `versionTags` array.
- Get the tag set ID from the `tagSet` property.
- Find all the tags in the `versionTags` array that have the same tag set ID, and for each of these:
  - Get the start and end positions of the tag.
  - Highlight those text ranges in the editor, using the color specified for that nesting level.

#### Example

For example, let's say we have the following at the beginning of a Markdown file:

```markdown
This text is unversioned, {% ifversion ghes %}this is versioned for ghes{% endif %} and this is unversioned.
My favorite version is {% ifversion ghec %}GHEC{% elsif fpt %}Free/Pro/Team{% else %}NOT GHES and NOT
Free/Pro/Team{% endif %}.
```

At the beginning of this text, at the start of the file, the `tagSetID`, `versionDescription` and `currentTagSpan` arrays are all empty: we haven't found any versioning yet. We start processing the first version tag. For each tag we encounter we:
- Increment the tag counter to create a unique ID for the tag. The ID is 1 for the first tag in the file.
- Work out the start and end positions of the tag (i.e. the position of `{` and `}`).
- Detect whether we've reached or gone past the cursor position.

The first tag is an `ifversion`. For each `ifversion` tag we encounter we:
- Increment `nestingLevel` from -1 to 0 (indicating an un-nested tag set).
- Assign the tag counter value to `tagSetID[nestingLevel]` to record the tag set for this tag.

If the cursor position is before the end of this, the first tag in the file, then the text at that point is unversioned. If we haven't yet reached the cursor position, we:
- Assign the tag counter value to `currentTagSpan[nestingLevel]` to store the ID of the tag span we're currently processing. If the cursor is within this tag span, this value will remain in this array element at the end of parsing, telling us which tag span(s) affect the text at the cursor position.
- Collect the version details (e.g. "ghes") to use for the version description message. If the cursor is within this tag span then we'll use this string as one of the versions applied to the text. If the cursor is within an `else` tag span of the same tag set, we'll negate this version ("NOT ghes") in the message we display.

We can now call a function to add a new element in the `versionTags` array. The object that makes up this new element contains:
- The unique ID of the tag (which, for this first tag, is 1).
- The tag set number that identifies the tag set the tag belongs to (also 1).
- The start position of the tag.
- The end position of the tag.

Then we process the next tag (`endif`), going through the same process and creating a `versionTags` element for this tag, which has the ID 2 and the tag set number 1 (i.e. it's in the tag set of the `ifversion` tag with ID 1). If the cursor position is before the end of this tag (i.e. it's somewhere in "this is versioned for ghes"), then the versioning at the cursor point is "ghes". We can now stop assigning anything to the `currentTagSpan` and `versionDescription` arrays as we proceed through the rest of the file, because we now have enough information to work out which tag set(s) to highlight for the cursor position, and none of the version tags after this point will affect the text at the cursor position. When the parsing phase completes, with the cursor within the first `ifversion` tag span in the Markdown shown above, `versionDescription` will contain one element, with the value "ghes", and `currentTagSpan` will contain one element with the value 1.

If the cursor position is after the end of the `endif` tag, we use the `pop()` method on each of three arrays to delete the last element of the array:
- `versionDescription` - in this case we delete `versionDescription[0]` which contains "ghes". We delete this because this description no longer applies to the text at the cursor position. If the `endif` tag had been part of a nested tag set at this point we'd delete `versionDescription[1]` which would return us to the un-nested versioning: "ghes". By deleting `versionDescription[0]` we have an empty `versionDescription` array again, which indicates we're back in unversioned text again, with no versioning message to display.
- `elsedVersions` - we collected versions here to use for an `else` tag span if we encountered one. Now that we're leaving this tag set we no longer need these versions, so we delete them.
-`currentTagSpan` - in this case we delete `currentTagSpan[0]` which contains the ID of the tag previous to `endif`, in this case the `ifversion` tag. We know the cursor isn't in that tag span, or any span in the tag set we're leaving, so we need to delete this element of the array. If the `endif` tag had been part of a nested tag set at this point we'd delete `currentTagSpan[1]` which would leave `currentTagSpan` containing the ID of the parent span in which the nested tag set we've just left was contained. By deleting `currentTagSpan[0]` we have an empty `currentTagSpan` array again, which indicates we're back in unversioned text again, with no tags to highlight.

Finally, for all `endif` tags, we decrement `nestingLevel` from 0 back to -1, indicating that we're no longer in versioned text.

Now let's say the cursor position is somewhere within "Free/Pro/Team" in the above extract.

After processing the first `endif` tag we move on to the second `ifversion` tag. We now:
- Increment the tag counter to 3. This is the unique ID for this, the third tag in the file.
- Get the start and end positions of the tag (i.e. the position of `{` and `}`).
- Increment `nestingLevel` from -1 to 0.
- Assign the tag counter value to `tagSetID[nestingLevel]`.
- Assign the tag counter value to `currentTagSpan[nestingLevel]`.
- Create a new element in the `versionTags` array, containing the unique ID, the tag set number, and the start and end positions of the tag.
- Check whether the cursor position is after the end position of the tag. It is, so we:
- Assign the version "ghec" to `versionDescription[nestingLevel]`.
- Assign the tag ID to `currentTagSpan[nestingLevel]`.

Note: at this un-nested level of versioning we're assigning values to the `0` element of the `tagSetID`, `versionDescription` and `currentTagSpan` arrays. If we were in a tag set that was in one level of nesting within an un-nested tag set, we'd be assigning values to the `1` element of these arrays.

We then process the next tag: `{% elsif fpt %}`, giving it the ID 4 and the tag set number 3 (the ID of the related `ifversion`). The cursor position is after the end of this tag so we go through the same process, creating a new entry in `versionTags` for the tag, changing the value of `versionDescription[0]` to "fpt" and assigning the tag ID (4) to `currentTagSpan[0]`.

Then we process `{% else %}` (tag ID 5 and tag set number 3). At this point the cursor is before the end of the tag so we don't change the `versionDescription` and `currentTagSpan` arrays. From here on we only update the `versionTags` array, adding new elements for each tag in the file.

Note:
- We only need to build the versioning description array for tags before the cursor position because the versioning of a cursor position is only ever specified by `ifversion`, `elsif`, or `endif` tags before that point in the file.
- We need to build tag details for every tag in the file because at least one tag in the current tag set is always after the current cursor position. For example, you may have an `ifversion` tag very near the start of a long file, and the cursor position may be just after that tag, but the closing `endif` tag for that tag set may be right at the end of the file, and we're going to want to highlight all of the tags in that tag set irrespective of whether they come before or after the cursor.

Now, with the cursor position somewhere within "Free/Pro/Team" in the above extract, when we reach the end of the parsing phase, there is only one element in `versionDescription` and it contains "fpt". The `currentTagSpan` also has only one element and it is set to 4, meaning the cursor is within the tag span of the fourth tag in the file: `{% elsif fpt %}`.

#### Results of parsing

At the end of the parsing phase:

- `currentTagSpan` is an array of tag ID numbers (one per nesting level) that tells us which tag spans contain the current cursor position. The last element in the `currentTagSpan` array tells us which tag span the cursor is directly within. If there is just one element, the cursor is within an un-nested tag set. If there are two or more elements, the cursor is within a nested tag set, with `currentTagSpan[level]` identifying the containing tag span at each nesting level. If this array is empty then there's no versioning at the cursor position.
- `versionDescription` is an array of strings (one per nesting level) that we can use to assemble a complete description of the versioning at the cursor position. `versionDescription[0]` contains the description of un-nested versioning. In most cases this will be the only element in this array, because nesting isn't very common. Where there is nesting `versionDescription[1]` will contain the description of the versioning for the first level of nesting. A description could be very simple, such as "ghec" or, if the cursor is within an `else` tag span that follows several `elsif` tags in a tag set, it could be a longer string, such as "NOT fpt or ghec\nAND NOT ghes = 3.7\nAND NOT ghes".
- `versionTags` is an array of tag objects that tell us which characters in the editor to highlight for a particular tag, and which tag set the tag belongs to. This allows us to look up the tag sets to highlight when the cursor is within any given tag span.

### 2. Highlighting tags and displaying a versioning message

Having parsed the contents of the Markdown file, we now have the `currentTagSpan` array for working out which tags to highlight, and the `versionDescription` array for assembling a message about versioning to display to the user.

#### Highlighting the relevant version tags

Highlighting is done in the `highlightVersionTags()` function.

First we create and populate the `colorPairs` array which contains the colors to be used to highlight the tag sets. We use an array because we're going to highlight each set of tags, at different nesting levels, in a different color. We get the contents of this array from the `settings.json` file. The array values are written to the `settings.json` file, if they don't already exist, when the extension is first installed. The user can then edit the values in the `settings.json` file to change the colors used for highlighting. This is achieved by specifying the array in the extension's `package.json` file, as follows:

```typescript
"configuration": {
  "type": "object",
  "title": "Versioning Extension Configuration",
  "properties": {
    "version-identifier.colorPairs": {
      "type": "array",
      "default": [
        {
          "backgroundColor": "darkred",
          "color": "white"
        },
        {
          "backgroundColor": "darkblue",
          "color": "yellow"
        },
        {
          "backgroundColor": "green",
          "color": "black"
        }
      ],
      "description": "Color pairs",
      "items": {
        "type": "object",
        "properties": {
          "backgroundColor": {
            "type": "string"
          },
          "color": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

The object in each element of the array has a pair of properties: the background color of the highlighting, and the color of the text. We define three color pairs. It's rare to have more than one level of nesting, so we'll usually only need two pairs of colors, but we define three for the very rare instances of double-nesting.

The tag set the cursor is directly within will use the first color pair. If this tag set is nested then the parent tag set will be highlighted using the second color pair, and so on. If there are additional levels of nesting in the Markdown we'll cycle back through the array of colors again.

We then iterate backwards through the `currentTagSpan` array, starting with the last element in the array. This array contains one element for each level of nesting, starting with the most nested tag set the cursor is within, and ending with the un-nested ancestor tag span. So, in most cases, where versioning is un-nested, there will only be one element in this array. The value of each element in the `currentTagSpan` array is a tag ID.

Now, within this iteration of the nesting level loop, we then use `vscode.window.createTextEditorDecorationType` to define the decoration we want to use for the tag set that this tag span belongs to. The definition consists of a pair of colors, which we pluck from the `colorPairs` array.

We add this definition to an array of decoration types that we declared at the start of the TypeScript file. We'll use this array later when we want to dispose of (i.e. remove) the decorations. We put it in an array so that we can dispose of all of the decoration types (i.e. the color pair for each nesting level) in a single operation.

Then we create `decorationsArray` containing `vscode.DecorationOptions` types. The only options we'll use are the positional range for each decoration (i.e. the start and end position of the tag we want to highlight). We'll fill up this array with details of all of the text ranges we want to highlight with this decoration type (i.e. all the tags in a tag set that we want to decorate with same color highlighting).

Still within the loop for the tag span ID at this nesting level, we:
- Get, from the `versionTags` array, the tag object for this tag span.
- Get the ID of the tag set this tag belongs to.
- Filter the `versionTags` array to get a subset array containing only those tag elements that have the same tag set ID as the one we just identified.
- For each tag object in this filtered array, get the start and end positions as a vscode.Range, and push this into `decorationsArray` (i.e. the tags we want to decorate with the same color of highlighting).

Finally, within the nesting level loop, we use `activeEditor.setDecorations` to apply the specified decoration type to all of the ranges in the `decorationsArray` array.

Then, if there's version nesting, we iterate through the loop again, applying another color to the tags in the parent tag set.

For more information about applying decorations to text in VS Code, see https://github.com/microsoft/vscode-extension-samples/blob/main/decorator-sample/USAGE.md.

#### Removing the highlighting

When the user presses the Escape key, or moves the cursor, we want to remove the highlighting. We do this by disposing of the decoration types we created earlier.

The code to do this is in the extension's `activate` function, near the top of the TypeScript file:

```typescript
// Register a command to remove the decorations.
// The command is defined in package.json and is bound to the escape key
let removeDecorationsDisposable = vscode.commands.registerCommand(
        'version-identifier.removeDecorations', () => {
    // Remove all of the decorations that have been applied to the editor:
    decorationDefinitionsArray.forEach(decoration => decoration.dispose());
    decorationDefinitionsArray = [];
});

// Listen for selection changes in the editor
let removeDecorationsOnCursorMove =
vscode.window.onDidChangeTextEditorSelection(() => {
    decorationDefinitionsArray.forEach(decoration => decoration.dispose());
    decorationDefinitionsArray = [];
});
```

Any time the Escape key is pressed, or the cursor is moved, we iterate through the `decorationDefinitionsArray` array, running `decoration.dispose()` on each element. This removes the highlighting from the editor. We then empty the array.

We link the Escape keypress to the `version-identifier.removeDecorations` command in the `keybinding` section of the extension's `package.json` file:

```json
"keybindings": [
  {
    "command": "version-identifier.runExtensionToast",
    "key": "ctrl+cmd+v",
    "mac": "ctrl+cmd+v",
    "when": "editorTextFocus"
  },
  {
    "command": "version-identifier.runExtensionModal",
    "key": "shift+ctrl+cmd+v",
    "mac": "shift+ctrl+cmd+v",
    "when": "editorTextFocus"
  },
  {
    "key": "escape",
    "command": "version-identifier.removeDecorations",
    "when": "editorTextFocus"
  }
],
```

Note: users can change any of the keybindings to whatever they prefer by editing their preferences - see: https://github.com/docs/version-identifier/blob/main/README.md#keyboard-shortcuts.

#### Displaying a versioning message

The extension allows you to display the versioning message either as a "toast" popup, which appears briefly at the bottom right of the VS Code editor, or as a modal dialog box, which the user has to dismiss before they can continue working in the editor. The user can choose which of these they prefer, by using a different shortcut or command in the Command Palette to run the extension. If you just want to know what the versioning is at the cursor position then you'll probably prefer the modal dialog box. If you're more interested in identifying the relevant tags (e.g. because you want to remove some versioning) then you'll probably prefer the toast popup.

The message is built up from the `versionDescription` array. Included in the message are details of the cursor position, which we derive from the `cursorPosition` constant. And we create the variable `positionString` to hold the part of the message that describes the cursor position:

```typescript
const lineNum = cursorPosition.line + 1;
const charNum = cursorPosition.character + 1;
let positionString = `at the cursor position (line ${lineNum}, character ${charNum})`;
```

Note: We add 1 to the line and character values to allow for the fact that the first line in the file and the first character in a line are counted as 0.

If the `versionDescription` array is empty then there's no versioning at the cursor position so we'll display the message:

`"There is no inline versioning " + positionString + "."`

If `versionDescription` array is not empty we iterate through the array building up the message in the string variable `versioningString`. Typically versioning is un-nested so there's only one element and the message is simple. The following untypical example contains two levels of nesting. Let's say the cursor is within the text "CodingStars" in the twice-nested `ifversion` tag span:

```markdown
{% ifversion some-feature-based-versioning %}
... some text here ...

  {% ifversion ghec or ghes %}

  ... within the product called {%ifversion ghes %}CodingStars{% elsif ghec %}LGTM{% endif %} there is ...

  {% endif %}

... more text here ...
{% endif %}
```

In this case the `versionDescription` array will contain:

| Element               | Value |
| --------------------- | ----- |
| versionDescription[0] | some-feature-based-versioning |
| versionDescription[1] | AND ghec or ghes |
| versionDescription[2] | AND ghes |

So the contents of `versioningString` will be: `some-feature-based-versioning \nAND ghec or ghes \nAND ghes` and the message will be:

`"The inline versioning " + positionString + " is:\n\n" + versioningString + "."`

Let's take another example, this time with just one level of versioning but where the cursor is within an `else` tag span, which negates the versioning in the preceding tags in the tag set.

In the following Markdown, let's say the cursor is within the text "GitHub Code Scanning" in the `else` tag span:

```markdown
{% ifversion ghec or ghes > 3.8 %}

... within the product called {%ifversion ghes = 3.9 %}CodingStars{% elsif ghes = 3.10 %}LGTM{% else %}GitHub Code
Scanning{% endif %} there is ...

{% endif %}
```

In this case the `versionDescription` array will contain:

| Element               | Value |
| --------------------- | ----- |
| versionDescription[0] | ghec or ghes > 3.8 |
| versionDescription[1] | AND NOT ghes = 3.9 \nAND NOT ghes = 3.10 |

Now the contents of `versioningString` will be: `ghec or ghes > 3.8 \nAND NOT ghes = 3.9 \nAND NOT ghes = 3.10`.

## Reference

### Variables and constants in alphabetical order

The following variables and constants are used in the script. Except where marked, these are variables.

- **activeEditor**: an instance of the `TextEditor` class provided by the VS Code API. This instance represents the currently active text editor in VS Code.
- **closingBracketPos**: (constant) the number of the character after the last character matched by the regular expression within the entire searched string (i.e. within the entire Markdown file). This is the position of the charater after the `}` of a tag.
- **colorIndex**: a number used to step through the colors in the `colorPairs` array.
- **colors**: a color pair object. This contains one pair of colors from the `colorPairs` array.
- **config**: the configuration named "version-identifier". We extract this from the `settings.json` file. It contains the color pairs we'll use to highlight tags.
- **cursorIsAfterTag**: Boolean. This is set to true initially. We set it to false as soon as we get to a tag that comes after the cursor positiion during the parsing phase. This allows us to stop assigning version text to the `versionDescription` array.
- **currentTagEnd**: (constant). The `vscode.position` of the character after the `}` of the tag currently being processed.
- **currentTagSetID**: a number. This short-lived variable is just used to store the tag set ID of the tag we're currently processing when working out which tags to highlight.
- **currentTagSpan[]**: an array of numbers. We store and retrieve values by using `nestingLevel` (i.e., `currentTagSpan[nestingLevel]`). The numbers identify the tag span (and possibly ancestor tag spans) in which the cursor is located. The last element in this array contains the ID of the tag span within which the cursor is directly located. Initially this array is empty, meaning the cursor is not within a tag span. Knowing the current tag span (and any ancestor spans), we can use the tag properties to find out which tag set(s) to highlight.
- **currentTagStart**: (constant). The `vscode.position` of the `{` of the tag currently being processed.
- **cursorIsAfterTagEnd**: a Boolean that we use when processing `endif` tags to work out whether the cursor is within the tag, or whether we need to step out of the current version tag set.
- **cursorIsAfterTagStart**: a Boolean that we use to keep track of whether we've reached the cursor position yet - i.e. whether the tag being processed during parsing affects the text at the cursor position.
- **cursorPosition**: (constant) a `vscode.Position` (i.e. a line number and the number of character on that line where the cursor currently sits).
- **decorationDefinition**: a single decoration type object. We populate the `backgroundColor` and `color` properties of this object with details from the `colors` variable (i.e. one pair of colors).
- **decorationDefinitionsArray**: an array of `vscode.TextEditorDecorationType` types. Each element in this array is the decoration type for one level of version nesting (including un-nested versioning). We collect the decoration types in this array so that we can iterate through it "disposing" of them when we want to remove the highlighting.
- **decorationsArray[]**: a `vscode.DecorationOptions` array. Each element of this array will hold the positional range (i.e. a start and end position in the editor) for one tag to be highlighted for one tag set.
- **description**: a string. The contents of one element of the `versionDescription` array. We use this short-lived variable when putting together the version message to display to the user.
- **disposableModal**: a VS Code command we've created. We use this variable for the result of creating a command to run the extension. We then push this to VS Code's `context` object which it uses to keep track of resources like commands, listeners, and other disposables that should be cleaned up when the extension is deactivated.
- **disposableToast**: another VS Code command for running the extension, but when this command is used to run the extension the version message will be displayed in a "toast" popup rather than a modal dialog box.
- **elsedVersions[]**: an array of strings. As we're parsing through the a tag set, we build a string for each nesting level to use if we reach an `else` tag for the current tag set. The string contains an NOT-ed list of the versions in the `ifversion` and and `elsif` tags in the tag set. For example, if the tag set contains `{% ifversion ghes %} ... {%elsif ghec %} ... {% else %}` then, when we reach the `else` tag `elsedVersions[nestingLevel]` will contain "NOT ghes \nAND NOT ghec". The first time we add a version string to this array `elsedVersions[0]` we prepend "NOT ", and for any subsequent strings in any element of the array we prepend " AND NOT ". If a tag set contains an `else` tag we assign the value of `elsedVersions[nestingLevel]` to `versionDescription[nestingLevel]`.
- **highlightBackgroundColor[]**: (constant) an array of strings. Each nesting level, including none, has a different background color. For instance: `highlightBackgroundColor[0]`, for tags in an un-nested tag set, might be "red".
- **highlightForegroundColor[]**: (constant) an array of strings. The color of the text in the highlighted tags at each nesting level. Generally, where the background colors are all strong/dark colors, all elements of `highlightForegroundColor` will be set to "white".
- **match[]**: an array of strings. This is used to store the text matched by the regular expression that we use to find version tags in the Markdown file.
- **matchingTags[]**: a subset of the `versionTags` array, containing just the tag objects for one tag set.
- **message**: a string. This short-lived variable is just used to assemble the final message text that we'll display to the user.
- **nestingLevel**: a number. This records the nesting level of versioning at the cursor position. When we start parsing the Markdown file, this is set to -1. Each time we find an `ifversion` tag, during parsing, we increment this value. So at the first `ifversion` tag, `nestingLevel` gets incremented to 0. A nesting level of 0 means there's versioning, but we're in a base level tag set with no nesting. Each time we find an `endif` tag we decrement this value. So, if we reach the end of an un-nested tag set without encountering another `ifversion` tag then we decrement `nestingLevel` back to -1 (no versioning).
- **openingBracketPos**: (constant) the number of the first character matched by the regular expression within the entire searched string (i.e. within the entire Markdown file).
- **positionString**: (constant) a string containing " at the cursor position (line _n_, character _n_) ". We use this in the message displayed to the user.
- **range**: (constant) an individual `vscode.Range` object that specifies the start and end position of a version tag.
- **ranges[]**: an array of `vscode.Range` objects. Each element of this array identifies the start and end a range of text (a tag) that we'll highlight in the VS Code editor.
- **removeDecorationsDisposable**: a VS Code command we've created to dispose of the text decorations in the `decorationDefinitionsArray` array.
- **removeDecorationsOnCursorMove**: a VS Code listener that disposes of the text decorations in the `decorationDefinitionsArray` array whenever the cursor is moved after you run the extension.
- **tagCounter**: a number. Each version tag in the Markdown file gets a unique ID. During parsing of the file, each time we come to another tag we increment this number.
- **tagID**: a number used to identify a particular version tag. We use this when iterating through the tag IDs in the `currentTagSpan` array.
- **tagObject**: one element extracted from the `versionTags` array. This contains the tag ID, tag set ID, and start and end positions for a single tag.
- **tagRegEx**: (constant) a regular expression for finding version tags.
- **tagSetID[]**: an array of numbers. Each version tag belongs to a tag set. The tag set ID is the ID of the `ifversion` tag for that tag set. During parsing of the file, each time we come to another `ifversion` tag we set `tagSetID[nestingLevel]` to the newly incremented `tagID`. We can then assign this value to the `tagSet` property of each tag object we create for the tags in this tag set.
- **text**: (constant) a string containing the entire text of the active VS Code editor tab.
- **versionDescription[]**: an array of strings. Each nesting level, including none, has a description of the versioning at that level. `versionDescription[0]` contains the description of un-nested versioning. In most cases this will be the only element in this array, because nesting isn't very common. Where there is nesting `versionDescription[1]` will contain the description of the versioning for the first level of nesting. A description could be very simple, such as "ghec" or, if the cursor is within an `else` tag span that follows several `elsif` tags in a tag set, it could be a longer string, such as "NOT fpt or ghec\nAND NOT ghes = 3.7\nAND NOT ghes".
- **versioningString**: a string. This is the string that we'll build up from the `versionDescription` array and use to display a message to the user.
- **versionTags[]**: an array of objects. This array stores details of all the version tags in the file. Each element of this array is an object representing one tag, with the properties of the object each describing one feature of that tag, such as a unique ID for each tag, an ID identifying the tag set the tag belongs to, the start and end positions of the tag within the file, etc.

### Tag object properties

Each element of the `versionTags` array is an object containing the following properties:

- **tagID**: a number. Each version tag in the Markdown file gets a unique ID. We get this number from the `tagCounter` variable.
- **tagSet**: a number that identifies which tag set the tag belongs to. This is always the ID of the `ifversion` tag in the same tag set.
- **positionVersionTagStart**: a vscode.Position that contains the line number (positionVersionTagStart.line) and character number within the line (positionVersionTagStart.character) of the first character (`{`) of the version tag.
- **positionVersionTagEnd**: a vscode.Position that contains the line number (positionVersionTagStart.line) and character number within the line (positionVersionTagStart.character) of the last character (`}`) of the version tag.= 3.6".

### Per-tag explanation

This is a recap of what we do for each type of version tag we find when we're parsing through the Markdown file.

#### All tags

We do the following for every tag we encounter during parsing.

- Increment `tagCounter`, to use as a unique ID for this tag. This variable needs to survive from one tag processing to the next.
- Get the start and end positions of the tag (i.e. the position of `{` and `}`) and assign them to `positionVersionTagStart` and `positionVersionTagEnd`. We do this using the `match` array that contains the tag text (e.g. `{% ifversion ghes %}`) that we found using the regular expression. We do this as follows:

  ```typescript
    // match.index is the number of the first character of the match
    // within the entire searched string (i.e. the entire Markdown file)
    const openingBracketPos = match.index;
    const currentTagStart = activeEditor.document.positionAt(openingBracketPos);
    // match[0] is the matched text (e.g. `{% ifversion ghes %}`).
    // This gives us the position of the character after the closing bracket
    const closingBracketPos = match.index + match[0].length;
    const currentTagEnd = activeEditor.document.positionAt(closingBracketPos);
  ```

  Note: that `currentTagEnd` is actually the character after the closing bracket.

- Check whether the cursor position is after the start of the current tag (in which case the tag may affect the text at the cursor position). If it's not we set `cursorIsAfterTagStart` to `false`.
- Check whether the cursor position is after the end of the current tag. If it's not we set `cursorIsAfterTagEnd` to `false`. We only use this for `endif` tags.
- Create a new element in the `versionTags` array, containing these properties:
  - **tagID**: The unique ID (`tagCounter` number).
  - **tagSet**: The tag set ID (`tagSetID[nestingLevel]` number).
  - **positionVersionTagStart**: The start position of the tag (`positionVersionTagStart` vscode.Position).
  - **positionVersionTagEnd**: The end position of the tag (`positionVersionTagEnd` vscode.Position).

#### `ifversion`

When we find an `ifversion` tag we:
- Increment `nestingLevel`. Initially this is -1, so this becomes 0 for an un-nested tag set and 1 for the first nesting level. This variable needs to survive from one tag processing to the next.
- Assign `tagCounter` to `tagSetID[nestingLevel]`. This is the ID of the tag set that this tag belongs to (always the same as the ifversion ID). This array needs to survive from one tag processing to the next.
- If `cursorIsAfterTagStart` is true we:
  - Assign `tagCounter` to `currentTagSpan[nestingLevel]`. This array needs to survive from one tag processing to the next so that we can determine which tag span the cursor is currently within, and therefore which tags we need to highlight.
  - Get the version from the tag (e.g. "ghes"), using `match[2]` from the regular expression.
  - Assign the `match[2]` to `versionDescription[nestingLevel]` for an un-nested tag set. For nested tag sets assign `"AND " + match[2]` (e.g. "AND ghes").
  - Assign `"NOT " + match[2]` to `versionDescription[nestingLevel]` for an un-nested tag set. For nested tag sets assign `"AND NOT " + match[2]` (e.g. "AND NOT ghes"). This variable needs to survive from one tag processing to the next, so that we can build up a string that describes the versioning for the `else` tag in the tag set.

#### `elsif`

When we find an `elsif` tag:
- If `cursorIsAfterTagStart` is true we:
  - Assign `tagCounter` to `currentTagSpan[nestingLevel]`. 
  - Assign the version to `versionDescription[nestingLevel]`, prepending "AND " if we're in a nested tag set.
  - Set `elsedVersions[nestingLevel]` to `elsedVersions[nestingLevel] + " \nAND NOT " + match[2]` (e.g. "NOT ghes \nAND NOT ghec").

Note that we don't assign a value to `tagSetID[nestingLevel]` because this tag doesn't start a new tag set. It belongs to the same tag set as the `ifversion` tag. So we use the same `tagSetID[nestingLevel]` value that we set for the `ifversion` tag.

#### `else`

When we find an `else` tag:
- If `cursorIsAfterTagStart` is true we:
  - Assign `tagCounter` to `currentTagSpan[nestingLevel]`. 
  - Assign the `elsedVersions[nestingLevel]` to `versionDescription[nestingLevel]`, prepending "AND " if we're in a nested tag set.

#### `endif`

When we find an `endif` tag:
- If `cursorIsAfterTagEnd` is true we:
  - Delete the last element in the `currentTagSpan`, `versionDescription` and `elsedVersions` arrays.

As with `elsif` we again reuse the unmodified `tagSetID[nestingLevel]` value that we set for the `ifversion` tag.

Note: the cursor can never be within an `endif` tag span, because `endif` tags have no tag span. So we'll never use the `tagID` or `versionDescription` properties of an `endif` tag. We'll only use the `tagSet` property (to identify the `endif` tag to highlight when the cursor is somewhere else within this tag set) and the `positionVersionTagStart` and `positionVersionTagEnd` properties (to tell VS Code which characters to highlight for this tag).

After we create the `versionTags` entry for this `endif` tag, we decrement `nestingLevel`. We do this because, after each `endif` tag, we step out of a level of nesting, or out of versioning altogether this is the `endif` for an un-nested tag set (in which case `nestingLevel` returns to -1).

### Regular expression

We use the following regular expression to find version tags in the Markdown file:

```typescript
const tagRegEx = /\{%-?\s*(ifversion|elsif|else|endif)\s+([^%]*)%\}/g;
```

This regular expression has two capture groups:
1. The first capture group captures the tag type (e.g. `ifversion`).
2. The second capture group captures the version (e.g. `ghes`).

#### The regular expression broken down

`\/`: This starts the regular expression.

`\{%-?`: This matches the literal string `{%` optionally followed by a `-`.

`\s*`: This matches zero or more whitespace characters.

`(ifversion|elsif|else|endif)`: This matches any one of the strings "ifversion", "elsif", "else", or "endif".

`\s+`: This matches one or more whitespace characters.

`([^%]*)`: This matches any character that is not a `%` zero or more times.

`%\}`: This matches the literal string `%}`.

`\/g`: This ends the regular expression. The `g` flag means that the regular expression should be tested against all possible matches in a string it's applied to (in our case, the entire contents of the Markdown file).

#### Using the regular expression

We use the regular expression like this:

```typescript
let match: RegExpExecArray | null;
while (match = tagRegEx.exec(text)) {
  ...
}
```

The `while` loop will keep running until the regular expression fails to match anything in the text. Each time the regular expression matches something, it returns an array of strings (`match`). The first element in the array (`match[0]`) is the entire string that matched the regular expression. The second element in the array (`match[1]`) is the first capture group (the tag type - e.g. "ifversion"). The third element (`match[2]`) is the second capture group (the version - e.g. "fpt or ghec").

### The package.json file

The [package.json](https://github.com/docs/version-identifier/blob/main/package.json) file contains metadata about the extension, and other information that VS Code needs to run the extension. In this project we use this file to define the commands that can be used to run the extension, and the keybindings for those commands. We also specify the highlighting color pairs here. These configurations are added to the user's `settings.json` file where the user can modify them as they wish.

The file is used by the VS Code Marketplace for displaying various information there about the extension.
