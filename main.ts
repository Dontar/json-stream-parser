import Json from "./jsonparse";
import fs from "fs";

const file = fs.createReadStream(process.cwd() + "/MOCK_DATA.json", "utf-8");
const json = new Json();
json.onValue = (val) => {
    if (typeof val == "object" && !Array.isArray(val)) {
        console.info(val, typeof val);
    }
}

(async () => {
    for await (const chunk of file) {
        console.log(typeof chunk);
        json.write(chunk);
    }

})().then(() => process.exit()).catch(console.error);
