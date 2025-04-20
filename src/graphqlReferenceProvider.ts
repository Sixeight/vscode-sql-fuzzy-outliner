import * as vscode from 'vscode';
import { parse, visit, DocumentNode, Kind } from 'graphql';

export class GraphQLReferenceProvider implements vscode.ReferenceProvider {
  async provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): Promise<vscode.Location[]> {
    // Get the name under the cursor
    const wordRange = document.getWordRangeAtPosition(position, /\w+/);
    if (!wordRange) {
      return [];
    }
    const name = document.getText(wordRange);
    const includeDeclaration = context.includeDeclaration;
    const locations: vscode.Location[] = [];

    // show loading indicator while searching references
    return vscode.window.withProgress<vscode.Location[]>(
      {
        location: vscode.ProgressLocation.Window,
        title: `Searching references for "${name}"`,
        cancellable: true,
      },
      async (progress, progressToken) => {
        const uris = await vscode.workspace.findFiles(
          '**/*.{graphql,gql,graphqls}'
        );
        progress.report({
          message: `Found ${uris.length} GraphQL files, scanning...`,
        });
        for (const [i, uri] of uris.entries()) {
          if (progressToken.isCancellationRequested) {
            break;
          }
          const doc = await vscode.workspace.openTextDocument(uri);
          const text = doc.getText();
          const pattern = new RegExp(`\\b${name}\\b`, 'g');
          let match: RegExpExecArray | null;
          while ((match = pattern.exec(text)) !== null) {
            const startPos = doc.positionAt(match.index);
            const endPos = doc.positionAt(match.index + name.length);
            locations.push(
              new vscode.Location(uri, new vscode.Range(startPos, endPos))
            );
          }
          progress.report({
            increment: ((i + 1) / uris.length) * 100,
            message: `Scanning ${i + 1}/${uris.length}`,
          });
        }
        return locations;
      }
    );
  }
}
