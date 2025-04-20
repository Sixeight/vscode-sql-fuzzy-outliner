import * as vscode from 'vscode';
import { parse, Kind, DocumentNode } from 'graphql';

export class GraphQLDefinitionProvider implements vscode.DefinitionProvider {
  // Cache of all GraphQL file type definitions and locations
  private typeDefinitionsCache = new Map<
    string,
    Map<string, vscode.Location>
  >();
  private fieldDefinitionsCache = new Map<
    string,
    Map<string, vscode.Location>
  >();
  private fragmentDefinitionsCache = new Map<
    string,
    Map<string, vscode.Location>
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
    if (this.typeDefinitionsCache.has(currentUri)) {
      const currentFileTypes = this.typeDefinitionsCache.get(currentUri)!;
      if (currentFileTypes.has(typeName)) {
        locations.push(currentFileTypes.get(typeName)!);
        return locations; // Return the ones found in the same file first
      }
    }

    // 2. If none found in the same file, search other files
    for (const [uri, typeMap] of this.typeDefinitionsCache) {
      if (uri !== currentUri && typeMap.has(typeName)) {
        locations.push(typeMap.get(typeName)!);
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
    if (this.fieldDefinitionsCache.has(currentUri)) {
      const currentFileFields = this.fieldDefinitionsCache.get(currentUri)!;
      if (currentFileFields.has(fieldKey)) {
        locations.push(currentFileFields.get(fieldKey)!);
        return locations; // Return the ones found in the same file first (fields)
      }
    }

    // 2. If none found in the same file, search other files (fields)
    for (const [uri, fieldMap] of this.fieldDefinitionsCache) {
      if (uri !== currentUri && fieldMap.has(fieldKey)) {
        locations.push(fieldMap.get(fieldKey)!);
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
    if (this.fragmentDefinitionsCache.has(currentUri)) {
      const currentFileFragments =
        this.fragmentDefinitionsCache.get(currentUri)!;
      if (currentFileFragments.has(fragmentName)) {
        locations.push(currentFileFragments.get(fragmentName)!);
        return locations; // Return the ones found in the same file first (fragments)
      }
    }

    // 2. If none found in the same file, search other files (fragments)
    for (const [uri, fragmentMap] of this.fragmentDefinitionsCache) {
      if (uri !== currentUri && fragmentMap.has(fragmentName)) {
        locations.push(fragmentMap.get(fragmentName)!);
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
    const typeDefinitions = new Map<string, vscode.Location>();
    const fieldDefinitions = new Map<string, vscode.Location>();
    const fragmentDefinitions = new Map<string, vscode.Location>();

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
          typeDefinitions.set(
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
            fieldDefinitions.set(
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
          fragmentDefinitions.set(
            fragName,
            new vscode.Location(document.uri, new vscode.Range(start, end))
          );
        }
      }
    }
    this.typeDefinitionsCache.set(uri, typeDefinitions);
    this.fieldDefinitionsCache.set(uri, fieldDefinitions);
    this.fragmentDefinitionsCache.set(uri, fragmentDefinitions);
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
