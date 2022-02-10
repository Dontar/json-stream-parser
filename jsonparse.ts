// Named constants with unique integer values
enum ParserState {
  LEFT_BRACE = 0x1,
  RIGHT_BRACE = 0x2,
  LEFT_BRACKET = 0x3,
  RIGHT_BRACKET = 0x4,
  COLON = 0x5,
  COMMA = 0x6,
  TRUE = 0x7,
  FALSE = 0x8,
  NULL = 0x9,
  STRING = 0xa,
  NUMBER = 0xb,
  VALUE = 0x71,
  KEY = 0x72,
}

// Tokenizer States
enum TokenizerState {
  START = 0x11,
  STOP = 0x12,
  TRUE1 = 0x21,
  TRUE2 = 0x22,
  TRUE3 = 0x23,
  FALSE1 = 0x31,
  FALSE2 = 0x32,
  FALSE3 = 0x33,
  FALSE4 = 0x34,
  NULL1 = 0x41,
  NULL2 = 0x42,
  NULL3 = 0x43,
  NUMBER1 = 0x51,
  NUMBER3 = 0x53,
  STRING1 = 0x61,
  STRING2 = 0x62,
  STRING3 = 0x63,
  STRING4 = 0x64,
  STRING5 = 0x65,
  STRING6 = 0x66,

}


// Parser Modes
export enum ParserMode {
  OBJECT = 0x81,
  ARRAY = 0x82,
}

// Character constants
enum CharacterConstant {
  BACK_SLASH = "\\".charCodeAt(0),
  FORWARD_SLASH = "\/".charCodeAt(0),
  BACKSPACE = "\b".charCodeAt(0),
  FORM_FEED = "\f".charCodeAt(0),
  NEWLINE = "\n".charCodeAt(0),
  CARRIAGE_RETURN = "\r".charCodeAt(0),
  TAB = "\t".charCodeAt(0),

}
const STRING_BUFFER_SIZE = 64 * 1024

export type Stack = { value: unknown, key?: string | number, mode?: ParserMode };

export default class JSONStreamParser {
  private tState: TokenizerState;
  private value: any;
  private string?: string;
  private stringBuffer: Uint8Array;
  private stringBufferOffset: number;
  private unicode?: string;
  private highSurrogate?: number;
  private key?: string | number;
  private mode: ParserMode | undefined;
  private stack: Stack[];
  private state: ParserState;
  private bytes_remaining: number;
  private bytes_in_sequence: number;
  private temp_buffs: Record<2 | 3 | 4 | number, Uint8Array>;

  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  constructor() {
    this.tState = TokenizerState.START;
    this.value = undefined;

    this.string = undefined; // string data
    this.stringBuffer = new Uint8Array(STRING_BUFFER_SIZE);
    this.stringBufferOffset = 0;
    this.unicode = undefined; // unicode escapes
    this.highSurrogate = undefined;

    this.key = undefined;
    this.mode = undefined;
    this.stack = [];
    this.state = ParserState.VALUE;
    this.bytes_remaining = 0; // number of bytes remaining in multi byte utf8 char to read after split boundary
    this.bytes_in_sequence = 0; // bytes in multi byte utf8 char to read
    this.temp_buffs = { "2": new Uint8Array(2), "3": new Uint8Array(3), "4": new Uint8Array(4) }; // for rebuilding chars split before boundary is reached

  }
  // Slow code to string converter (only used when throwing syntax errors)
  static toknam(code: number) {
    // var keys = Object.keys(C);
    // if (keys.includes(C[code])) {
    //   return C[code];
    // }
    return code && ("0x" + code.toString(16));
  }

  onError(err: unknown) { throw err; }

  private charError(buffer: Uint8Array, i: number) {
    this.tState = TokenizerState.STOP;
    this.onError(new Error("Unexpected " + JSON.stringify(String.fromCharCode(buffer[i])) + " at position " + i + " in state " + JSONStreamParser.toknam(this.tState)));
  }

  private appendStringChar(char: number) {
    if (this.stringBufferOffset >= STRING_BUFFER_SIZE) {
      this.string += this.decoder.decode(this.stringBuffer.buffer);
      this.stringBufferOffset = 0;
    }

    this.stringBuffer[this.stringBufferOffset++] = char;
  }

  private appendStringBuf(buf: Uint8Array, start?: number, end?: number) {
    var size = buf.length;
    if (typeof start === 'number') {
      if (typeof end === 'number') {
        if (end < 0) {
          // adding a negative end decreeses the size
          size = buf.length - start + end;
        } else {
          size = end - start;
        }
      } else {
        size = buf.length - start;
      }
    }

    if (size < 0) {
      size = 0;
    }

    if (this.stringBufferOffset + size > STRING_BUFFER_SIZE) {
      this.string += this.decoder.decode(this.stringBuffer.slice(0, this.stringBufferOffset))
      this.stringBufferOffset = 0;
    }

    this.stringBuffer.set(buf.slice(start, end), this.stringBufferOffset);
    this.stringBufferOffset += size;
  }

