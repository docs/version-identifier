
# Code description

The purpose of this extension is to identify the versioning that applies at the current cursor position within a Markdown file.

The code is written in TypeScript. This file describes how the code works.

## Contents

- [Terminology](#terminology)
- []()
- []()
- []()
- []()
- []()
- []()
- []()

## Terminology

The following key terms are used to explain how the extension was coded.

### Tag sets

When you version some text within Markdown, you do so using a set of Liquid tags, such as `{% ifversion some-version-name %}`, `{% elsif alternative-version %}`, `{% else %}`, `{% endif %}`.

A tag set:
- Always starts with an `ifversion` tag.
- Can optionally have one or more `elsif` tags.
- Can optionally have one `else` tag.
- Always ends with an `endif` tag.

### Tag spans

A tag span is the text to which a tag applies. In an un-nested tag set, a tag span begins after the `}` of a version tag and ends with the `}` of the next tag. The `endif` tag has no tag span. For example:

```
This text does not belong to a tag span, {% ifversion some-version-name %}this is the ifversion tag span,
{% elsif alternative-version %}this is the tag span for an elsif clause, {% else %}this is the tag span for
an else clause, {% endif %}and this does not belong to a tag span.
```

If a tag span contains within it a nested tag set, then the tag span will be interrupted by the nested tag set and will continue after the end of the nested tag set.

The cursor is always within 0 or 1 tag span. By identifying which tag span the cursor is currently within, we can determine the versioning for that text. If the cursor is not within a tag span then the text is unversioned.

TODO ---- WHAT HAPPENS WHEN THE CURSOR IS NOT WITHIN THE MARKDOWN FILE. CAN YOU RUN AN EXTENSION WITHOUT THE CURSOR IN A FILE? DO I NEED TO CHECK THAT A) THE CURRENT FILE IS A MARKDOWN FILE AND B) THERE'S A CURSOR POSITION?

### Version nesting

In most places, versioning is not nested, so only one version tag determines the versioning for the text at the cursor position. However, one tag set may be nested within another. For example,

```
{% ifversion baselevel %}

This text is versioned for "baselevel".

{% ifversion fpt or ghec %}

This ifversion/endif tag set is nested (i.e. nesting level 1).
Now the versioning is "baselevel AND (fpt or ghec)".

{% endif %}

Now we're back to "baselevel" versioning again.

{% endif %}
```

## How the code works

There are 2 main phases:
1. Parsing the Markdown file and working out the versioning for the text at the cursor position, and which Liquid tags to highlight.
2. Displaying a message detailing the versioning, and highlighting the revelant tags in the editor.

### 1. Parsing the Markdown file

First we find the cursor position within the Markdown file and assign this to the constant `cursorPosition`:

```
const cursorPosition = activeEditor.selection.active;
```

We then use a regular expression to search through the entire text of the file identifying version tags and processing each one of them, one tag at a time, as they are found.

At the end of the parsing phase we will have:
- The ID of tag span within which the cursor is located.
- An array of tag objects that will tell us which tag set(s) to highlight.
- An array of strings that we'll use to build a message telling the user what versioning applies at the cursor position.

#### Processing each version tag

While stepping through the file, one tag at a time, we're building three arrays:

a) An array called `versionTags` that contains details of all the version tags in the file. Each element of this array is an object representing one tag. The properties of this object describe features of the tag: its unique ID, another ID that identifies the tag set the tag belongs to, and the start and end positions of the tag it the VS Code editor.

b) A `versionDescription` array that will contain the description of the versioning at each level of nesting (i.e. `versionDescription[0]` contains the versioning description for un-nested versioning, `versionDescription[1]` contains the versioning description for the first level of nested versioning, and so on). Generally the array will only have `versionDescription[0]`. The combined elements in this array provides the message we'll display to users. As we parse through the file we'll modify this array as we encounter `ifversion`, `elsif`, `else`, and `endif` tags, until we reach the cursor position. At the end of parsing, this array will contain the versioning description for the cursor position.

