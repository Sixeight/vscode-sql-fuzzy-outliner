// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

class SQLDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  private pattern =
    /(?:CREATE\s+(TABLE|TYPE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)(?:\s+AS\s+ENUM)?\s*[^;]+;)|(?:SELECT\s+[^;]+\s+FROM\s+(\w+)\s+[^;]*;)|(?:INSERT\s+INTO\s+(\w+)[^;]*;)|(?:UPDATE\s+(\w+)[^;]*;)|(?:DELETE\s+FROM\s+(\w+)[^;]*;)/gm;

  private wordToKind: { [key: string]: vscode.SymbolKind } = {
    TABLE: vscode.SymbolKind.Constructor,
    TYPE: vscode.SymbolKind.Enum,
    SELECT: vscode.SymbolKind.Function,
    INSERT: vscode.SymbolKind.Function,
    UPDATE: vscode.SymbolKind.Function,
    DELETE: vscode.SymbolKind.Function,
  };

  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    this.pattern.lastIndex = 0;

    const text = document.getText();
    const symbols: vscode.DocumentSymbol[] = [];

    let match;
    while ((match = this.pattern.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);
      const selectionRange = range;

      if (match[1]) {
        // CREATE TABLE または TYPE の場合
        const operation = match[1].trim().toUpperCase();
        symbols.push(
          new vscode.DocumentSymbol(
            match[2].trim(),
            operation,
            this.wordToKind[operation],
            range,
            selectionRange
          )
        );
      } else {
        // SELECT/INSERT/UPDATE/DELETE の場合
        const tableName = (
          match[3] ||
          match[4] ||
          match[5] ||
          match[6]
        )?.trim();
        const operation = text
          .substring(match.index, match.index + 6)
          .trim()
          .toUpperCase();

        if (tableName) {
          symbols.push(
            new vscode.DocumentSymbol(
              tableName,
              operation,
              this.wordToKind[operation],
              range,
              selectionRange
            )
          );
        }
      }
    }

    return symbols;
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      [{ language: 'sql' }],
      new SQLDocumentSymbolProvider()
    )
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
