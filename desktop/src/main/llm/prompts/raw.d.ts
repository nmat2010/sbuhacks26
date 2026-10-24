// Prompts are Markdown files imported as strings by Vite (and Vitest).
declare module '*.md?raw' {
  const content: string;
  export default content;
}
