import * as vscode from 'vscode';
import { parse, Kind, DocumentNode } from 'graphql';

export class GraphQLDefinitionProvider implements vscode.DefinitionProvider {
  // Unified cache for all definitions
  private definitionsCache = new Map<
    string,
    {
      typeDefinitions: Map<string, vscode.Location>;
      fieldDefinitions: Map<string, vscode.Location>;
      fragmentDefinitions: Map<string, vscode.Location>;
    }
  >();

  constructor() {
    // Watch for file changes in VSCode
    vscode.workspace.onDidChangeTextDocument((e) => {
      const uri = e.document.uri.toString();
      if (this.isGraphQLFile(e.document)) {
        // Update cache when the file changes
        this.updateCacheForDocument(e.document);
      }
    });

    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (this.isGraphQLFile(doc)) {
        this.updateCacheForDocument(doc);
      }
    });

    // Load all .graphql and .graphqls files at initialization
    this.initializeCache();
  }

  // Main method of the definition provider
  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Definition | vscode.LocationLink[] | null> {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }
    const word = document.getText(wordRange);

    // 1. Find type definitions
    const typeLocations = await this.findTypeDefinition(word, document);
    if (typeLocations) {
      return typeLocations;
    }
    // 2. Find fragment definitions
    const fragmentLocations = await this.findFragmentDefinition(word, document);
    if (fragmentLocations) {
      return fragmentLocations;
    }
    // 3. Find field definitions
    return await this.findFieldDefinition(word, document, position);
  }

  // Find type definitions - prioritize definitions in the same file
  private async findTypeDefinition(
    typeName: string,
    currentDocument: vscode.TextDocument
  ): Promise<vscode.Location[] | null> {
    const locations: vscode.Location[] = [];
    const currentUri = currentDocument.uri.toString();

    // 1. First, prioritize definitions in the current file
    const currentFileCache = this.definitionsCache.get(currentUri);
    if (currentFileCache?.typeDefinitions.has(typeName)) {
      locations.push(currentFileCache.typeDefinitions.get(typeName)!);
      return locations; // Return the ones found in the same file first
    }

    // 2. If none found in the same file, search other files
    for (const [uri, cacheEntry] of this.definitionsCache) {
      if (uri !== currentUri && cacheEntry.typeDefinitions.has(typeName)) {
        locations.push(cacheEntry.typeDefinitions.get(typeName)!);
      }
    }

    return locations.length > 0 ? locations : null;
  }

  // Find field definitions - prioritize definitions in the same file
  private async findFieldDefinition(
    fieldName: string,
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Location[] | null> {
    // Determine the parent type first
    const parentTypeName = await this.getParentTypeName(document, position);
    if (!parentTypeName) {
      return null;
    }

    const fieldKey = `${parentTypeName}.${fieldName}`;
    const locations: vscode.Location[] = [];
    const currentUri = document.uri.toString();

    // 1. First, prioritize definitions in the current file (fields)
    const currentFileCache = this.definitionsCache.get(currentUri);
    if (currentFileCache?.fieldDefinitions.has(fieldKey)) {
      locations.push(currentFileCache.fieldDefinitions.get(fieldKey)!);
      return locations; // Return the ones found in the same file first (fields)
    }

    // 2. If none found in the same file, search other files (fields)
    for (const [uri, cacheEntry] of this.definitionsCache) {
      if (uri !== currentUri && cacheEntry.fieldDefinitions.has(fieldKey)) {
        locations.push(cacheEntry.fieldDefinitions.get(fieldKey)!);
      }
    }

    return locations.length > 0 ? locations : null;
  }

  // Find fragment definitions - prioritize definitions in the same file
  private async findFragmentDefinition(
    fragmentName: string,
    currentDocument: vscode.TextDocument
  ): Promise<vscode.Location[] | null> {
    const locations: vscode.Location[] = [];
    const currentUri = currentDocument.uri.toString();

    // 1. First, prioritize definitions in the current file and return
    const currentFileCache = this.definitionsCache.get(currentUri);
    if (currentFileCache?.fragmentDefinitions.has(fragmentName)) {
      locations.push(currentFileCache.fragmentDefinitions.get(fragmentName)!);
      return locations; // Return the ones found in the same file first (fragments)
    }

    // 2. If none found in the same file, search other files (fragments)
    for (const [uri, cacheEntry] of this.definitionsCache) {
      if (
        uri !== currentUri &&
        cacheEntry.fragmentDefinitions.has(fragmentName)
      ) {
        locations.push(cacheEntry.fragmentDefinitions.get(fragmentName)!);
      }
    }

    return locations.length > 0 ? locations : null;
  }

  // Get the parent type name at the current position
  private async getParentTypeName(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<string | null> {
    const text = document.getText();
    let ast: DocumentNode;
    try {
      ast = parse(text);
    } catch (error) {
      return null;
    }
    const offset = document.offsetAt(position);
    for (const def of ast.definitions) {
      if (def.loc && def.loc.start <= offset && offset <= def.loc.end) {
        if (def.kind === Kind.FRAGMENT_DEFINITION) {
          return def.typeCondition.name.value;
        }
        if (
          def.kind === Kind.OBJECT_TYPE_DEFINITION ||
          def.kind === Kind.INTERFACE_TYPE_DEFINITION ||
          def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
          def.kind === Kind.ENUM_TYPE_DEFINITION ||
          def.kind === Kind.UNION_TYPE_DEFINITION ||
          def.kind === Kind.SCALAR_TYPE_DEFINITION
        ) {
          return def.name.value;
        }
      }
    }
    return null;
  }

  // Initialize cache from all GraphQL files
  private async initializeCache() {
    // Get all GraphQL files in the workspace
    const graphqlFiles = await vscode.workspace.findFiles(
      '**/*.{graphql,gql,graphqls}'
    );

    for (const fileUri of graphqlFiles) {
      const document = await vscode.workspace.openTextDocument(fileUri);
      this.updateCacheForDocument(document);
    }
  }

  // Update cache for the specified document
  private updateCacheForDocument(document: vscode.TextDocument) {
    if (!this.isGraphQLFile(document)) {
      return;
    }
    const uri = document.uri.toString();
    const text = document.getText();
    let ast: DocumentNode;
    try {
      ast = parse(text);
    } catch (error) {
      console.error('Failed to parse GraphQL document', error);
      return;
    }
    const cacheEntry = {
      typeDefinitions: new Map<string, vscode.Location>(),
      fieldDefinitions: new Map<string, vscode.Location>(),
      fragmentDefinitions: new Map<string, vscode.Location>(),
    };

    for (const def of ast.definitions) {
      if (
        def.kind === Kind.OBJECT_TYPE_DEFINITION ||
        def.kind === Kind.INTERFACE_TYPE_DEFINITION ||
        def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
        def.kind === Kind.ENUM_TYPE_DEFINITION ||
        def.kind === Kind.UNION_TYPE_DEFINITION ||
        def.kind === Kind.SCALAR_TYPE_DEFINITION
      ) {
        const typeName = def.name.value;
        const loc = def.name.loc;
        if (loc) {
          const start = document.positionAt(loc.start);
          const end = document.positionAt(loc.end);
          cacheEntry.typeDefinitions.set(
            typeName,
            new vscode.Location(document.uri, new vscode.Range(start, end))
          );
        }
        if ('fields' in def && def.fields) {
          for (const field of def.fields) {
            const fieldName = field.name.value;
            const fieldLoc = field.name.loc;
            if (!fieldLoc) {
              continue;
            }
            const fStart = document.positionAt(fieldLoc.start);
            const fEnd = document.positionAt(fieldLoc.end);
            cacheEntry.fieldDefinitions.set(
              `${typeName}.${fieldName}`,
              new vscode.Location(document.uri, new vscode.Range(fStart, fEnd))
            );
          }
        }
      } else if (def.kind === Kind.FRAGMENT_DEFINITION) {
        const fragName = def.name.value;
        const loc = def.name.loc;
        if (loc) {
          const start = document.positionAt(loc.start);
          const end = document.positionAt(loc.end);
          cacheEntry.fragmentDefinitions.set(
            fragName,
            new vscode.Location(document.uri, new vscode.Range(start, end))
          );
        }
      }
    }
    this.definitionsCache.set(uri, cacheEntry);
  }

  // Determine if a document is a GraphQL file
  private isGraphQLFile(document: vscode.TextDocument): boolean {
    return (
      document.languageId === 'graphql' ||
      document.fileName.endsWith('.graphql') ||
      document.fileName.endsWith('.gql') ||
      document.fileName.endsWith('.graphqls')
    );
  }
}
