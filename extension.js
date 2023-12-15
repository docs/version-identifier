const vscode = require("vscode");

module.exports = {
  activate,
  deactivate,
};

function activate(context) {
  // This must match the command property in the package.json
  const commandID = "example.helloWorld";
  let disposable = vscode.commands.registerCommand(commandID, sayHello);
  context.subscriptions.push(disposable);
}

function sayHello() {
  vscode.window.showInformationMessage("Hello World!");
}

function deactivate() {}
