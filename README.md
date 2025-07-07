# 📊 Homework Grader

A TypeScript-based homework grading system with CSV URL loading functionality for processing homework submissions from CSV files.

## 🚀 Features

- **TypeScript Implementation**: Fully typed with modern TypeScript 5.8+
- **CSV Processing**: Loads and validates URLs from CSV files
- **URL Validation**: Filters and validates HTTP/HTTPS URLs only
- **Deduplication**: Automatically removes duplicate URLs
- **CLI Interface**: Easy-to-use command-line interface
- **Error Handling**: Comprehensive error handling for file operations

## 📋 Prerequisites

- Node.js (v18 or higher)
- pnpm (recommended package manager)

## 🛠️ Installation

```bash
# Clone the repository
git clone <repository-url>
cd homework-grader

# Install dependencies with pnpm
pnpm install

# Build the project
pnpm run build
```

## 🎯 Usage

### Development Mode
```bash
# Run with ts-node for development
pnpm run dev sample.csv
```

### Production Mode
```bash
# Build first, then run
pnpm run build
pnpm start sample.csv
```

### Available Scripts

- `pnpm run build` - Compile TypeScript to JavaScript
- `pnpm run dev <csv-file>` - Run in development mode with ts-node
- `pnpm start <csv-file>` - Run compiled version
- `pnpm run clean` - Remove dist directory

## 📂 Project Structure

```
homework-grader/
├── src/
│   ├── cli.ts          # Command-line interface
│   ├── url-loader.ts   # Core URL loading functionality
│   └── example.ts      # Usage examples
├── dist/               # Compiled JavaScript (generated)
├── sample.csv          # Example CSV file
├── package.json        # Project dependencies
├── tsconfig.json       # TypeScript configuration
└── README.md          # This file
```

## 📊 CSV Format

The system accepts CSV files with any column structure. URLs can be in any column and will be automatically detected and extracted.

Example CSV format:
```csv
name,website,description
John Smith,https://example.com,Personal website
Jane Doe,http://github.com/janedoe,Developer portfolio
Bob Wilson,https://linkedin.com/in/bobwilson,Professional profile
```

## 🔧 Core Components

### URLLoader Class

The main class responsible for:
- Loading URLs from CSV files
- Validating file existence and format
- Filtering valid HTTP/HTTPS URLs
- Deduplicating URLs
- Providing access to loaded URLs

### CLI Interface

Command-line tool that:
- Accepts CSV file path as argument
- Displays loaded URLs and count
- Provides helpful error messages
- Supports both development and production modes

## 🧪 Example Output

```bash
$ pnpm run dev sample.csv

Loading URLs from: sample.csv

Loaded 7 unique URLs into memory:
1. https://example.com
2. http://github.com/janedoe
3. https://linkedin.com/in/bobwilson
4. https://alicecodes.dev
5. https://sarahdesigns.com
6. http://tomlee.tech

Total URLs loaded: 7
```

## 🔍 Key Features

- **Type Safety**: Full TypeScript support with strict typing
- **Validation**: Comprehensive file and URL validation
- **Performance**: Efficient CSV parsing with streaming
- **Error Handling**: Graceful error handling and user feedback
- **Deduplication**: Automatic removal of duplicate URLs
- **Flexibility**: Works with any CSV structure

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

If you encounter any issues or have questions, please open an issue in the GitHub repository.