  write(buffer: string | Uint8Array) {
    if (typeof buffer === "string") buffer = this.encoder.encode(buffer);
    let n;
    for (let i = 0, l = buffer.length; i < l; i++) {
      if (this.tState === TokenizerState.START) {
        n = buffer[i];

        switch (true) {
          case n === 0x7b:
            this.onToken(ParserState.LEFT_BRACE, "{"); // {
            break;
          case n === 0x7d:
            this.onToken(ParserState.RIGHT_BRACE, "}"); // }
            break;
          case n === 0x5b:
            this.onToken(ParserState.LEFT_BRACKET, "["); // [
            break;
          case n === 0x5d:
            this.onToken(ParserState.RIGHT_BRACKET, "]"); // ]
            break;
          case n === 0x3a:
            this.onToken(ParserState.COLON, ":");  // :
            break;
          case n === 0x2c:
            this.onToken(ParserState.COMMA, ","); // ,
            break;
          case n === 0x74:
            this.tState = TokenizerState.TRUE1;  // t
            break;
          case n === 0x66:
            this.tState = TokenizerState.FALSE1;  // f
            break;
          case n === 0x6e:
            this.tState = TokenizerState.NULL1; // n
            break;
          case n === 0x22: // "
            this.string = "";
            this.stringBufferOffset = 0;
            this.tState = TokenizerState.STRING1;
            break;
          case n === 0x2d:
            this.string = "-"; this.tState = TokenizerState.NUMBER1; // -
            break;
          default:
            if (n >= 0x30 && n < 0x40) { // 1-9
              this.string = String.fromCharCode(n); this.tState = TokenizerState.NUMBER3;
            } else if (n === 0x20 || n === 0x09 || n === 0x0a || n === 0x0d) {
              // whitespace
            } else {
              return this.charError(buffer, i);
            }
            break
        }

      } else if (this.tState === TokenizerState.STRING1) { // After open quote
        n = buffer[i]; // get current byte from buffer
        // check for carry over of a multi byte char split between data chunks
        // & fill temp buffer it with start of this data chunk up to the boundary limit set in the last iteration
        if (this.bytes_remaining > 0) {
          for (var j = 0; j < this.bytes_remaining; j++) {
            this.temp_buffs[this.bytes_in_sequence][this.bytes_in_sequence - this.bytes_remaining + j] = buffer[j];
          }

          this.appendStringBuf(this.temp_buffs[this.bytes_in_sequence]);
          this.bytes_in_sequence = this.bytes_remaining = 0;
          i = i + j - 1;
        } else if (this.bytes_remaining === 0 && n >= 128) { // else if no remainder bytes carried over, parse multi byte (>=128) chars one at a time
          if (n <= 193 || n > 244) {
            return this.onError(new Error("Invalid UTF-8 character at position " + i + " in state " + JSONStreamParser.toknam(this.tState)));
          }
          if ((n >= 194) && (n <= 223)) this.bytes_in_sequence = 2;
          if ((n >= 224) && (n <= 239)) this.bytes_in_sequence = 3;
          if ((n >= 240) && (n <= 244)) this.bytes_in_sequence = 4;
          if ((this.bytes_in_sequence + i) > buffer.length) { // if bytes needed to complete char fall outside buffer length, we have a boundary split
            for (var k = 0; k <= (buffer.length - 1 - i); k++) {
              this.temp_buffs[this.bytes_in_sequence][k] = buffer[i + k]; // fill temp buffer of correct size with bytes available in this chunk
            }
            this.bytes_remaining = (i + this.bytes_in_sequence) - buffer.length;
            i = buffer.length - 1;
          } else {
            this.appendStringBuf(buffer, i, i + this.bytes_in_sequence);
            i = i + this.bytes_in_sequence - 1;
          }
        } else if (n === 0x22) {
          this.tState = TokenizerState.START;
          this.string += this.decoder.decode(this.stringBuffer.slice(0, this.stringBufferOffset));
          this.stringBufferOffset = 0;
          this.onToken(ParserState.STRING, this.string);
          this.string = undefined;
        }
        else if (n === 0x5c) {
          this.tState = TokenizerState.STRING2;
        }
        else if (n >= 0x20) { this.appendStringChar(n); }
        else {
          return this.charError(buffer, i);
        }
      } else if (this.tState === TokenizerState.STRING2) { // After backslash
        n = buffer[i];
        if (n === 0x22) {
          this.appendStringChar(n); this.tState = TokenizerState.STRING1;
        } else if (n === 0x5c) {
          this.appendStringChar(CharacterConstant.BACK_SLASH); this.tState = TokenizerState.STRING1;
        } else if (n === 0x2f) {
          this.appendStringChar(CharacterConstant.FORWARD_SLASH); this.tState = TokenizerState.STRING1;
        } else if (n === 0x62) {
          this.appendStringChar(CharacterConstant.BACKSPACE); this.tState = TokenizerState.STRING1;
        } else if (n === 0x66) {
          this.appendStringChar(CharacterConstant.FORM_FEED); this.tState = TokenizerState.STRING1;
        } else if (n === 0x6e) {
          this.appendStringChar(CharacterConstant.NEWLINE); this.tState = TokenizerState.STRING1;
        } else if (n === 0x72) {
          this.appendStringChar(CharacterConstant.CARRIAGE_RETURN); this.tState = TokenizerState.STRING1;
        } else if (n === 0x74) {
          this.appendStringChar(CharacterConstant.TAB); this.tState = TokenizerState.STRING1;
        } else if (n === 0x75) {
          this.unicode = ""; this.tState = TokenizerState.STRING3;
        } else {
          return this.charError(buffer, i);
        }
      } else if (TokenizerState.STRING3 >= this.tState && this.state <= TokenizerState.STRING6) { // unicode hex codes
        n = buffer[i];
        // 0-9 A-F a-f
        if ((n >= 0x30 && n < 0x40) || (n > 0x40 && n <= 0x46) || (n > 0x60 && n <= 0x66)) {
          this.unicode += String.fromCharCode(n);
          if (this.tState++ === TokenizerState.STRING6) {
            var intVal = parseInt(this.unicode!, 16);
            this.unicode = undefined;
            if (this.highSurrogate !== undefined && intVal >= 0xDC00 && intVal < (0xDFFF + 1)) { //<56320,57343> - lowSurrogate
              this.appendStringBuf(Uint8Array.of(this.highSurrogate, intVal));
              this.highSurrogate = undefined;
            } else if (this.highSurrogate === undefined && intVal >= 0xD800 && intVal < (0xDBFF + 1)) { //<55296,56319> - highSurrogate
              this.highSurrogate = intVal;
            } else {
              if (this.highSurrogate !== undefined) {
                this.appendStringBuf(Uint8Array.of(this.highSurrogate));
                this.highSurrogate = undefined;
              }
              this.appendStringBuf(Uint8Array.of(intVal));
            }
            this.tState = TokenizerState.STRING1;
          }
        } else {
          return this.charError(buffer, i);
        }
      } else if (this.tState === TokenizerState.NUMBER1 || this.tState === TokenizerState.NUMBER3) {
        n = buffer[i];

        switch (n) {
          case 0x30: // 0
          case 0x31: // 1
          case 0x32: // 2
          case 0x33: // 3
          case 0x34: // 4
          case 0x35: // 5
          case 0x36: // 6
          case 0x37: // 7
          case 0x38: // 8
          case 0x39: // 9
          case 0x2e: // .
          case 0x65: // e
          case 0x45: // E
          case 0x2b: // +
          case 0x2d: // -
            this.string += String.fromCharCode(n);
            this.tState = TokenizerState.NUMBER3;
            break;
          default:
            this.tState = TokenizerState.START;
            var result = Number(this.string);

            if (isNaN(result)) {
              return this.charError(buffer, i);
            }

            if (/[0-9]+/.test(this.string!) && (result.toString() != this.string)) {
              // Long string of digits which is an ID string and not valid and/or safe JavaScript integer Number
              this.onToken(ParserState.STRING, this.string);
            } else {
              this.onToken(ParserState.NUMBER, result);
            }

            this.string = undefined;
            i--;
            break;
        }
      } else if (this.tState === TokenizerState.TRUE1) { // r
        if (buffer[i] === 0x72) { this.tState = TokenizerState.TRUE2; }
        else { return this.charError(buffer, i); }
      } else if (this.tState === TokenizerState.TRUE2) { // u
        if (buffer[i] === 0x75) { this.tState = TokenizerState.TRUE3; }
        else { return this.charError(buffer, i); }
      } else if (this.tState === TokenizerState.TRUE3) { // e
        if (buffer[i] === 0x65) { this.tState = TokenizerState.START; this.onToken(ParserState.TRUE, true); }
        else { return this.charError(buffer, i); }
      } else if (this.tState === TokenizerState.FALSE1) { // a
        if (buffer[i] === 0x61) { this.tState = TokenizerState.FALSE2; }
        else { return this.charError(buffer, i); }
      } else if (this.tState === TokenizerState.FALSE2) { // l
        if (buffer[i] === 0x6c) { this.tState = TokenizerState.FALSE3; }
        else { return this.charError(buffer, i); }
      } else if (this.tState === TokenizerState.FALSE3) { // s
        if (buffer[i] === 0x73) { this.tState = TokenizerState.FALSE4; }
        else { return this.charError(buffer, i); }
      } else if (this.tState === TokenizerState.FALSE4) { // e
        if (buffer[i] === 0x65) { this.tState = TokenizerState.START; this.onToken(ParserState.FALSE, false); }
        else { return this.charError(buffer, i); }
      } else if (this.tState === TokenizerState.NULL1) { // u
        if (buffer[i] === 0x75) { this.tState = TokenizerState.NULL2; }
        else { return this.charError(buffer, i); }
      } else if (this.tState === TokenizerState.NULL2) { // l
        if (buffer[i] === 0x6c) { this.tState = TokenizerState.NULL3; }
        else { return this.charError(buffer, i); }
      } else if (this.tState === TokenizerState.NULL3) { // l
        if (buffer[i] === 0x6c) { this.tState = TokenizerState.START; this.onToken(ParserState.NULL, null); }
        else { return this.charError(buffer, i); }
      }
    }
  }

