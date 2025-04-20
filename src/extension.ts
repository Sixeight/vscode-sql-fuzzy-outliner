// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GraphQLDocumentSymbolProvider } from './graphqlOutliner';
import { GraphQLDefinitionProvider } from './graphqlDefinitionProvider';
import { GraphQLReferenceProvider } from './graphqlReferenceProvider';
import { GraphQLFallbackProvider } from './graphqlFallbackProvider';

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
        // For CREATE TABLE or TYPE
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
        // For SELECT/INSERT/UPDATE/DELETE
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
  // Define GraphQL file type patterns
  const graphqlDocumentSelector = [
    { language: 'graphql', scheme: 'file' },
    { pattern: '**/*.graphql', scheme: 'file' },
    { pattern: '**/*.gql', scheme: 'file' },
    { pattern: '**/*.graphqls', scheme: 'file' },
  ];

  // Register SQL outliner
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      [{ language: 'sql' }],
      new SQLDocumentSymbolProvider()
    )
  );

  // Register GraphQL outliner
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      graphqlDocumentSelector,
      new GraphQLDocumentSymbolProvider()
    )
  );

  // Create GraphQL definition and reference providers
  const definitionProvider = new GraphQLDefinitionProvider();
  const referenceProvider = new GraphQLReferenceProvider();

  // Register reference provider
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(
      graphqlDocumentSelector,
      referenceProvider
    )
  );

  // Create fallback provider (show references if definition not found)
  const fallbackProvider = new GraphQLFallbackProvider(
    definitionProvider,
    referenceProvider
  );

  // Register fallback provider as definition provider
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      graphqlDocumentSelector,
      fallbackProvider
    )
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
