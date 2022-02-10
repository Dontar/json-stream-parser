import fs, {promises as afs} from "fs";
import stream, {promises as astream} from "stream";

const source = fs.createReadStream("./MOCK_DATA.json");
source.

const destMain = fs.createWriteStream("./destMain.json");
const destSecondary = fs.createWriteStream("./destSecondary.json");

function join(...writeStreams: stream.Writable[]) {
    return new stream.Writable({
        write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
            for (const stream of writeStreams) {
                stream.write(chunk, encoding);
            }
            callback();
        }
    });
}

source.pipe(join(destMain, destSecondary));