c) The `currentTagSpan[nestingLevel]` array that will allow us to work out which tags to highlight in the editor. Each element of this array contains the ID of the tag span that affects the text at the cursor position. So the final element in the array always tells us which tag span the cursor is currently directly within. If there are two elements in the array then the cursor is within a nested tag set, with `currentTagSpan[1]` identifing the tag span for the cursor position, and `currentTagSpan[0]` identifing the tag span within which the nested tag set is located. If there's only one element in the array then the cursor is within an un-nested tag set. If there are no elements in the array then there's no versioning at the cursor position.

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

```
This text is unversioned, {% ifversion ghes %}this is versioned for ghes{% endif %} and this is unversioned.
My favorite version is {% ifversion ghec %}GHEC{% elsif fpt %}Free/Pro/Team{% else %}NOT GHES and NOT
Free/Pro/Team{% endif %}.
```

At the beginning of this text, at the start of the file, the `tagSetID`, `versionDescription` and `currentTagSpan` arrays are all empty: we haven't found any versioning yet. We then process the first tag: `ifversion`. We:
- Increment the tag counter to create a unique ID for the tag. The ID is 1 for the first tag in the file.
- Increment `nestingLevel` from -1 to 0 (indicating an un-nested tag set).
- Assign the tag counter value to `tagSetID[nestingLevel]` to record the tag set for this tag.
- Work out the start and end positions of the tag (i.e. the position of `{` and `}`).

We can now call a function to add a new element in the `versionTags` array. The object that makes up this new element contains:
- The unique ID of the tag (1).
- The tag set number that identifies the tag set the tag belongs to (1).
- The start position of the tag.
- The end position of the tag.

If the cursor position is before the end of this, the first tag in the file, then the text at that point is unversioned. If the cursor position is after the `}` of this tag, we assign the version "ghes" to `versionDescription[0]`, and we assign the ID of the tag to `currentTagSpan[0]`.

Then we process the next tag (`endif`), going through the same process and creating a `versionTags` element for this tag, which has the ID 2 and the tag set number 1 (i.e. it's in the tag set of the `ifversion` tag with ID 1). If the cursor position is before the end of this tag (i.e. it's somewhere in "this is versioned for ghes"), then the versioning at the cursor point is "ghes". We can now stop assigning anything to the `currentTagSpan` and `versionDescription` arrays as we proceed through the rest of the file, because we now have enough information to work out which tag set(s) to highlight for the cursor position, and none of the version tags after this point will affect the text at the cursor position. When the parsing phase completes, with the cursor within the first `ifversion` tag span in the Markdown shown above, `versionDescription` will contain one element, with the value "ghes", and `currentTagSpan` will contain one element with the value 1.

If the cursor position is after the end of the `endif` tag, we do three things:
- We use `versionDescription.pop()` to delete the last element of the `versionDescription` array (in this case `versionDescription[0]` which contains "ghes"), because this description no longer applies to the text at the cursor position. If the `endif` tag had been part of a nested tag set at this point we'd delete `versionDescription[1]` which would return us to the un-nested versioning: "ghes". By deleting `versionDescription[0]` we have an empty `versionDescription` array again, which indicates we're back in unversioned text again, with no versioning message to display.
- We delete the last element of the `currentTagSpan` array (in this case `currentTagSpan[0]` which contains the ID of the tag previous to `endif`, in this case the `ifversion` tag). If the `endif` tag had been part of a nested tag set at this point we'd delete `currentTagSpan[1]` which would leave `currentTagSpan` containing the ID of the parent span in which the nested tag set we've just left was contained. By deleting `currentTagSpan[0]` we have an empty `currentTagSpan` array again, which indicates we're back in unversioned text again, with no tags to highlight.
- Decrement `nestingLevel` from 0 back to -1, indicating that we're no longer in versioned text.

Now let's say the cursor position is somewhere within "Free/Pro/Team" in the above extract.

