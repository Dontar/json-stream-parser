import Json, { ParserMode } from "./jsonparse";
import fs from "fs";

const file = fs.createReadStream(process.cwd() + "/MOCK_DATA1.json", "utf-8");
const json = new Json();
json.onValue = (val, stack) => {
  let result;
  if (stack.length <= 3) {
    const last = stack.length - 1;
    const parent = stack[last - 1];
    const current = stack[last];
    if (parent && typeof parent.key === "string") {
      result = { [parent.key]: current.mode === ParserMode.ARRAY ? [val] : val };
    } else if (typeof current.key === "string" && typeof val !== "object") {
      result = { [current.key]: current.mode === ParserMode.ARRAY ? [val] : val };
    }
    //  else {
    //   result = current.mode === ParserMode.ARRAY ? [val] : val;
    // }
    // if (typeof val === "object" && !Array.isArray(val)) {
    // } else {
    //   result = val;
    // }

    // console.log({
    //   current: [
    //     "current",
    //     typeof current.value,
    //     current.key, ParserMode[current.mode!],
    //     typeof parent?.value
    //   ],
    //   parent: [
    //     "parent",
    //     parent?.key,
    //     ParserMode[current?.mode!],
    //   ],
    //   root: [
    //     "root",
    //     stack[last - 2]?.key,
    //     ParserMode[stack[last - 2]?.mode!]

    //   ]
    // },
    //   typeof val
    // );
    console.log(result);
  }
}

(async () => {
  for await (const chunk of file) {
    json.write(chunk);
  }

})().then(() => process.exit()).catch(console.error);
