import React from 'react';
import { Text, View, Platform, ScrollView } from 'react-native';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import { createStyleObject } from 'react-syntax-highlighter/dist/esm/create-element';
// @ts-ignore
import { defaultStyle } from 'react-syntax-highlighter/dist/esm/styles/hljs';

import cpp from 'react-syntax-highlighter/dist/esm/languages/hljs/cpp';
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import java from 'react-syntax-highlighter/dist/esm/languages/hljs/java';

// Register only the targeted programming languages
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('java', java);

const topLevelPropertiesToRemove = [
  "color", 
  "textShadow", 
  "textAlign", 
  "whiteSpace", 
  "wordSpacing",
  "wordBreak",
  "wordWrap",
  "lineHeight",
  "MozTabSize",
  "OTabSize",
  "tabSize",
  "WebkitHyphens",
  "MozHyphens",
  "msHyphens",
  "hyphens",
  "fontFamily"
];

const styleCache = new Map();

function generateNewStylesheet({ stylesheet }: { stylesheet: any }) {
  if (styleCache.has(stylesheet)) {
    return styleCache.get(stylesheet);
  }
  const sheet = Array.isArray(stylesheet) ? stylesheet[0] : stylesheet;
  const transformedStyle = Object.entries(sheet).reduce((newStylesheet: any, [className, style]: [string, any]) => {
    newStylesheet[className] = Object.entries(style).reduce((newStyle: any, [key, value]: [string, any]) => {
      if (key === 'overflowX' || key === "overflow") {
        newStyle.overflow = value === 'auto' ? 'scroll' : value;
      }
      else if (typeof value === 'string' && value.includes('em')) {
        const [num] = value.split('em');
        newStyle[key] = Number(num) * 16;
      }
      else if (key === 'background') {
        newStyle.backgroundColor = value;
      }
      else if (key === 'display') {
        return newStyle;
      }
      else {
        newStyle[key] = value;
      }
      return newStyle;
    }, {});
    return newStylesheet;
  }, {});
  
  const topLevel = transformedStyle.hljs || {};
  const defaultColor = topLevel.color || "#000";
  topLevelPropertiesToRemove.forEach(property => {
    if (topLevel[property]) {
      delete topLevel[property];
    }
  });
  if (topLevel.backgroundColor === "none") {
    delete topLevel.backgroundColor;
  }
  styleCache.set(stylesheet, { transformedStyle, defaultColor });
  return { transformedStyle, defaultColor };
}

function createChildren({ stylesheet, fontSize, fontFamily }: any) {
  let childrenCount = 0;
  return (children: any[], defaultColor: string) => {
    childrenCount += 1;
    return children.map((child, i) => createNativeElement({
      node: child,
      stylesheet,
      key: `code-segment-${childrenCount}-${i}`,
      defaultColor,
      fontSize,
      fontFamily
    }));
  }
}

function createNativeElement({ node, stylesheet, key, defaultColor, fontFamily, fontSize = 12 }: any): React.ReactNode {
  const { properties, type, tagName: TagName, value } = node;
  const startingStyle = { fontFamily, fontSize, height: fontSize + 5 };
  if (type === 'text') {
    return (
      <Text
        key={key}
        style={Object.assign({ color: defaultColor }, startingStyle)}
      >
        {value}
      </Text>
    );
  } else if (TagName) {
    const childrenCreator = createChildren({ stylesheet, fontSize, fontFamily });
    const style = createStyleObject(
      properties.className,
      Object.assign(
        { color: defaultColor },
        properties.style,
        startingStyle
      ),
      stylesheet
    );
    const children = childrenCreator(node.children, style.color || defaultColor);
    return <Text key={key} style={style}>{children}</Text>;
  }
  return null;
}

function nativeRenderer({ defaultColor, fontFamily, fontSize }: any) {
  return ({ rows, stylesheet }: any) => rows.map((node: any, i: number) => createNativeElement({
    node,
    stylesheet,
    key: `code-segment-${i}`,
    defaultColor,
    fontFamily,
    fontSize
  }));
}

interface CustomSyntaxHighlighterProps {
  fontFamily?: string;
  fontSize?: number;
  children: string;
  language?: string;
  style?: any;
  customStyle?: any;
  [key: string]: any;
}

export function CustomSyntaxHighlighter({
  fontFamily = Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  fontSize = 12,
  children,
  language,
  style = defaultStyle,
  ...rest
}: CustomSyntaxHighlighterProps) {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    // Defer heavy AST parsing and recursive text element generation by 150ms
    // to allow the React Native navigation and swipe animations to complete smoothly.
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const processedChildren = React.useMemo(() => {
    if (!children) return '';
    // Replace newline characters (\n) inside double quotes with literal "\\n"
    let res = children.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => {
      return match.replace(/\n/g, '\\n');
    });
    // Replace newline characters (\n) inside single quotes with literal "\\n"
    res = res.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match) => {
      return match.replace(/\n/g, '\\n');
    });
    return res;
  }, [children]);

  if (!isReady) {
    // Render a super lightweight plain-text monospace preview during swipe transitions
    return (
      <ScrollView horizontal={true} style={{ padding: 10 }}>
        <Text style={{ fontFamily, fontSize, color: '#cbd5e1' }}>
          {processedChildren}
        </Text>
      </ScrollView>
    );
  }

  const { transformedStyle, defaultColor } = generateNewStylesheet({
    stylesheet: style
  });
  
  return (
    <SyntaxHighlighter
      {...rest}
      language={language}
      style={transformedStyle}
      horizontal={true}
      renderer={nativeRenderer({
        defaultColor,
        fontFamily,
        fontSize
      })}
    >
      {processedChildren}
    </SyntaxHighlighter>
  );
}

export default CustomSyntaxHighlighter;
