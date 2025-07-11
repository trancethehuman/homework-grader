export const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".svg",
  ".webp",
  ".ico",
  ".tiff",
  ".tif",
];

export const VIDEO_EXTENSIONS = [
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".mkv",
  ".m4v",
];

export const AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".ogg",
  ".wma",
  ".m4a",
];

export const ARCHIVE_EXTENSIONS = [
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
];

export const DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".pkl",
];

export const EXECUTABLE_EXTENSIONS = [".exe", ".dll", ".so", ".dylib", ".app"];

export const FONT_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2", ".eot"];

export const BINARY_EXTENSIONS = [".bin", ".dat", ".db", ".sqlite", ".sqlite3"];

export const COMPILED_EXTENSIONS = [
  ".class",
  ".jar",
  ".war",
  ".ear",
  ".pyc",
  ".pyo",
];

export const PACKAGE_EXTENSIONS = [".deb", ".rpm", ".msi", ".dmg", ".pkg"];

export const LOCK_EXTENSIONS = [".lock"];

export const VECTOR_DATABASE = [".faiss"];

export const GIT = [".gitignore"];

export const DEFAULT_IGNORED_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...EXECUTABLE_EXTENSIONS,
  ...FONT_EXTENSIONS,
  ...BINARY_EXTENSIONS,
  ...COMPILED_EXTENSIONS,
  ...PACKAGE_EXTENSIONS,
  ...LOCK_EXTENSIONS,
  ...VECTOR_DATABASE,
  ...GIT,
];
