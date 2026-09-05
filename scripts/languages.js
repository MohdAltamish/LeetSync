/**
 * languages.js
 * Maps LeetCode language names (from GraphQL) to file extensions.
 * Exported as a plain object — no dependencies.
 */

const LANGUAGE_MAP = {
  bash:        '.sh',
  c:           '.c',
  cangjie:     '.cj',
  cpp:         '.cpp',
  csharp:      '.cs',
  dart:        '.dart',
  elixir:      '.ex',
  erlang:      '.erl',
  golang:      '.go',
  java:        '.java',
  javascript:  '.js',
  kotlin:      '.kt',
  mysql:       '.sql',
  mssql:       '.sql',
  oraclesql:   '.sql',
  php:         '.php',
  pandas:      '.py',
  postgresql:  '.sql',
  python:      '.py',
  python3:     '.py',
  racket:      '.rkt',
  ruby:        '.rb',
  rust:        '.rs',
  scala:       '.scala',
  swift:       '.swift',
  typescript:  '.ts',
};

/**
 * @param {string} langName - e.g. "python3", "cpp", "javascript"
 * @returns {string} - e.g. ".py", ".cpp", ".js"
 */
function getExtensionForLanguage(langName) {
  if (!langName) return '.txt';
  return LANGUAGE_MAP[langName.toLowerCase()] ?? '.txt';
}
