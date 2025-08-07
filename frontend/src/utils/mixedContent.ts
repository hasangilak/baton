import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import JSON5 from 'json5';

export type MixedSegment =
  | { type: 'text'; value: string }
  | { type: 'json'; value: any }
  | { type: 'code'; lang?: string; value: string };

const tryParseJson5 = (s: string): any | undefined => {
  try { return JSON5.parse(s); } catch { return undefined; }
};

// Remove common noisy tokens that sometimes appear inside JSON
const sanitizeLikelyJson = (s: string): string => {
  return s
    // Remove common noise tokens that LLMs sprinkle
    .replace(/\(no content\)/gi, '')
    // Normalize smart quotes to straight quotes
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    // Remove zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Trim trailing punctuation often appended after JSON blocks
    .replace(/\s*[;,\.]+\s*$/, '')
    .trim();
};

// Extract fenced code blocks first using remark AST positions
export function parseMixedContent(input: string): MixedSegment[] {
  const processor = unified().use(remarkParse);
  const tree = processor.parse(input) as any;

  type Span = { start: number; end: number; node: any };
  const codeSpans: Span[] = [];

  visit(tree, 'code', (node: any) => {
    const codeNode = node as any;
    const pos = (codeNode.position as any) || {};
    const start = typeof pos?.start?.offset === 'number' ? pos.start.offset : -1;
    const end = typeof pos?.end?.offset === 'number' ? pos.end.offset : -1;
    if (start >= 0 && end >= start) {
      codeSpans.push({ start, end, node: codeNode });
    }
  });

  codeSpans.sort((a, b) => a.start - b.start);

  const segments: MixedSegment[] = [];
  let cursor = 0;

  const pushText = (text: string) => {
    if (!text) return;
    segments.push({ type: 'text', value: text });
  };

  for (const span of codeSpans) {
    // Text before code
    if (span.start > cursor) pushText(input.slice(cursor, span.start));

    const lang = (span.node.lang || '').toLowerCase();
    const raw = span.node.value || '';
    if (lang === 'json' || lang === '') {
      const sanitized = sanitizeLikelyJson(raw);
      const parsed = tryParseJson5(sanitized);
      if (parsed !== undefined) {
        segments.push({ type: 'json', value: parsed });
      } else {
        // Keep as code if not parseable as JSON
        segments.push({ type: 'code', lang: lang || undefined, value: raw });
      }
    } else {
      // Non-JSON code block -> keep as code segment; renderer will style
      segments.push({ type: 'code', lang, value: raw });
    }

    cursor = span.end;
  }

  // Tail after last code block
  if (cursor < input.length) pushText(input.slice(cursor));

  // Now scan remaining text-only segments for loose JSON
  const finalSegments: MixedSegment[] = [];
  for (const seg of segments) {
    if (seg.type === 'json') {
      finalSegments.push(seg);
      continue;
    }
    const text = seg.value;
    const expanded = extractLooseJsonBlocks(text);
    finalSegments.push(...expanded);
  }

  // Coalesce adjacent text segments to reduce fragmentation
  return coalesceText(finalSegments);
}

function extractLooseJsonBlocks(text: string): MixedSegment[] {
  const out: MixedSegment[] = [];
  let i = 0;
  const pushText = (s: string) => { if (s) out.push({ type: 'text', value: s }); };

  while (i < text.length) {
    const nextObj = text.indexOf('{', i);
    const nextArr = text.indexOf('[', i);
    if (nextObj === -1 && nextArr === -1) {
      pushText(text.slice(i));
      break;
    }
    const start = (nextObj === -1 || (nextArr !== -1 && nextArr < nextObj)) ? nextArr : nextObj;
    if (start > i) pushText(text.slice(i, start));

    // Scan forward for a balanced block starting at `start`
    let end = start + 1;
    let depth = 1;
    let inString = false;
    let stringQuote: '"' | "'" | null = null;
    let escape = false;
    while (end < text.length) {
      const ch = text[end];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === stringQuote) {
          inString = false; stringQuote = null;
        }
      } else {
        if (ch === '"' || ch === "'") {
          inString = true; stringQuote = ch as any;
        } else if (ch === '{' || ch === '[') {
          depth += 1;
        } else if (ch === '}' || ch === ']') {
          depth -= 1;
          if (depth === 0) { end += 1; break; }
        }
      }
      end += 1;
    }

    const candidate = text.slice(start, end);
    const sanitized = sanitizeLikelyJson(candidate);
    const parsed = tryParseJson5(sanitized);
    if (parsed !== undefined) {
      out.push({ type: 'json', value: parsed });
      i = end;
    } else {
      // Not valid: include the opening char as text and continue
      pushText(text.slice(start, start + 1));
      i = start + 1;
    }
  }

  return out.length ? out : [{ type: 'text', value: text }];
}

function coalesceText(segments: MixedSegment[]): MixedSegment[] {
  const out: MixedSegment[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (seg.type === 'text' && last && last.type === 'text') {
      (last as any).value += seg.value;
    } else {
      out.push(seg);
    }
  }
  return out;
}