After processing the first `endif` tag we move on to the second `ifversion` tag. We now:
- Increment the tag counter to 3. This is the unique ID for this, the third tag in the file.
- Increment `nestingLevel` from -1 to 0.
- Assign the tag counter value to `tagSetID[nestingLevel]`.
- Get the start and end positions of the tag (i.e. the position of `{` and `}`).
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
- `versionDescription` is array of strings (one per nesting level) that we can use to assemble a complete description of the versioning at the cursor position. `versionDescription[0]` contains the description of un-nested versioning. In most cases this will be the only element in this array, because nesting isn't very common. Where there is nesting `versionDescription[1]` will contain the description of the versioning for the first level of nesting. A description could be very simple, such as "ghec" or, if the cursor is within an `else` tag span that follows several `elsif` tags in a tag set, it could be a longer string, such as "NOT fpt or ghec\nAND NOT ghes = 3.7\nAND NOT ghes".
- `versionTags` is an array of tag objects that tell us which characters in the editor to highlight for a particular tag, and which tag set the tag belongs to. This allows us to look up the tag sets to highlight when the cursor is within any given tag span.

### 2. Highlighting tags and displaying a versioning message

Having parsed the contents of the Markdown file, we now have the `currentTagSpan` array for working out which tags to highlight, and the `versionDescription` array for assembling a message about versioning to display to the user.

#### Highlighting the relevant version tags

To highlight the relevant tags in the editor we iterate backwards through the `currentTagSpan` array, starting with the last element in the array:

```
for (let elementNumber = currentTagSpan.length - 1; elementNumber >= 0; elementNumber--) {
    ... do stuff with currentTagSpan[elementNumber] ...
}
```

For each tag span element in the array we:
- Look up the tag span ID (`currentTagSpan[elementNumber]`) in the `versionTags` array.
- Get the tag set ID from the `tagSet` property and assign it to `currentTagSetID`.
- Find all the tags in the `versionTags` array that have the same tag set ID, and for each of these:
  - Get the start and end positions of the tag.
  - Add the start and end positions to an array of text ranges. We'll highlight these ranges in the editor.

We do the last three steps as follows:

```
versionTags.filter(tag => tag.tagID === currentTagSetID).forEach(tag => {
    const range = new vscode.Range(
        tag.positionVersionTagStart,
        tag.positionVersionTagEnd
    );
    ranges.push(range);
});
```

We can now use the `ranges` array to highlight the relevant tags.

```
TODO: THIS CODE WON'T WORK BECAUSE, ON EACH LOOP, THE DECORATIONS APPLIED FOR THE PREVIOUS LEVEL WILL BE REMOVED:
decoration.dispose(); // Remove any existing decorations.

// Create a new decoration type for highlighting the current version tags.
decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: highlightBackgroundColor[elementNumber],
    color:  highlightForegroundColor[elementNumber]
});

if (activeEditor) {
    activeEditor.setDecorations(decoration, ranges);
}
```

For more information about applying decorations to text in VS Code, see https://github.com/microsoft/vscode-extension-samples/blob/main/decorator-sample/USAGE.md.

#### Displaying a versioning message

The extension allows you to display the versioning message either as a "toast" popup, which appears briefly at the bottom right of the VS Code editor, or as a modal dialog box, which the user has to dismiss before they can continue working in the editor. The user can choose which of these they prefer, by using a different shortcut or command in the Command Palette to run the extension. If you just want to know what the versioning is at the cursor position then you'll probably prefer the modal dialog box. If you're more interested in identifying the relevant tags (e.g. because you want to remove some versioning) then you'll probably prefer the toast popup.

The message is built up from the `versionDescription` array. Included in the message are details of the cursor position, which we derive from the `cursorPosition` constant. And we create the variable `positionString` to hold the part of the message that describes the cursor position:

```
const lineNum = cursorPosition.line + 1;
const charNum = cursorPosition.character + 1;
let positionString = `at the cursor position (line ${lineNum}, character ${charNum})`;
```

Note: We add 1 to the line and character values to allow for the fact that the first line in the file and the first character in a line are counted as 0.

If the `versionDescription` array is empty then there's no versioning at the cursor position so we'll display the message:

`"There is no inline versioning " + positionString + "."`