  private parseError(token: number, value: unknown) {
    this.tState = TokenizerState.STOP;
    this.onError(new Error("Unexpected " + JSONStreamParser.toknam(token) + (value ? ("(" + JSON.stringify(value) + ")") : "") + " in state " + JSONStreamParser.toknam(this.state)));
  }

  private push() {
    this.stack.push({ value: this.value, key: this.key!, mode: this.mode! });
  }

  private pop() {
    const value = this.value;
    const parent = this.stack.pop()!;
    this.value = parent.value;
    this.key = parent.key;
    this.mode = parent.mode;
    this.emit(value, [parent]);
    if (!this.mode) { this.state = ParserState.VALUE; }
  }

  private emit(value: unknown, stack: Stack[] = []) {
    if (this.mode) { this.state = ParserState.COMMA; }
    this.onValue(value, [...this.stack, ...stack]);
  }

  onValue(value: unknown, stack: Stack[]) {
    // Override me
  }

  private onToken(token: ParserState, value: unknown) {
    if (this.state === ParserState.VALUE) {
      switch (true) {
        case token >= ParserState.TRUE:
          if (this.value) {
            this.value[this.key!] = value;
          }
          this.emit(value, [{ value: this.value, key: this.key, mode: this.mode }]);
          break;
        case token === ParserState.LEFT_BRACE:
          this.push();
          if (this.value) {
            this.value = this.value[this.key!] = {};
          } else {
            this.value = {};
          }
          this.key = undefined;
          this.state = ParserState.KEY;
          this.mode = ParserMode.OBJECT;
          break;
        case token === ParserState.LEFT_BRACKET:
          this.push();
          if (this.value) {
            this.value = this.value[this.key!] = [];
          } else {
            this.value = [];
          }
          this.key = 0;
          this.mode = ParserMode.ARRAY;
          this.state = ParserState.VALUE;
          break;
        case this.mode === ParserMode.OBJECT:
          this.pop();
          // if (this.mode === ParserMode.OBJECT) {
          // } else {
          //   return this.parseError(token, value);
          // }
          break;
        case this.mode === ParserMode.ARRAY:
          this.pop();
          // if (this.mode === ParserMode.ARRAY) {
          // } else {
          //   return this.parseError(token, value);
          // }
          break;
        default:
          return this.parseError(token, value);
      }
    } else if (this.state === ParserState.KEY) {
      if (token === ParserState.STRING) {
        this.key = value as any;
        this.state = ParserState.COLON;
      } else if (token === ParserState.RIGHT_BRACE) {
        this.pop();
      } else {
        return this.parseError(token, value);
      }
    } else if (this.state === ParserState.COLON) {
      if (token === ParserState.COLON) { this.state = ParserState.VALUE; }
      else { return this.parseError(token, value); }
    } else if (this.state === ParserState.COMMA) {
      if (token === ParserState.COMMA) {
        if (this.mode === ParserMode.ARRAY) { (this.key as number)++; this.state = ParserState.VALUE; }
        else if (this.mode === ParserMode.OBJECT) { this.state = ParserState.KEY; }

      } else if (token === ParserState.RIGHT_BRACKET && this.mode === ParserMode.ARRAY || token === ParserState.RIGHT_BRACE && this.mode === ParserMode.OBJECT) {
        this.pop();
      } else {
        return this.parseError(token, value);
      }
    } else {
      return this.parseError(token, value);
    }
  }
}
