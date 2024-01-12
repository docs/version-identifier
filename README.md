# The version-identifier VS Code extension

This extension for VS Code helps you to identify Liquid-syntax tags used to apply versioning in the Markdown files for GitHub documentation.

An example of versioning in Markdown is:

`This text is not versioned{% ifversion ghes > 3.10 %}, but this only appears in the documentation for GitHub Enterprise Server 3.11 or higher{% endif %}.`

Where there is lots of versioning in a Markdown file, especially where there is versioning nested within other versioned blocks, it can be difficult to be absolutely sure, just by looking at the Markdown, which version of the docs a particular bit of text will, or will not, appear in. And if you want to remove some versioning it can be hard to know which tags you need to delete. This extension makes things a lot easier.

## Features

The extension does two things, it:
- Displays a message describing the versioning at the current cursor position within the Markdown file.
- Highlights the version tags that affect the versioning at the cursor position.

There are options for how you want the message to be displayed. You can show the usual popup "toast" message at the bottom right of VS Code, which disappears after a while. Alternatively, you can display a modal popup, which you have to click to dismiss.

To use the extension, either:
- Use a keypress:
  - For the "toast" message, press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>v</kbd> (Windows/Linux) or <kbd>control</kbd>+<kbd>command</kbd>+<kbd>v</kbd> (Mac)
  - For the modal popup, press <kbd>Shift</kbd>+<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>v</kbd> (Windows/Linux) or <kbd>Shift</kbd>+<kbd>control</kbd>+<kbd>command</kbd>+<kbd>v</kbd> (Mac)
- Go to the Command Palette (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>p</kbd> (Windows/Linux) or <kbd>Shift</kbd>+<kbd>command</kbd>+<kbd>p</kbd> (Mac)), type `version` and select either **Versioning identification (Toast)** or **Versioning identification (Modal)**.

TODO: ADD A SCREENSHOT

## Extension Settings

TODO......

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

None.

## Release Notes

See ........ TODO: LINK TO NOTES