If `versionDescription` array is not empty we iterate through the array building up the message in the string variable `versioningString`. Typically versioning is un-nested so there's only one element and the message is simple. The following untypical example contains two levels of nesting. Let's say the cursor is within the text "CodingStars" in the twice-nested `ifversion` tag span:

```
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

```
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

- **currentTagSetID**: a number. This short-lived variable is just used to store the tag set ID of the tag we're currently processing when working out which tags to highlight.
- **currentTagSpan[nestingLevel]**: an array of numbers. The numbers identify the tag span (and possibly ancestor tag spans) in which the cursor is located. The last element in this array contains the ID of the tag span within which the cursor is directly located. Initially this array is empty, meaning the cursor is not within a tag span. Knowing the current tag span (and any ancestor spans), we can use the tag properties to find out which tag set(s) to highlight.
- **cursorPosition**: (constant) a vscode.Position (i.e. a line number and the number of character on that line where the cursor currently sits).
- **elsedVersions**: a string. As we're parsing through the a tag set, we build this string to use if we reach an `else` tag for the current tag set. The string contains an NOT-ed list of the versions in the `ifversion` and and `elsif` tags in the tag set. For example, if the tag set contains `{% ifversion ghes %} ... {%elsif ghec %} ... {% else %}` then, when we reach the `else` tag `elsedVersions` will contain "NOT ghes \nAND NOT ghec". The first time we add a version string to this variable we prepend "NOT ", and for any subsequent strings we prepend " AND NOT ". If a tag set contains an `else` tag we assign the value of `elsedVersions` to `versionDescription[nestingLevel]`, prepending an additional " AND " if `nestingLevel` is >0.
- **highlightBackgroundColor**: (constant) an array of strings. Each nesting level, including none, has a different background color. For instance: `highlightBackgroundColor[0]`, for tags in an un-nested tag set, might be "red".
- **highlightForegroundColor**: (constant) an array of strings. The color of the text in the highlighted tags at each nesting level. Generally, where the background colors are all strong/dark colors, all elements of `highlightForegroundColor` will be set to "white".
- **match[]**: an array of strings. This is used to store the text matched by the regular expression that we use to find version tags in the Markdown file.
- **nestingLevel**: a number. This records the nesting level of versioning at the cursor position. When we start parsing the Markdown file, this is set to -1. Each time we find an `ifversion` tag, during parsing, we increment this value. So at the first `ifversion` tag, `nestingLevel` gets incremented to 0. A nesting level of 0 means there's versioning, but we're in a base level tag set with no nesting. Each time we find an `endif` tag we decrement this value. So, if we reach the end of an un-nested tag set without encountering another `ifversion` tag then we decrement `nestingLevel` back to -1 (no versioning).
- **ranges**: an array of vscode.Range objects. Each element of this array identifies the start and end a range of text (a tag) that we'll highlight in the VS Code editor.
- **tagCounter**: a number. Each version tag in the Markdown file gets a unique ID. During parsing of the file, each time we come to another tag we increment this number.
- **tagSetID[]**: an array of numbers. Each version tag belongs to a tag set. The tag set ID is the ID of the `ifversion` tag for that tag set. During parsing of the file, each time we come to another `ifversion` tag we set `tagSetID[nestingLevel]` to the newly incremented `tagID`. We can then assign this value to the `tagSet` property of each tag object we create for the tags in this tag set.
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

#### `ifversion`

