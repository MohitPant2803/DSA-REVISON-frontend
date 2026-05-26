import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

/**
 * RichText – lightweight inline markdown bold renderer.
 *
 * Parses `**bold**` markers in a string and renders them as
 * <Text style={{ fontWeight: 'bold' }}> segments. Everything else
 * is rendered as normal text.
 *
 * Usage:
 *   <RichText style={{ color: '#334155' }} text="This is **important** info" />
 *   <RichText style={{ color: '#334155' }} boldStyle={{ color: '#0F172A' }} text={someVar} />
 */

interface RichTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  boldStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export const RichText = React.memo(({ text, style, boldStyle, numberOfLines }: RichTextProps) => {
  if (!text) return null;

  // Split on **...** patterns, capturing the bold content (supporting newlines)
  const parts = text.split(/\*\*([\s\S]*?)\*\*/g);

  // If no ** markers were found, fast-path: render plain text
  if (parts.length === 1) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  // Alternating: even indices are normal text, odd indices are bold content
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          // Bold segment
          return (
            <Text key={i} style={[{ fontWeight: '800' }, boldStyle]}>
              {part}
            </Text>
          );
        }
        return part; // Normal text segment (React handles string children)
      })}
    </Text>
  );
});
