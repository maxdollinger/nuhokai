/** tsc's messages as a world author reads them: what to change, not how tsc typed it (TypeCheck R4). Pure. */

/**
 * A quoted type that is a `Forbidden<"…">` the error is about: the whole type, or the last member of its intersection
 * (`X & Forbidden<"…">`, also under NoInfer). One inside an object type the error is not about (`{ readonly
 * externalType?: Forbidden<"…">; }` beside an unknown property) is no match.
 */
const FORBIDDEN = /(?:^|& )(?:readonly )?(?:NoInfer<)?Forbidden<"((?:[^"\\]|\\.)*)">>?(?:\[\])?$/;

/**
 * An object type longer than this, where tsc names the type of a value the reader wrote (the type of a literal,
 * not the one it should match), is that literal spelled out: `{ … }` says enough.
 */
const LONG_OBJECT = 40;

/** The text before a quoted type that names the type of the reader's value, not the type it should match. */
const VALUE_TYPE = /(?:^|\. )Type $|Argument of type $|is missing in type $/;

/** tsc's advice to install type definitions or change the library: a world file's fix is never either. */
const SETUP_ADVICE = / Do you need to [^?]*\?.*$/;

/** The fix for a name or member tsc advised installing or a newer library for. */
const SETUP_FIX =
  "remove the code that uses it: world files hold data only (do not edit nuhokai/tsconfig.json, it is CLI-owned)";

/** Generics whose own name says nothing: their type argument stands in their place. */
const TRANSPARENT = new Set(["NoInfer", "Readonly"]);

/** The index just past the string or template literal whose quote is at `start`, past its escapes. */
function pastLiteral(text: string, start: number): number {
  return closedLiteral(text, start) ?? text.length;
}

/**
 * The index just past the literal whose quote is at `start`, or undefined when it never closes: tsc cuts a long
 * type off mid-literal (`"01a...`), and the rest of its message is no literal.
 */
function closedLiteral(text: string, start: number): number | undefined {
  const quote = text[start];
  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === "\\") index++;
    else if (text[index] === quote) return index + 1;
  }
  return undefined;
}

/** The index just past the `close` matching the `open` at `start`; a literal's text holds no bracket of the type. */
function pastMatching(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (char === '"' || char === "`") index = pastLiteral(text, index) - 1;
    else if (char === open) depth++;
    else if (char === close && !(close === ">" && text[index - 1] === "=")) {
      depth--;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}

/**
 * A type as tsc printed it, cut to its names: a generic's arguments dropped (`NodeShape<undefined, {}, …>` →
 * `NodeShape`), but a Forbidden's message kept and a transparent generic replaced by its argument, and an object
 * type intersected onto a named one dropped (`NodeShape & { readonly ports?: {}; }` → `NodeShape`). The world
 * format's generics carry its bookkeeping, which says nothing about the error.
 */
export function shortType(type: string): string {
  let short = "";
  for (let index = 0; index < type.length; ) {
    const name = /^[A-Za-z_$][\w$]*</.exec(type.slice(index));
    if (name === null) {
      const char = type[index] ?? "";
      if (char === '"' || char === "`") {
        const end = pastLiteral(type, index);
        short += type.slice(index, end);
        index = end;
        continue;
      }
      short += char;
      index++;
      continue;
    }
    const identifier = name[0].slice(0, -1);
    const end = pastMatching(type, index + identifier.length, "<", ">");
    // tsc cut the type off inside this generic's arguments: the name, and that it goes on.
    if (end === type.length && !type.endsWith(">")) short += `${identifier}<…>`;
    else if (identifier === "Forbidden") short += type.slice(index, end);
    else if (TRANSPARENT.has(identifier)) short += shortType(type.slice(index + identifier.length + 1, end - 1));
    else short += identifier;
    index = end;
  }
  // An object type after a named one is the format's per-node constraints, never what the error is about.
  for (let at = short.indexOf(" & {"); at > 0 && /[\w$\]>)]$/.test(short.slice(0, at)); at = short.indexOf(" & {")) {
    short = short.slice(0, at) + short.slice(pastMatching(short, at + 3, "{", "}"));
  }
  return short;
}

/**
 * A message cut at the types tsc quoted in it: text outside quotes and each quoted text in turn, starting outside.
 * A quote ends only outside the string and template literals inside it, so `'{ purpose: "the user's" }'` is one type.
 */
function quotedParts(message: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < message.length; index++) {
    const char = message[index];
    const literalEnd = quoted && (char === '"' || char === "`") ? closedLiteral(message, index) : undefined;
    if (literalEnd !== undefined) index = literalEnd - 1;
    else if (char === "'") {
      // An apostrophe in tsc's prose ("can't") opens no type.
      if (!quoted && /\p{L}/u.test(message[index - 1] ?? "") && /\p{L}/u.test(message[index + 1] ?? "")) continue;
      parts.push(message.slice(start, index));
      start = index + 1;
      quoted = !quoted;
    }
  }
  parts.push(message.slice(start));
  // A quote never closed opens no type either: it is text, with its quote.
  if (quoted) {
    const open = parts.pop() ?? "";
    parts.push(`${parts.pop() ?? ""}'${open}`);
  }
  return parts;
}

/** The Forbidden messages the types quoted in a message are about. */
function forbiddenIn(message: string): string[] {
  return quotedParts(message)
    .filter((_part, index) => index % 2 === 1)
    .flatMap((type) => FORBIDDEN.exec(type)?.[1] ?? []);
}

/**
 * Every type tsc quoted in a message, cut to its names, and the long object type of a value the reader wrote to
 * `{ … }`; a quoted type without a generic stays as it is.
 */
function shortTypes(message: string): string {
  return quotedParts(message)
    .map((part, index, parts) => {
      if (index % 2 === 0) return part;
      const valueType = VALUE_TYPE.test(parts[index - 1] ?? "");
      if (valueType && part.startsWith("{") && part.length > LONG_OBJECT) return "'{ … }'";
      return `'${part.includes("<") ? shortType(part) : part}'`;
    })
    .join("");
}

/**
 * What a tsc error says, as one rule and the fix when there is one. An error about a `Forbidden<"…">` is its message
 * alone, as the world format wrote it for the reader (TypeCheck R4); otherwise each message of the chain with its
 * types cut to their names, and tsc's advice to install types or change the library replaced by the world's fix.
 */
export function readTscError(messages: readonly string[]): { rule: string; fix?: string; formatMessage?: true } {
  const forbidden = [...new Set(messages.flatMap(forbiddenIn))];
  if (forbidden.length > 0) {
    return { rule: forbidden.map((text) => (text ?? "").replace(/\\(.)/g, "$1")).join("; "), formatMessage: true };
  }
  const advised = messages.some((message) => SETUP_ADVICE.test(message));
  const rule = messages.map((message) => shortTypes(message.replace(SETUP_ADVICE, ""))).join(" ");
  // The fix follows after "; ", so the rule's own closing period goes.
  return advised ? { rule: rule.replace(/\.$/, ""), fix: SETUP_FIX } : { rule };
}
