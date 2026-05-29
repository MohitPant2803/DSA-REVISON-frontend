import React from 'react';
import { Text, TextStyle, StyleProp, Platform } from 'react-native';

/**
 * RichText – lightweight inline markdown bold, code, and italic renderer.
 *
 * Parses:
 *   - `**bold**` markers -> bold text
 *   - `` `code` `` markers -> monospace styled inline code block
 *   - `*italic*` markers -> italic text
 * Everything else is rendered as normal text.
 */

interface RichTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  boldStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export const RichText = React.memo(({ text, style, boldStyle, numberOfLines }: RichTextProps) => {
  if (!text) return null;

  // Split on **...**, `...`, and *...* patterns, capturing the formatted tokens
  const regex = /(\*\*[\s\S]*?\*\*|`[^`]+`|\*[^*]+\*)/g;
  const parts = text.split(regex);

  // If no markdown markers were found, fast-path: render plain text
  if (parts.length === 1) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  // Map parts: alternate formats according to token type
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        if (!part) return null;

        // Check if token is bold: **content**
        if (part.startsWith('**') && part.endsWith('**')) {
          const content = part.slice(2, -2);
          return (
            <Text key={i} style={[{ fontWeight: '800' }, boldStyle]}>
              {content}
            </Text>
          );
        }

        // Check if token is inline code: `content`
        if (part.startsWith('`') && part.endsWith('`')) {
          const content = part.slice(1, -1);
          return (
            <Text
              key={i}
              style={[
                {
                  fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                  backgroundColor: '#E2E8F0',
                  color: '#0F172A',
                  paddingHorizontal: 4,
                  borderRadius: 4,
                  fontWeight: '700',
                },
              ]}
            >
              {content}
            </Text>
          );
        }

        // Check if token is italic: *content*
        if (part.startsWith('*') && part.endsWith('*')) {
          const content = part.slice(1, -1);
          return (
            <Text key={i} style={{ fontStyle: 'italic' }}>
              {content}
            </Text>
          );
        }

        // Normal text segment
        return part;
      })}
    </Text>
  );
});