When we find an `ifversion` tag we:
- Increment `tagCounter`, to use as a unique ID for this tag. This variable needs to survive from one tag processing to the next.
- Increment `nestingLevel`. Initially this is -1, so this becomes 0 for an un-nested tag set and 1 for the first nesting level. This variable needs to survive from one tag processing to the next
- Assign `tagCounter` to `tagSet[nestingLevel]`. This is the ID of the tag set that this tag belongs to (always the same as the ifversion ID). This array needs to survive from one tag processing to the next.
- Get the start and end positions of the tag (i.e. the position of `{` and `}`) and assign them to `positionVersionTagStart` and `positionVersionTagEnd`. We do this using the `match` array that contains the tag text (e.g. `{% ifversion ghes %}`) that we found using the regular expression. We do this as follows:

  ```
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

- Check whether the cursor position is after the end position of the tag. If it is, we:
  - Assign `tagCounter` to `currentTagSpan[nestingLevel]`. This array needs to survive from one tag processing to the next so that we can determine which tag span the cursor is currently within, and therefore which tags we need to highlight.
  - Get the version from the tag (e.g. "ghes"), using `match[1]` from the regular expression.
  - Assign the version to `versionDescription[nestingLevel]`.
  - Set `elsedVersions` to `"NOT " + versionDescription[nestingLevel]` (e.g. "NOT ghes"). For nested `ifversion` tags we prepend "\nAND " to the start of the string. This variable needs to survive from one tag processing to the next, so that we can build up a string that describes the versioning for the `else` tag in the tag set.
- Create a new element in the `versionTags` array, containing these properties:
  - **tagID**: The unique ID (`tagCounter` number).
  - **tagSet**: The tag set ID (`tagSet[nestingLevel]` number).
  - **versionDescription**: The version description (`versionDescription` array of strings).
  - **positionVersionTagStart**: The start position of the tag (`positionVersionTagStart` vscode.Position).
  - **positionVersionTagEnd**: The end position of the tag (`positionVersionTagEnd` vscode.Position).

#### `elsif`

When we find an `elsif` tag we:

- Increment `tagCounter`, to use as a unique ID for this tag.
- Get the start and end positions of the tag (i.e. the position of `{` and `}`) and assign them to `positionVersionTagStart` and `positionVersionTagEnd`.
- Check whether the cursor position is after the end position of the tag. If it is, we:
  - Assign `tagSet[nestingLevel]` to `currentTagSpan[nestingLevel]`.
  - Get the version from the tag (e.g. "ghec").
  - Assign the version to `versionDescription[nestingLevel]`.
  - Set `elsedVersions` to `elsedVersions + " \nAND NOT " + versionDescription[nestingLevel]` (e.g. "NOT ghes \nAND NOT ghec").
- Create a new element in the `versionTags` array, as above. Note that we don't assign a value to `tagSet` because this tag doesn't start a new tag set. It belongs to the same tag set as the `ifversion` tag. So we use the same `tagSet` value as the `ifversion` tag.

#### `else`

When we find an `else` tag we:

- Increment `tagCounter`, to use as a unique ID for this tag.
- Get the start and end positions of the tag (i.e. the position of `{` and `}`) and assign them to `positionVersionTagStart` and `positionVersionTagEnd`.
- Check whether the cursor position is after the end position of the tag. If it is, we:
  - Assign `tagSet[nestingLevel]` to `currentTagSpan[nestingLevel]`.
  - If `nestingLevel` is >0, we set `versionDescription[nestingLevel]` to " AND ".
  - Set `versionDescription[nestingLevel]` to `versionDescription[nestingLevel] + elsedVersions`.
- Create a new element in the `versionTags` array, as above, again reusing the unmodified `tagSet` value from the `ifversion` tag.

#### `endif`

When we find an `endif` tag we:

- Increment `tagCounter`, to use as a unique ID for this tag.
- Get the start and end positions of the tag (i.e. the position of `{` and `}`) and assign them to `positionVersionTagStart` and `positionVersionTagEnd`.
- Check whether the cursor position is after the end position of the tag. If it is, we:
  - Set `elsedVersions` to `""`.
  - Delete the last element in the `versionDescription` and `currentTagSpan` arrays.
  - Decrement `nestingLevel`. At each `endif` we're stepping out of a level of nesting, or out of versioning altogether this is the `endif` for an un-nested tag set (in which case `nestingLevel` returns to -1).
- Create a new element in the `versionTags` array, as above, again reusing the unmodified `tagSet` value from the `ifversion` tag.

Note: the cursor can never be within an `endif` tag span, because `endif` tags have no tag span. So we'll never use the `tagID` or `versionDescription` properties of an `endif` tag. We'll only use the `tagSet` property (to identify the `endif` tag to highlight when the cursor is somewhere else within this tag set) and the `positionVersionTagStart` and `positionVersionTagEnd` properties (to tell VS Code which characters to highlight for this tag).

### Regular expression

We use the following regular expression to find version tags in the Markdown file:

```
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

