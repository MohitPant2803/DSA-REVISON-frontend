// CSS imports for NativeWind/Tailwind
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

declare module 'react-native-syntax-highlighter' {
  import { Component } from 'react';
  import { ViewStyle } from 'react-native';
  export interface SyntaxHighlighterProps {
    language?: string;
    style?: any;
    customStyle?: ViewStyle & { fontSize?: number; borderRadius?: number; padding?: number };
    children?: string;
  }
  export default class SyntaxHighlighter extends Component<SyntaxHighlighterProps> {}
}

declare module 'react-syntax-highlighter/styles/hljs' {
  export const atomOneDark: any;
}
