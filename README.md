# SQL & GraphQL Fuzzy Outliner

A Visual Studio Code extension that provides fuzzy outline support and definition/reference navigation for SQL and GraphQL files.

## Features

### SQL Support

- Display `CREATE TABLE` and `CREATE TYPE` statements in the outline
- List `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations with associated table names
- Show table definitions as constructors and query operations as functions

### GraphQL Support

- Outline for operations (queries, mutations, subscriptions)
- Fragment definitions
- Type definitions (`type`, `interface`, `input`, `enum`)
- Hierarchical view of nested fields
- Support for `.graphql`, `.gql`, and `.graphqls` file extensions

### Navigation

- **Go to Definition**: jump from field, type, or fragment references to their definitions
- **Find References**: list all references to types, fields, and fragments
- **Smart Fallback**: if no definition is found, automatically show references

## Usage

1. Open a SQL (`.sql`) or GraphQL (`.graphql`, `.gql`, `.graphqls`) file
2. Open the Outline view in VS Code (`View` -> `Outline`)
3. Click an item in the outline to navigate to its position
4. For GraphQL files:
   - Use `F12` / `Ctrl+Click` (`Cmd+Click` on macOS) to go to definition
   - Use `Shift+F12` to find references
   - If no definition exists, running "Go to Definition" will show reference list

## Requirements

- VS Code 1.96.0 or higher

## Extension Settings

This extension does not contribute any customizable settings.

## Known Issues

- Uses regex-based parsing, so complex or malformed SQL/GraphQL may not be parsed correctly
- Custom directives or uncommon patterns may not be supported fully

## Release Notes

### 0.4.0

- Updated extension version to `0.4.0`
- Improved performance of GraphQL support

### 0.3.0

- Added smart fallback navigation: show references when definition is missing
- Implemented reference search for GraphQL types
- Improved navigation experience in GraphQL schemas

### 0.2.0

- Added support for `.graphqls` file extension
- Implemented "Go to Definition" for GraphQL files
- Added cross-file definition jumping for types, fields, and fragments

### 0.1.0

- Initial support for GraphQL files (`.graphql`, `.gql`)
- Outline view for GraphQL operations, fragments, and type definitions

### 0.0.1

- Initial release: basic SQL outlining with `CREATE TABLE`, `CREATE TYPE`, and CRUD operation outlines

## Contributing

Issues and pull requests are welcome at [GitHub repository](https://github.com/Sixeight/sql-fuzzy-outliner).

**Enjoy!**