```
let match: RegExpExecArray | null;
while (match = tagRegEx.exec(text)) {
  ...
}
```

The `while` loop will keep running until the regular expression fails to match anything in the text. Each time the regular expression matches something, it returns an array of strings (`match`). The first element in the array (`match[0]`) is the entire string that matched the regular expression. The second element in the array (`match[1]`) is the first capture group (the tag type - e.g. "ifversion"). The third element (`match[2]`) is the second capture group (the version - e.g. "fpt or ghec").

==================

TODO: TRY USING OUTLINE COLOR AROUND TAG SPANS:

To apply an outline around a range of text in the editor as a VS Code decoration, you can use the setDecorations method of the TextEditor object. Here's how you can do it:

First, define the decoration type:

const decorationType = vscode.window.createTextEditorDecorationType({
    borderWidth: '1px',
    borderStyle: 'solid',
    overviewRulerColor: 'blue',
    borderColor: 'darkblue',
    light: {
        borderColor: 'darkblue'
    },
    dark: {
        borderColor: 'lightblue'
    }
});

Then, apply the decoration to a range:

const activeEditor = vscode.window.activeTextEditor;
if (activeEditor) {
    const start = new vscode.Position(0, 0); // start position
    const end = new vscode.Position(0, 10); // end position
    const decoration = { range: new vscode.Range(start, end), hoverMessage: 'Test Decoration' };
    activeEditor.setDecorations(decorationType, [decoration]);
}

================

TODO: FIGURE OUT HOW TO ALLOW USERS TO HAVE A CUSTOM CONFIG FOR:

- The color of the highlight for each nesting level.
- The key bindings for the extension.

TODO: IF I CHANGE THIS, ADD MORE DOCUMENTATION HERE ABOUT THE PACKAGE.JSON FILE.



-------
From Copilot:

You can allow users to set their own custom values for the backgroundColor and color properties by using the vscode.workspace.getConfiguration method to read configuration settings from the user's settings file.

First, you need to define these settings in the contributes.configuration section of your extension's package.json file:

```
"contributes": {
    "configuration": {
        "title": "My Extension",
        "properties": {
            "myExtension.decoration.backgroundColor": {
                "type": "string",
                "default": "red",
                "description": "Background color for decoration."
            },
            "myExtension.decoration.color": {
                "type": "string",
                "default": "white",
                "description": "Text color for decoration."
            }
        }
    }
}
```

Then, in your extension.ts file, you can read these settings and use them when creating the decoration:

```
let config = vscode.workspace.getConfiguration('myExtension.decoration');
let backgroundColor = config.get('backgroundColor', 'red');
let color = config.get('color', 'white');

let decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: backgroundColor,
    color: color
});
```

In this code, vscode.workspace.getConfiguration('myExtension.decoration') gets the configuration for your extension. The get method reads a setting, and the second parameter to get is the default value to use if the setting is not found.

Users can configure custom values for decoration.backgroundColor and decoration.color in their user or workspace settings in Visual Studio Code.

Here are the steps:

1. Open the settings: Use the shortcut Ctrl+, on Windows/Linux or Cmd+, on macOS, or go to File > Preferences > Settings.

2. In the search bar at the top, type myExtension.decoration to find the settings for your extension.

3. You should see the settings myExtension.decoration.backgroundColor and myExtension.decoration.color. Click on Edit in settings.json which appears when you hover over the setting.

4. In the settings.json file, you can set the values like this:

```
{
    "myExtension.decoration.backgroundColor": "#ff0000",
    "myExtension.decoration.color": "#ffffff"
}
```

Save the settings.json file. The new settings will take effect immediately.
The values should be valid CSS color values. They can be keywords (like "red" or "white"), hexadecimal color codes (like "#ff0000" or "#ffffff"), RGB values (like "rgb(255, 0, 0)" or "rgb(255, 255, 255)"), or any other valid CSS color value.
